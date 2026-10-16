// The writer: keeps QUEUE_TARGET finished, gate-passing posts in blog-engine/queue/. It never publishes.
// brief -> draft -> humanize -> editor repair -> (fact-check + deterministic gates + targeted fix passes) -> site checks -> queue.
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../lib/config.js';
import { Budget, BudgetExceeded, UsageLimit } from '../lib/claude.js';
import { loadBacklog, saveBacklog, loadPublished } from '../lib/state.js';
import { loadPosts, serializePost } from '../lib/post.js';
import { normalizeKeyword } from '../lib/text.js';
import { knownPaths } from '../lib/pipeline.js';
import { enginePath } from '../lib/paths.js';
import { listQueue, enqueue, queuedAsPublished, QUEUE_TARGET, type QueueItem } from '../lib/queue.js';
import { summarize, type GateContext } from '../lib/gates.js';
import { pickTopic } from './pick-topic.js';
import { makeBrief, writeDraft } from './draft-post.js';
import { humanize } from './humanize.js';
import { repairDraft, RejectedDraft } from './editor-loop.js';
import { runAllGates } from './quality-gate.js';
import type { PageFetch } from '../lib/http.js';

export interface WriteResult { queued: string[]; setAside: { keyword: string; reason: string }[]; stopped?: string; items: QueueItem[] }

/** Gate context that knows about queued posts (for duplicate/variety checks) but only links to pages that are actually live. */
export function writerContext(cfg: Config, queue: QueueItem[]): GateContext {
  const live = loadPosts().filter((p) => !p.fm.draft);
  return {
    cfg,
    existing: [...live, ...queue.map((q) => q.post)],
    published: [...loadPublished(), ...queuedAsPublished(queue)],
    knownPaths: knownPaths(cfg, live),
  };
}

export async function fillQueue(o: { cfg: Config; budget: Budget; dryRun: boolean; site: boolean; target?: number; fetcher?: (u: string) => Promise<PageFetch>; virtual?: QueueItem[] }): Promise<WriteResult> {
  const { cfg, budget } = o;
  const target = o.target ?? QUEUE_TARGET;
  const result: WriteResult = { queued: [], setAside: [], items: [] };
  const skip: string[] = [];
  const have = () => [...listQueue(), ...result.items.filter((i) => o.dryRun)];

  for (let attempt = 1; attempt <= cfg.gates.maxTopicTriesPerRun && have().length < target; attempt++) {
    const queue = have();
    const ctx = writerContext(cfg, queue);
    const used = [...ctx.existing.map((p) => p.fm.primaryKeyword ?? ''), ...ctx.published.map((p) => p.keyword)];
    const pick = pickTopic({ cfg, backlog: loadBacklog(), published: ctx.published, usedKeywords: used, skip });
    if (!pick) { result.stopped = 'no eligible topic in backlog'; break; }
    const { item, format } = pick;
    console.log(`\n[write ${attempt}/${cfg.gates.maxTopicTriesPerRun}] "${item.keyword}" (${item.pillar}, ${format}, score ${item.score}); queue has ${queue.length}/${target}`);
    try {
      const posts = loadPosts();
      const dc = { cfg, budget, item, format, existing: posts, recentCtas: posts.map((p) => p.fm.cta ?? '').filter(Boolean).slice(-6), knownPaths: ctx.knownPaths };
      const brief = await makeBrief(dc);
      let post = await writeDraft({ ...dc, brief });
      const h = await humanize(post, cfg, budget);
      console.log(`humanize: ${h.note}`);
      post = h.post;

      const rep = await repairDraft({ post, cfg, item, format, brief, budget, ctx, fetcher: o.fetcher });
      rep.log.forEach((l) => console.log(l));
      post = rep.post;

      const gates = await runAllGates(post, ctx, { site: o.site, keepOnSuccess: false });
      console.log(gates.text);
      if (!gates.ok) throw new RejectedDraft(`gates failed: ${gates.results.filter((g) => !g.ok).map((g) => `${g.id} (${g.detail})`).join('; ')}`, post, `${gates.text}\n\n${rep.log.join('\n')}`);

      const entry: QueueItem = {
        post,
        meta: { slug: post.slug, keyword: item.keyword, pillar: item.pillar, format, queuedAt: new Date().toISOString(), gateText: gates.text, scores: rep.scores },
      };
      result.queued.push(post.slug);
      result.items.push(entry);
      if (o.dryRun) console.log(`[dry-run] would queue "${post.fm.title}" (${post.slug})`);
      else {
        enqueue(entry);
        const backlog = loadBacklog();
        const b = backlog.find((x) => normalizeKeyword(x.keyword) === normalizeKeyword(item.keyword));
        if (b) { b.status = 'queued'; saveBacklog(backlog); }
        console.log(`queued "${post.fm.title}" (${post.slug})`);
      }
    } catch (e) {
      const reason = (e as Error).message;
      if (e instanceof BudgetExceeded) { result.stopped = `${e instanceof UsageLimit ? 'usage-limit' : 'budget'}: ${reason}`; console.error(result.stopped); break; }
      if (e instanceof RejectedDraft) saveRejected(e);
      console.error(`set aside "${item.keyword}": ${reason}`);
      result.setAside.push({ keyword: item.keyword, reason: reason.slice(0, 300) });
      skip.push(item.keyword);
      if (!o.dryRun) {
        const backlog = loadBacklog();
        const b = backlog.find((x) => normalizeKeyword(x.keyword) === normalizeKeyword(item.keyword));
        if (b) { b.status = 'rejected'; b.rejectedReason = reason.slice(0, 300); b.rejectedAt = new Date().toISOString(); saveBacklog(backlog); }
      }
    }
  }
  return result;
}

export function saveRejected(e: RejectedDraft): void {
  const dir = enginePath('data/rejected');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${e.post.slug}.md`), `<!--\n${e.message}\n${e.report}\n-->\n\n${serializePost(e.post)}`);
  console.log(`saved set-aside draft + report: blog-engine/data/rejected/${e.post.slug}.md`);
}

export { summarize };
