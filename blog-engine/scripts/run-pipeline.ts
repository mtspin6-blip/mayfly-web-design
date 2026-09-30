// The weekly job: decide whether to publish now, then brief -> draft -> humanize -> editor loop -> fact-check -> gates -> publish.
// Flags: --dry-run (everything except commit), --now (ignore the day/slot/jitter check; caps still apply), --no-site (skip build/Lighthouse)
import { loadConfig } from '../lib/config.js';
import { Budget, BudgetExceeded, UsageLimit } from '../lib/claude.js';
import { loadBacklog, saveBacklog, loadPublished, loadHealth, saveHealth } from '../lib/state.js';
import { loadPosts } from '../lib/post.js';
import { decide } from '../lib/schedule.js';
import { normalizeKeyword } from '../lib/text.js';
import { arg, gateContext } from '../lib/pipeline.js';
import { pickTopic } from './pick-topic.js';
import { makeBrief, writeDraft } from './draft-post.js';
import { humanize } from './humanize.js';
import { editorLoop } from './editor-loop.js';
import { factCheck } from './fact-check.js';
import { runAllGates } from './quality-gate.js';
import { publish } from './publish.js';
import type { PageFetch } from '../lib/http.js';
import { enginePath, writeJson } from '../lib/paths.js';

export interface RunResult { published?: string; reason: string; ok: boolean }

export async function runPipeline(o: { dryRun: boolean; now: boolean; site: boolean; date?: Date; fetcher?: (u: string) => Promise<PageFetch> }): Promise<RunResult> {
  const cfg = loadConfig();
  const health = loadHealth();
  const when = o.date ?? new Date();
  const d = decide({ now: when, cfg, health, log: loadPublished(), ignoreSlot: o.now });
  console.log(`schedule: ${d.reason}`);
  if (!d.publish && !(o.dryRun && o.now)) return { ok: true, reason: d.reason };
  if (d.nextPublishAt && !o.dryRun) health.nextPublishAt = d.nextPublishAt;

  const budget = new Budget(cfg);
  const slotKey = d.nextPublishAt?.slot ?? 'manual';
  const skip: string[] = [];
  let lastFailure = 'no eligible topic in backlog';

  for (let attempt = 1; attempt <= cfg.gates.maxTopicTriesPerRun; attempt++) {
    const ctx = gateContext(cfg);
    const usedKeywords = [...ctx.existing.map((p) => p.fm.primaryKeyword ?? ''), ...ctx.published.map((p) => p.keyword)];
    const pick = pickTopic({ cfg, backlog: loadBacklog(), published: ctx.published, usedKeywords, skip });
    if (!pick) break;
    const { item, format } = pick;
    console.log(`\n[try ${attempt}/${cfg.gates.maxTopicTriesPerRun}] "${item.keyword}" (${item.pillar}, ${format}, score ${item.score})`);
    try {
      const posts = loadPosts();
      const dc = { cfg, budget, item, format, existing: posts, recentCtas: posts.map((p) => p.fm.cta ?? '').filter(Boolean).slice(-6), knownPaths: ctx.knownPaths };
      const brief = await makeBrief(dc);
      let post = await writeDraft({ ...dc, brief });
      const h = await humanize(post, cfg, budget);
      console.log(`humanize: ${h.note}`);
      post = h.post;

      const loop = await editorLoop({ post, brief, item, format, cfg, budget, ctx });
      loop.log.forEach((l) => console.log(l));
      if (!loop.ok) throw new Error(`editor loop failed: ${loop.log.at(-1)}`);
      post = loop.post;

      const fc = await factCheck(post, cfg, budget, o.fetcher);
      console.log(`fact-check: ${fc.report.checked} claims, ${fc.report.deadLinks.length} dead links, ${fc.report.rewrites} rewrite(s), ok=${fc.report.ok}`);
      if (!fc.report.ok) throw new Error(`fact-check failed: unsupported claims remain (${fc.report.unsupported.slice(0, 2).join(' / ')})`);
      post = fc.post;

      const gates = await runAllGates(post, ctx, loop.scores, { site: o.site, keepOnSuccess: !o.dryRun });
      console.log(gates.text);
      if (!gates.ok) throw new Error(`gates failed: ${gates.results.filter((g) => !g.ok).map((g) => `${g.id} (${g.detail})`).join('; ')}`);

      const res = publish({ post, scores: loop.scores, gateText: gates.text, item, cfg, dryRun: o.dryRun });
      if (!o.dryRun) {
        writeJson(enginePath('data/last-run.json'), { published: res.slug, at: new Date().toISOString() });
        health.launchDate ??= new Date().toISOString();
        health.runs.push({ at: new Date().toISOString(), ok: true, reason: `slot ${slotKey} published ${res.slug}` });
        saveHealth(health);
      }
      console.log(`usage: ${budget.runCalls} model calls, ${budget.runTokens} tokens, ${budget.searches} searches`);
      return { ok: true, published: res.slug, reason: `published ${res.slug}` };
    } catch (e) {
      lastFailure = (e as Error).message;
      console.error(`rejected "${item.keyword}": ${lastFailure}`);
      if (e instanceof BudgetExceeded) { lastFailure = `${e instanceof UsageLimit ? 'usage-limit' : 'budget'}: ${lastFailure}`; break; }
      skip.push(item.keyword);
      if (!o.dryRun) {
        const backlog = loadBacklog();
        const b = backlog.find((x) => normalizeKeyword(x.keyword) === normalizeKeyword(item.keyword));
        if (b) { b.status = 'rejected'; b.rejectedReason = lastFailure.slice(0, 300); b.rejectedAt = new Date().toISOString(); saveBacklog(backlog); }
      }
    }
  }
  if (!o.dryRun) {
    const limited = lastFailure.startsWith('usage-limit');
    health.runs.push({ at: new Date().toISOString(), ok: false, reason: `slot ${slotKey} ${limited ? 'usage-limit' : 'failed'}: ${lastFailure.slice(0, 200)}` });
    health.runs = health.runs.slice(-60);
    saveHealth(health);
  }
  return { ok: false, reason: lastFailure };
}

if (process.argv[1]?.endsWith('run-pipeline.ts')) {
  runPipeline({ dryRun: arg('dry-run'), now: arg('now'), site: !arg('no-site') })
    .then((r) => { console.log(r.published ? `\nDONE: ${r.reason}` : `\nNO POST: ${r.reason}`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
