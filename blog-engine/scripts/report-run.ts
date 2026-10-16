// Tells Mitchell what every run did. Opens a GitHub issue (GitHub emails the repo owner) and writes the job summary.
// Runs that went fine are closed right away so only the ones needing a look stay open. Usage:
//   report-run.ts            summarize data/last-run.json (the normal end-of-run step)
//   report-run.ts --crash    the job itself crashed (called from an `if: failure()` step)
import fs from 'node:fs';
import { enginePath, readJson } from '../lib/paths.js';
import { fetchRetry } from '../lib/http.js';
import { arg } from '../lib/pipeline.js';
import type { RunSummary } from './run-pipeline.js';

export type LastRun = Partial<RunSummary> & { live?: boolean | null; liveUrl?: string; indexing?: string[] };

export interface Report { title: string; body: string; needsAttention: boolean }

/** Pure: turns a run summary into the issue text. Nothing private goes in here: the repo is public. */
export function buildReport(r: LastRun, o: { crash?: boolean; runUrl?: string; dryRun?: boolean } = {}): Report {
  const lines: string[] = [];
  const tag = o.dryRun || r.dryRun ? ' (dry run)' : '';
  let title: string;
  let needsAttention = false;

  if (o.crash) {
    title = 'Blog engine run CRASHED';
    needsAttention = true;
    lines.push('The scheduled job failed before it finished. Nothing was lost: queued posts stay in `blog-engine/queue/` and the next run tries again.');
  } else if (r.published) {
    title = `Blog engine published: ${r.title ?? r.published}${tag}`;
    lines.push(`**Published** "${r.title ?? r.published}" at /blog/${r.published}/.`);
    if (r.live === true) lines.push(`Live check: ${r.liveUrl ?? 'the page'} returned 200 and IndexNow was pinged.`);
    else if (r.live === false) { needsAttention = true; lines.push(`**Live check FAILED**: ${r.liveUrl ?? 'the page'} did not return 200 after 12 minutes. Check the Cloudflare Pages deploy.`); }
    if (r.backlinked?.length) lines.push(`Back-links added to: ${r.backlinked.join(', ')}.`);
  } else if (r.due) {
    title = `Blog engine: a post was due but none went out${tag}`;
    needsAttention = true;
    lines.push(`A post was due and nothing could be published: ${r.publishReason ?? 'unknown reason'}.`);
  } else {
    title = `Blog engine: nothing due${tag}`;
    lines.push(`No post due this run: ${r.publishReason ?? 'not due'}.`);
  }

  if (!o.crash) {
    lines.push(r.queued?.length ? `**Queued ${r.queued.length} new post(s):** ${r.queued.join(', ')}.` : 'Queued: nothing new this run.');
    lines.push(`Ready queue now holds ${r.queueSize ?? '?'} post(s).`);
    if (r.setAside?.length) {
      lines.push('**Set aside:**');
      for (const s of r.setAside) lines.push(`- "${s.keyword}": ${s.reason}`);
    }
    if (r.stopped) { lines.push(`Writer stopped early: ${r.stopped}.`); if (!r.queueSize) needsAttention = true; }
    if (r.usage) lines.push(`Claude usage this run: ${r.usage.calls} calls, ${r.usage.tokens} tokens, ${r.usage.searches} searches.`);
  }
  if (o.runUrl) lines.push(`\n[Full run log](${o.runUrl})`);
  return { title, body: lines.join('\n\n'), needsAttention };
}

async function gh(path: string, method: string, body?: unknown) {
  return fetchRetry(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function postReport(rep: Report, dryRun: boolean): Promise<string> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, `## ${rep.title}\n\n${rep.body}\n`);
  console.log(`${rep.title}\n\n${rep.body}`);
  if (dryRun) return 'dry run: issue not opened';
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) return 'issue skipped (GITHUB_TOKEN/GITHUB_REPOSITORY not set)';
  const res = await gh('/issues', 'POST', { title: rep.title, body: rep.body, labels: ['blog-engine-run', ...(rep.needsAttention ? ['needs-attention'] : [])] });
  if (!res.ok) return `issue failed (${res.status})`;
  const issue = (await res.json()) as { number: number; html_url: string };
  if (!rep.needsAttention) await gh(`/issues/${issue.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' });
  return `opened ${issue.html_url}${rep.needsAttention ? '' : ' (closed: nothing needs you)'}`;
}

if (process.argv[1]?.endsWith('report-run.ts')) {
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
  const last = readJson<LastRun>(enginePath('data/last-run.json'), {});
  const crash = arg('crash');
  const rep = buildReport(last, { crash, runUrl });
  postReport(rep, !crash && last.dryRun === true).then((m) => console.log(m)).catch((e) => { console.error('report failed:', e); process.exit(0); });
}
