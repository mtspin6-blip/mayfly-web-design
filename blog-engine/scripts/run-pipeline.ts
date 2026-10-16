// The scheduled run. Publishing and writing are separate jobs that share the ready queue (blog-engine/queue/):
//   1. publish   - no model calls. If a post is due, the oldest queued post goes live.
//   2. write     - top the queue back up to 2 finished, gate-passing posts.
//   3. publish   - only if step 1 had nothing to publish (empty queue) and step 2 just wrote something.
// A bad writing day therefore never costs a week: the queue already holds posts. Every run writes data/last-run.json,
// which the workflow turns into the GitHub issue/email and the post-deploy checks.
// Flags: --dry-run (touch nothing on disk), --now (ignore the "last N days" rule; caps still apply), --no-site (skip build/Lighthouse)
import { loadConfig } from '../lib/config.js';
import { Budget } from '../lib/claude.js';
import { loadHealth, saveHealth } from '../lib/state.js';
import { arg } from '../lib/pipeline.js';
import { listQueue, QUEUE_TARGET, type QueueItem } from '../lib/queue.js';
import { enginePath, writeJson } from '../lib/paths.js';
import { publishFromQueue, type PublishOutcome } from './publish.js';
import { fillQueue, type WriteResult } from './write-queue.js';
import type { PageFetch } from '../lib/http.js';

export interface RunSummary {
  at: string; dryRun: boolean; ok: boolean; published?: string; title?: string; publishReason: string; due: boolean;
  queued: string[]; queueSize: number; setAside: { keyword: string; reason: string }[]; stopped?: string; backlinked: string[];
  usage: { calls: number; tokens: number; searches: number };
}

export interface RunResult { published?: string; reason: string; ok: boolean; summary: RunSummary }

export async function runPipeline(o: { dryRun: boolean; now: boolean; site: boolean; queueTarget?: number; date?: Date; fetcher?: (u: string) => Promise<PageFetch> }): Promise<RunResult> {
  const cfg = loadConfig();
  const when = o.date ?? new Date();
  const budget = new Budget(cfg);
  const pubOpts = { dryRun: o.dryRun, now: when, ignoreInterval: o.now, site: o.site };

  let pub: PublishOutcome = publishFromQueue(pubOpts);
  console.log(`publish: ${pub.reason}`);

  // Write only when the queue is short. A paused engine writes nothing.
  let written: WriteResult = { queued: [], setAside: [], items: [] };
  const queueNow = listQueue().length;
  const target = o.queueTarget ?? QUEUE_TARGET;
  if (!cfg.paused && queueNow < target) {
    written = await fillQueue({ cfg, budget, dryRun: o.dryRun, site: o.site, target, fetcher: o.fetcher });
  } else console.log(`write: skipped (${cfg.paused ? 'paused' : `queue already has ${queueNow}`})`);

  // First run, or the queue had run dry: a post may have just been written, so try the publisher again.
  if (!pub.published && pub.due && written.items.length) {
    const virtual: QueueItem[] = o.dryRun ? written.items : [];
    pub = publishFromQueue({ ...pubOpts, virtual });
    console.log(`publish (second look): ${pub.reason}`);
  }

  const duePublishFailed = pub.due && !pub.published;
  if (duePublishFailed && written.stopped) pub = { ...pub, reason: `${pub.reason}; writer stopped: ${written.stopped}` };
  const summary: RunSummary = {
    at: new Date().toISOString(), dryRun: o.dryRun, ok: !duePublishFailed, published: pub.published, title: pub.title, publishReason: pub.reason, due: pub.due,
    queued: written.queued, queueSize: o.dryRun ? queueNow + written.queued.length : listQueue().length,
    setAside: [...written.setAside, ...pub.setAside.map((s) => ({ keyword: s.slug, reason: s.reason }))],
    stopped: written.stopped, backlinked: pub.backlinked,
    usage: { calls: budget.runCalls, tokens: budget.runTokens, searches: budget.searches },
  };
  console.log(`usage: ${budget.runCalls} model calls, ${budget.runTokens} tokens, ${budget.searches} searches`);

  if (!o.dryRun) {
    const health = loadHealth();
    if (pub.published) health.launchDate ??= new Date().toISOString();
    const limited = (written.stopped ?? '').startsWith('usage-limit');
    health.runs.push({ at: summary.at, ok: summary.ok, reason: `${pub.published ? `published ${pub.published}` : pub.reason}; queued ${written.queued.length}; set aside ${summary.setAside.length}${limited ? '; usage-limit' : ''}` });
    health.runs = health.runs.slice(-60);
    saveHealth(health);
  }
  writeJson(enginePath('data/last-run.json'), { ...summary, published: pub.published ?? '' });
  return { ok: summary.ok, published: pub.published, reason: pub.published ? `published ${pub.published}` : pub.reason, summary };
}

if (process.argv[1]?.endsWith('run-pipeline.ts')) {
  runPipeline({ dryRun: arg('dry-run'), now: arg('now'), site: !arg('no-site') })
    .then((r) => { console.log(r.published ? `\nDONE: ${r.reason}` : `\nNO POST: ${r.reason}`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
