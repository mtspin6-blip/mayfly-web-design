// Weekly health check + circuit breaker. Flags: --dry-run (evaluate and print, write nothing), --simulate bad-index
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.js';
import { loadHealth, saveHealth, loadPublished, savePublished } from '../lib/state.js';
import { evaluateHealth, applyActions, type PostIndexStatus, type PostPerf, type HealthInput } from '../lib/health.js';
import { inspectUrl, searchAnalytics, gscConfigured, isoDay, daysAgo } from '../lib/gsc.js';
import { enginePath, writeJson, readJson, BLOG_DIR } from '../lib/paths.js';
import { raiseAlert } from '../lib/alert.js';
import { logAction } from '../lib/actions-log.js';
import { parsePost, serializePost } from '../lib/post.js';
import { arg, argVal } from '../lib/pipeline.js';

const BASE = 'https://mayflywebdesign.com';

export async function gather(now: Date): Promise<Partial<HealthInput> & { notes: string[] }> {
  const published = loadPublished().filter((p) => !p.status || p.status === 'live');
  const notes: string[] = [];
  const indexStatus: PostIndexStatus[] = [];
  const postPerf: PostPerf[] = [];
  let recent: number | undefined, prior: number | undefined;
  if (!gscConfigured()) { notes.push('GSC credentials not set: indexing/impression rules skipped this week'); return { indexStatus, postPerf, notes }; }
  try {
    for (const p of published.slice(-6)) {
      const r = await inspectUrl(`${BASE}/blog/${p.slug}/`);
      indexStatus.push({ slug: p.slug, publishedAt: p.publishedAt, verdict: r?.verdict ?? 'unknown' });
    }
    const tot = async (from: number, to: number) => (await searchAnalytics({ startDate: isoDay(daysAgo(from)), endDate: isoDay(daysAgo(to)), dimensions: [] }))?.[0]?.impressions;
    recent = await tot(16, 2); prior = await tot(30, 17);
    const pages = (await searchAnalytics({ startDate: isoDay(daysAgo(90)), endDate: isoDay(daysAgo(2)), dimensions: ['page'], rowLimit: 500 })) ?? [];
    for (const p of published) {
      const row = pages.find((r) => r.keys[0].includes(`/blog/${p.slug}/`));
      postPerf.push({ slug: p.slug, publishedAt: p.publishedAt, impressions: row?.impressions ?? 0, clicks: row?.clicks ?? 0, ctr: row?.ctr ?? 0, position: row?.position ?? 0 });
    }
  } catch (e) { notes.push(`GSC error: ${(e as Error).message}`); }
  return { indexStatus, postPerf, siteImpressionsTwoWeeks: recent, siteImpressionsPriorTwoWeeks: prior, notes };
}

async function main() {
  const now = new Date();
  const cfg = loadConfig();
  const state = loadHealth();
  const published = loadPublished();
  const g = await gather(now);
  let input: HealthInput = {
    now, cfg, state, published,
    indexStatus: g.indexStatus ?? [], postPerf: g.postPerf ?? [],
    siteImpressionsTwoWeeks: g.siteImpressionsTwoWeeks, siteImpressionsPriorTwoWeeks: g.siteImpressionsPriorTwoWeeks,
    recentRuns: state.runs.filter((r) => r.at.slice(0, 7) === now.toISOString().slice(0, 7)),
  };
  if (argVal('simulate') === 'bad-index') {
    const mk = (slug: string, age: number, verdict: 'indexed' | 'not-indexed') => ({ slug, publishedAt: new Date(now.getTime() - age * 86400000).toISOString(), verdict });
    input = { ...input, indexStatus: [mk('a', 60, 'indexed'), mk('b', 50, 'not-indexed'), mk('c', 40, 'not-indexed'), mk('d', 30, 'indexed'), mk('e', 25, 'not-indexed'), mk('f', 22, 'not-indexed')] };
    g.notes.push('SIMULATED bad index state');
  }
  const actions = evaluateHealth(input);
  const result = applyActions(actions, cfg, state, now);
  console.log(`health: ${actions.map((a) => a.type + ('reason' in a ? ` (${a.reason})` : '')).join('; ')}`);
  g.notes.forEach((n) => console.log('note:', n));
  if (arg('dry-run')) { console.log(`[dry-run] paused would become: ${result.cfg.paused}; alerts: ${result.alerts.join(' | ') || 'none'}`); return; }

  writeJson(enginePath('config.json'), result.cfg);
  result.state.siteImpressionsHistory.push({ at: now.toISOString(), twoWeekImpressions: input.siteImpressionsTwoWeeks ?? 0 });
  result.state.siteImpressionsHistory = result.state.siteImpressionsHistory.slice(-26);
  saveHealth(result.state);

  const queue = readJson<{ slug: string; reason: string }[]>(enginePath('data/refresh-queue.json'), []);
  const log = loadPublished();
  for (const a of actions) {
    if (a.type === 'queue-refresh' && !queue.some((q) => q.slug === a.slug)) { queue.push({ slug: a.slug, reason: a.reason }); logAction('queue-refresh', a.reason, a.slug); }
    if (a.type === 'noindex') {
      const file = path.join(BLOG_DIR, `${a.slug}.md`);
      if (fs.existsSync(file)) {
        const post = parsePost(a.slug, fs.readFileSync(file, 'utf8'));
        post.fm.noindex = true;
        fs.writeFileSync(file, serializePost(post));
        const e = log.find((x) => x.slug === a.slug);
        if (e) e.status = 'noindex';
        logAction('noindex', a.reason, a.slug);
      }
    }
  }
  savePublished(log);
  writeJson(enginePath('data/refresh-queue.json'), queue);
  if (result.paused || result.alerts.length) {
    const out = await raiseAlert(`Blog engine: ${result.paused ? 'publishing paused' : 'cadence reduced'}`, result.alerts);
    out.forEach((l) => console.log(l));
  }
  fs.mkdirSync(path.join(enginePath('..'), 'reports'), { recursive: true });
}

if (process.argv[1]?.endsWith('health-check.ts')) main().catch((e) => { console.error(e); process.exit(1); });
