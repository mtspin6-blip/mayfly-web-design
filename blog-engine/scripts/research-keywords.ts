// Free keyword research: seeds + GSC/Bing + Google autocomplete (+ optional Trends) -> analysis -> score -> cluster -> backlog.
// Usage: npm run engine:research [-- --offline] [-- --deep] [-- --trends]
import { loadConfig, type Config } from '../lib/config.js';
import { Budget, askJson } from '../lib/claude.js';
import { loadBacklog, saveBacklog, loadPublished, type BacklogItem, type Pillar } from '../lib/state.js';
import { loadPosts } from '../lib/post.js';
import { expandSeed, bingQueryStats, bingRelatedKeywords, trendsInterest } from '../lib/sources.js';
import { gscConfigured, searchAnalytics, isoDay, daysAgo } from '../lib/gsc.js';
import { normalizeKeyword } from '../lib/text.js';
import { arg, prompt } from '../lib/pipeline.js';
import { enginePath, readJson } from '../lib/paths.js';

type Intent = BacklogItem['intent'];
interface Cand {
  keyword: string; pillar: Pillar; sources: Set<string>; depth: number;
  gscImpressions?: number; gscPosition?: number; bingImpressions?: number; trends?: number | null;
  intent?: Intent; winnability?: number; local?: boolean; questions?: string[]; analysis?: 'model' | 'heuristic';
}

const STOP = new Set(['a', 'an', 'the', 'my', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'is', 'do', 'does', 'how', 'what', 'why', 'can', 'should', 'your', 'you', 'i', 'it', 'with', 'are', 'much', 'get']);
const tokens = (s: string) => normalizeKeyword(s).split(' ').filter((t) => t && !STOP.has(t));
const QUESTION = /^(how|what|why|does|do|can|should|is|are|when|which|who|will)\b/;
const TOPIC = /(website|web design|web designer|seo|google business|google maps|google review|reviews|chatgpt|schema|generative|ai search|automat|booking|lead|follow up|contractor|outfitter|brewery|hvac|landing page|domain|hosting|appointment|online scheduling)/;
const CITY = /\b(missoula|bozeman|billings|great falls|montana|mt|helena|kalispell|butte)\b/;

export function heuristicAnalysis(c: Cand): void {
  const k = normalizeKeyword(c.keyword);
  const local = CITY.test(k);
  let intent: Intent = 'informational';
  if (!TOPIC.test(k)) intent = 'unrelated';
  else if (local && /(design|designer|develop|seo|agency|company|companies|near me)/.test(k) && !QUESTION.test(k)) intent = 'local';
  else if (/\b(login|sign in|facebook|reddit|youtube|jobs|salary|course|free template|uk|australia|canada|india|books?|accountant|accounting|tax|loan|grants?|insurance|names?|ideas?|logo|free)\b/.test(k)) intent = 'unrelated';
  else if (/(cost|price|pricing|vs|versus|best|compare|worth it|subscription)/.test(k)) intent = 'commercial';
  c.intent ??= intent;
  const words = k.split(' ').length;
  c.winnability ??= Math.min(0.9, 0.4 + (words >= 5 ? 0.15 : 0) + (QUESTION.test(k) ? 0.05 : 0) + (local ? 0.1 : 0));
  c.local ??= local;
  c.analysis ??= 'heuristic';
}

async function modelAnalysis(cands: Cand[], cfg: Config, budget: Budget): Promise<void> {
  const batchSize = 40;
  for (let i = 0; i < cands.length; i += batchSize) {
    const batch = cands.slice(i, i + batchSize);
    try {
      const res = await askJson<{ keywords: { keyword: string; intent: Intent; pillar: Pillar; winnability: number; local: boolean; questions?: string[] }[] }>({
        model: cfg.models.research,
        system: prompt('keyword-analysis'),
        user: JSON.stringify(batch.map((c) => ({ keyword: c.keyword, seedPillar: c.pillar, autocompleteDepth: c.depth, gscImpressions: c.gscImpressions, gscPosition: c.gscPosition, bingImpressions: c.bingImpressions, trends: c.trends }))),
        webSearch: { maxUses: 3 },
        maxTokens: 8000,
        effort: 'low',
        budget,
      });
      for (const r of res.keywords ?? []) {
        const c = batch.find((b) => normalizeKeyword(b.keyword) === normalizeKeyword(r.keyword));
        if (!c) continue;
        Object.assign(c, { intent: r.intent, pillar: r.pillar ?? c.pillar, winnability: r.winnability, local: r.local, questions: r.questions ?? [], analysis: 'model' as const });
      }
    } catch (e) {
      console.warn(`analysis batch ${i / batchSize + 1} failed (${(e as Error).message}); falling back to heuristics`);
    }
  }
}

