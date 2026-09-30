// Choose the next topic from the backlog: best score, respecting pillar spacing, format rotation and past rejections.
import { loadConfig, type Config } from '../lib/config.js';
import { loadBacklog, loadPublished, type BacklogItem, type PublishedEntry } from '../lib/state.js';
import { loadPosts } from '../lib/post.js';
import { normalizeKeyword } from '../lib/text.js';
import { FORMATS, type Format } from '../lib/pipeline.js';

export function preferredFormat(keyword: string): Format | null {
  const k = normalizeKeyword(keyword);
  if (/\b(cost|price|pricing|how much|per month)\b/.test(k)) return 'cost-breakdown';
  if (/\b(vs|versus|compare|comparison| or )\b/.test(k)) return 'comparison';
  if (/\b(checklist|must haves?|should include|signs|include)\b/.test(k)) return 'checklist';
  if (/^(what is|what are|what does)\b/.test(k)) return 'glossary';
  if (/^(do i need|should|is |are |does .* work|worth)\b/.test(k)) return 'decision-guide';
  if (/\b(myth|really|actually)\b/.test(k)) return 'myth-vs-fact';
  if (/^(how to|how do|how can|why)\b/.test(k)) return 'how-to';
  return null;
}

export function pickFormat(keyword: string, published: PublishedEntry[]): Format {
  const last = published.at(-1)?.format;
  const recent = published.slice(-6).map((p) => p.format);
  const pref = preferredFormat(keyword);
  if (pref && pref !== last) return pref;
  const ranked = [...FORMATS].filter((f) => f !== last).sort((a, b) => recent.filter((x) => x === a).length - recent.filter((x) => x === b).length);
  return ranked[0];
}

export interface Pick { item: BacklogItem; format: Format }

export function pickTopic(opts: { cfg: Config; backlog: BacklogItem[]; published: PublishedEntry[]; usedKeywords: string[]; skip?: string[] }): Pick | null {
  const { cfg, backlog, published } = opts;
  const used = new Set([...opts.usedKeywords, ...(opts.skip ?? [])].map(normalizeKeyword));
  const last10 = published.slice(-10);
  const candidates = backlog
    .filter((b) => (b.status === 'new' || b.status === 'queued') && (b.intent === 'informational' || b.intent === 'commercial'))
    .filter((b) => !used.has(normalizeKeyword(b.keyword)))
    .filter((b) => {
      if (b.pillar !== 'niche-guides' || !cfg.nicheLock) return true;
      const k = normalizeKeyword(b.keyword);
      return cfg.nicheLock.keywords.some((w) => k.includes(normalizeKeyword(w)));
    })
    .filter((b) => {
      if (last10.length < 4) return true;
      const share = (last10.filter((e) => e.pillar === b.pillar).length + 1) / (last10.length + 1);
      return share <= cfg.cadence.maxSamePillarShareOfLast10;
    })
    .sort((a, b) => b.score - a.score);
  const item = candidates[0];
  return item ? { item, format: pickFormat(item.keyword, published) } : null;
}

if (process.argv[1]?.endsWith('pick-topic.ts')) {
  const cfg = loadConfig();
  const usedKeywords = [...loadPosts().map((p) => p.fm.primaryKeyword ?? ''), ...loadPublished().map((p) => p.keyword)];
  const pick = pickTopic({ cfg, backlog: loadBacklog(), published: loadPublished(), usedKeywords });
  console.log(pick ? JSON.stringify({ keyword: pick.item.keyword, pillar: pick.item.pillar, score: pick.item.score, format: pick.format, secondary: pick.item.cluster.secondary }, null, 2) : 'no eligible topic');
}
