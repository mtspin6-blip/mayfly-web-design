// Import Search Console exports (and the PRD's day-one table) into the keyword backlog as weighted seeds.
// Usage: npm run engine:baseline
import fs from 'node:fs';
import path from 'node:path';
import { enginePath, readJson, writeJson } from '../lib/paths.js';
import { loadBacklog, saveBacklog, type BacklogItem } from '../lib/state.js';
import { normalizeKeyword } from '../lib/text.js';

interface Q { query: string; impressions?: number; clicks?: number; position?: number }

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function parseQueriesCsv(text: string): Q[] {
  const [head, ...rows] = parseCsv(text);
  const idx = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iq = idx(/quer/i), ii = idx(/impress/i), ic = idx(/click/i), ip = idx(/position/i);
  if (iq < 0) return [];
  return rows.map((r) => ({
    query: r[iq].trim(),
    impressions: ii >= 0 ? Number(r[ii].replace(/,/g, '')) : undefined,
    clicks: ic >= 0 ? Number(r[ic].replace(/,/g, '')) : undefined,
    position: ip >= 0 ? Number(r[ip]) : undefined,
  }));
}

const dir = enginePath('data/baseline');
const queries = new Map<string, Q>();
const add = (q: Q) => {
  const k = normalizeKeyword(q.query);
  if (!k) return;
  const prev = queries.get(k);
  queries.set(k, { ...prev, ...Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) } as Q);
};

for (const q of readJson<{ queries: Q[] }>(path.join(dir, 'prd-queries.json'), { queries: [] }).queries) add(q);
const csvs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /quer.*\.csv$/i.test(f)) : [];
for (const f of csvs) for (const q of parseQueriesCsv(fs.readFileSync(path.join(dir, f), 'utf8'))) add(q);

const backlog = loadBacklog();
const have = new Set(backlog.map((b) => normalizeKeyword(b.keyword)));
let added = 0;
for (const [k, q] of queries) {
  if (have.has(k)) {
    const item = backlog.find((b) => normalizeKeyword(b.keyword) === k)!;
    item.signals = { ...item.signals, gscImpressions: q.impressions ?? item.signals?.gscImpressions, gscPosition: q.position ?? item.signals?.gscPosition };
    continue;
  }
  const local = /\b(missoula|bozeman|billings|great falls|montana|mt)\b/.test(k);
  const commercial = /\b(design|designer|developer|development|seo|agency|automation)\b/.test(k);
  const item: BacklogItem = {
    keyword: q.query,
    cluster: { primary: q.query, secondary: [] },
    score: 0,
    intent: local && commercial ? 'local' : 'informational',
    pillar: /seo/.test(k) ? 'local-seo' : /automation|ai agency/.test(k) ? 'automations' : 'website-cost',
    sources: ['gsc-baseline'],
    status: 'new',
    signals: { gscImpressions: q.impressions, gscPosition: q.position, local },
  };
  backlog.push(item);
  added++;
}
saveBacklog(backlog);
writeJson(path.join(dir, 'queries.json'), [...queries.values()]);
console.log(`baseline: ${queries.size} queries read (${csvs.length} CSV file(s) + PRD table), ${added} added to backlog. Run npm run engine:research to score.`);