export function scoreCand(c: Cand, cfg: Config, existingKeywords: string[], gscDays: number): { score: number; cann: number } {
  const w = cfg.weights;
  const proxy = Math.min(1, ((c.depth / 8) * 0.5) + ((c.trends ?? 0) / 100) * 0.2 + Math.min(1, Math.log10(1 + (c.bingImpressions ?? 0)) / 2.5) * 0.3);
  const gsc = Math.min(1, Math.log10(1 + (c.gscImpressions ?? 0)) / 2.5);
  // Real impressions take over from proxies once there are >= gscShiftAfterDays of GSC data.
  const gscWeight = gscDays >= w.gscShiftAfterDays ? w.gscHeavyDemandWeight : 0.3;
  const demand = (c.gscImpressions ? gscWeight * gsc + (1 - gscWeight) * proxy : proxy);
  const intent = c.intent === 'informational' || c.intent === 'commercial' ? 1 : 0;
  const win = c.winnability ?? 0.4;
  const local = c.local ? 1 : 0;
  const ct = new Set(tokens(c.keyword));
  let cann = 0;
  for (const e of existingKeywords) {
    const et = new Set(tokens(e));
    const inter = [...ct].filter((t) => et.has(t)).length;
    const uni = new Set([...ct, ...et]).size;
    cann = Math.max(cann, uni ? inter / uni : 0);
  }
  const score = 100 * (w.demand * demand + w.intent * intent + w.winnability * win + w.local * local - w.cannibalization * cann);
  return { score: Math.round(score * 10) / 10, cann };
}

/** Group near-duplicate keywords: one primary + secondary questions. Never two backlog items on one primary. */
export function cluster(items: { c: Cand; score: number }[]): { c: Cand; score: number; secondary: string[] }[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const clusters: { c: Cand; score: number; secondary: string[]; tok: Set<string> }[] = [];
  for (const it of sorted) {
    const tok = new Set(tokens(it.c.keyword));
    const home = clusters.find((cl) => {
      const inter = [...tok].filter((t) => cl.tok.has(t)).length;
      return inter / new Set([...tok, ...cl.tok]).size >= 0.6;
    });
    if (home) {
      if (home.secondary.length < 6) home.secondary.push(it.c.keyword);
    } else clusters.push({ c: it.c, score: it.score, secondary: [], tok });
  }
  for (const cl of clusters) {
    for (const q of cl.c.questions ?? []) if (cl.secondary.length < 6 && !cl.secondary.includes(q)) cl.secondary.push(q);
    cl.secondary = cl.secondary.filter((s) => QUESTION.test(normalizeKeyword(s)) || cl.secondary.length <= 3).slice(0, 6);
  }
  return clusters;
}

