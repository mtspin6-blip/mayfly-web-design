// Monthly performance report -> /reports/YYYY-MM.md. Uses real GSC data when credentials exist; otherwise reports
// the baseline export and the published log and says clearly what data was unavailable.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.js';
import { Budget, ask, claudeAvailable } from '../lib/claude.js';
import { loadPublished } from '../lib/state.js';
import { loadPosts } from '../lib/post.js';
import { searchAnalytics, inspectUrl, gscConfigured, isoDay, daysAgo } from '../lib/gsc.js';
import { loadActions } from '../lib/actions-log.js';
import { REPORTS_DIR, enginePath, readJson, writeJson } from '../lib/paths.js';
import { arg } from '../lib/pipeline.js';

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

async function citationCheck(cfg = loadConfig()): Promise<{ lines: string[]; cited: number; total: number } | null> {
  if (!claudeAvailable()) return null;
  const queries = readJson<{ queries: string[] }>(enginePath('data/citation-queries.json'), { queries: [] }).queries.slice(0, 10);
  const budget = new Budget(cfg);
  const lines: string[] = [];
  let cited = 0;
  for (const q of queries) {
    try {
      const text = await ask({
        model: cfg.models.research, budget, effort: 'low', maxTokens: 3000, webSearch: { maxUses: 2 },
        system: 'Answer the question the way a helpful search assistant would, using web search. End with a line "SOURCES:" listing every URL you relied on, one per line.',
        user: q,
      });
      const hit = /mayflywebdesign\.com/i.test(text.split('SOURCES:')[1] ?? text);
      if (hit) cited++;
      lines.push(`| ${q} | ${hit ? 'cited' : 'not cited'} |`);
    } catch (e) { lines.push(`| ${q} | error: ${(e as Error).message.slice(0, 40)} |`); }
  }
  const hist = readJson<{ at: string; cited: number; total: number }[]>(enginePath('data/citations.json'), []);
  hist.push({ at: new Date().toISOString(), cited, total: queries.length });
  writeJson(enginePath('data/citations.json'), hist);
  return { lines, cited, total: queries.length };
}

async function main() {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const out: string[] = [`# Blog report ${month}`, '', `Generated ${now.toISOString()}`, ''];
  const published = loadPublished();
  const posts = loadPosts().filter((p) => !p.fm.draft);

  if (gscConfigured()) {
    try {
      const tot = async (from: number, to: number) => (await searchAnalytics({ startDate: isoDay(daysAgo(from)), endDate: isoDay(daysAgo(to)), dimensions: [] }))?.[0];
      const cur = await tot(30, 2), prev = await tot(58, 31);
      out.push('## Site, last 28 days vs the 28 before', '', '| | Clicks | Impressions | CTR | Avg position |', '|---|---|---|---|---|');
      if (cur) out.push(`| Now | ${cur.clicks} | ${cur.impressions} | ${pct(cur.ctr)} | ${cur.position.toFixed(1)} |`);
      if (prev) out.push(`| Before | ${prev.clicks} | ${prev.impressions} | ${pct(prev.ctr)} | ${prev.position.toFixed(1)} |`);
      const pages = (await searchAnalytics({ startDate: isoDay(daysAgo(30)), endDate: isoDay(daysAgo(2)), dimensions: ['page'], rowLimit: 500 })) ?? [];
      const blog = pages.filter((r) => /\/blog\/[^/]+\/?$/.test(r.keys[0])).sort((a, b) => b.impressions - a.impressions);
      out.push('', '## Top posts', '', '| Post | Impressions | Clicks | CTR | Position |', '|---|---|---|---|---|');
      blog.slice(0, 10).forEach((r) => out.push(`| ${r.keys[0].replace('https://mayflywebdesign.com', '')} | ${r.impressions} | ${r.clicks} | ${pct(r.ctr)} | ${r.position.toFixed(1)} |`));
      let indexed = 0;
      for (const p of posts) { const r = await inspectUrl(`https://mayflywebdesign.com/blog/${p.slug}/`).catch(() => null); if (r?.verdict === 'indexed') indexed++; }
      out.push('', `## Indexing`, '', `${indexed} of ${posts.length} posts indexed (URL Inspection).`);
    } catch (e) { out.push(`> GSC error: ${(e as Error).message}`); }
  } else {
    const base = readJson<{ totals?: Record<string, number> }>(enginePath('data/baseline/prd-queries.json'), {});
    out.push('## Search Console', '', '> No `GSC_SERVICE_ACCOUNT_JSON` in this environment, so live numbers are unavailable. Baseline (3 months to 2026-09-27, from the Search Console export):', '',
      `- Impressions: ${base.totals?.impressions ?? 'n/a'}, clicks: ${base.totals?.clicks ?? 'n/a'}`, `- US impressions: ${base.totals?.usImpressions ?? 'n/a'} at average position ~${base.totals?.usAvgPosition ?? 'n/a'}`, '');
  }

  out.push('', '## Published this engine cycle', '', published.length ? published.map((p) => `- ${p.publishedAt.slice(0, 10)} [${p.title}](/blog/${p.slug}/) (${p.format}, ${p.pillar})`).join('\n') : '_No engine-published posts yet. The engine ships paused._', '');
  const actions = loadActions().filter((a) => a.at.slice(0, 7) === month);
  out.push('## Actions taken', '', actions.length ? actions.map((a) => `- ${a.at.slice(0, 10)} ${a.kind}${a.slug ? ` (${a.slug})` : ''}: ${a.detail}`).join('\n') : '_None this month._', '');
  out.push('## Blog to contact clicks', '', 'Blog CTAs link to cal.com with `utm_source=blog&utm_medium=cta&utm_campaign=<post-slug>`, so bookings can be attributed per post inside cal.com. Cloudflare Web Analytics (free) reports page views and referrers but has no event API, so per-click counts are not available from it.', '');

  if (!arg('no-citations')) {
    const cc = await citationCheck();
    out.push('## AI citation check (10 fixed queries)', '');
    if (cc) out.push(`Cited on ${cc.cited} of ${cc.total} queries.`, '', '| Query | Result |', '|---|---|', ...cc.lines, '');
    else out.push("_Skipped: Claude is not available in this environment._", '');
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `${month}.md`);
  fs.writeFileSync(file, out.join('\n'));
  console.log(`wrote ${file}`);
}

if (process.argv[1]?.endsWith('gsc-report.ts')) main().catch((e) => { console.error(e); process.exit(1); });