async function main() {
  const cfg = loadConfig();
  const budget = new Budget(cfg);
  const offline = arg('offline') || (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN);
  const seeds = readJson<{ seeds: { keyword: string; pillar: Pillar }[] }>(enginePath('seeds.json'), { seeds: [] }).seeds;
  const cands = new Map<string, Cand>();
  const upsert = (keyword: string, pillar: Pillar, source: string, patch: Partial<Cand> = {}) => {
    const k = normalizeKeyword(keyword);
    if (!k || k.split(' ').length < 2) return;
    const cur = cands.get(k) ?? { keyword: k, pillar, sources: new Set<string>(), depth: 0 };
    cur.sources.add(source);
    Object.assign(cur, patch);
    cands.set(k, cur);
    return cur;
  };

  // 1. seeds
  seeds.forEach((s) => { const c = upsert(s.keyword, s.pillar, 'seed'); if (c) c.depth += 2; });

  // 2. existing backlog (baseline rows keep their real impressions)
  for (const b of loadBacklog()) {
    upsert(b.keyword, b.pillar, b.sources[0] ?? 'backlog', { gscImpressions: b.signals?.gscImpressions, gscPosition: b.signals?.gscPosition });
  }

  // 3. live GSC + Bing
  let gscDays = 0;
  if (gscConfigured()) {
    try {
      const rows = (await searchAnalytics({ startDate: isoDay(daysAgo(90)), endDate: isoDay(daysAgo(2)), dimensions: ['query'], rowLimit: 500 })) ?? [];
      rows.forEach((r) => upsert(r.keys[0], 'website-cost', 'gsc', { gscImpressions: r.impressions, gscPosition: r.position }));
      const first = await searchAnalytics({ startDate: isoDay(daysAgo(480)), endDate: isoDay(daysAgo(2)), dimensions: ['date'], rowLimit: 500 });
      const dates = (first ?? []).map((r) => r.keys[0]).sort();
      gscDays = dates.length ? Math.floor((Date.now() - Date.parse(dates[0])) / 86400000) : 0;
    } catch (e) { console.warn('GSC unavailable:', (e as Error).message); }
  }
  for (const r of await bingQueryStats()) upsert(r.query, 'website-cost', 'bing', { bingImpressions: r.impressions });

  // 4. expansion: autocomplete (+ Bing related) per seed
  const deep = arg('deep');
  for (const s of seeds) {
    const exp = await expandSeed(s.keyword, { letters: deep });
    for (const [text, depth] of exp) {
      const c = upsert(text, s.pillar, 'autocomplete');
      if (c) c.depth += depth;
    }
    for (const rel of (await bingRelatedKeywords(s.keyword)).slice(0, 10)) upsert(rel, s.pillar, 'bing-related');
    process.stdout.write('.');
  }
  console.log(`\n${cands.size} candidate keywords`);

  // keep only candidates that share meaningful words with some seed or baseline query (drops autocomplete drift)
  const anchor = [...seeds.map((s) => s.keyword), ...loadBacklog().map((b) => b.keyword)].map(tokens);
  const relevant = [...cands.values()].filter((c) => {
    if (c.sources.has('seed') || c.sources.has('gsc') || c.sources.has('gsc-baseline') || c.sources.has('bing')) return true;
    const t = new Set(tokens(c.keyword));
    return anchor.some((a) => a.length && a.filter((x) => t.has(x)).length >= Math.min(2, a.length));
  });

  // 5. optional Trends (slow, fragile) for the top candidates by depth
  if (arg('trends')) {
    for (const c of relevant.sort((a, b) => b.depth - a.depth).slice(0, 25)) c.trends = await trendsInterest(c.keyword);
  }

  // 6. analysis
  if (!offline) await modelAnalysis(relevant, cfg, budget);
  else console.log('offline mode: using heuristic intent/winnability (no model access)');
  relevant.forEach(heuristicAnalysis);

  // 7. score + drop local/unrelated intents (service-page territory) + cluster
  const existing = [...loadPosts().map((p) => p.fm.primaryKeyword ?? p.fm.title), ...loadPublished().map((p) => p.keyword)];
  const scored = relevant
    .filter((c) => c.intent === 'informational' || c.intent === 'commercial')
    .map((c) => ({ c, score: scoreCand(c, cfg, existing, gscDays).score }))
    .filter((x) => x.score > 0);
  const clusters = cluster(scored);

  // 8. write backlog, preserving state for anything already published/rejected/queued
  const old = new Map(loadBacklog().map((b) => [normalizeKeyword(b.keyword), b]));
  const next: BacklogItem[] = clusters.map((cl) => {
    const prev = old.get(normalizeKeyword(cl.c.keyword));
    return {
      keyword: cl.c.keyword,
      cluster: { primary: cl.c.keyword, secondary: cl.secondary },
      score: cl.score,
      intent: cl.c.intent!,
      pillar: cl.c.pillar,
      sources: [...cl.c.sources],
      status: prev?.status ?? 'new',
      signals: { gscImpressions: cl.c.gscImpressions, gscPosition: cl.c.gscPosition, bingImpressions: cl.c.bingImpressions, autocompleteDepth: cl.c.depth, trends: cl.c.trends ?? undefined, winnability: cl.c.winnability, local: cl.c.local },
      rejectedReason: prev?.rejectedReason,
      rejectedAt: prev?.rejectedAt,
    };
  });
  // Keep local-intent baseline rows out of the blog backlog but remember them for service-page work.
  for (const [k, b] of old) if ((b.status === 'published' || b.status === 'rejected') && !next.some((n) => normalizeKeyword(n.keyword) === k)) next.push(b);
  next.sort((a, b) => b.score - a.score);
  saveBacklog(next);
  console.log(`backlog: ${next.length} clustered keywords written (${next.filter((n) => n.status === 'new').length} new). Analysis: ${relevant.filter((c) => c.analysis === 'model').length} by model, ${relevant.filter((c) => c.analysis === 'heuristic').length} by heuristic.`);
  console.log(`spend this run: $${budget.runUsd.toFixed(3)}, ${budget.searches} searches`);
}

if (process.argv[1]?.endsWith('research-keywords.ts')) main().catch((e) => { console.error(e); process.exit(1); });
