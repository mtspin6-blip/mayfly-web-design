// Deterministic text metrics used by the quality gates. No network, no model calls.

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/[*_>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const words = (text: string): string[] => text.match(/[A-Za-z0-9$%][A-Za-z0-9'’$%.,-]*/g) ?? [];
export const wordCount = (text: string) => words(text).length;

export function sentences(text: string): string[] {
  return text
    .replace(/\b(e\.g|i\.e|vs|etc|Dr|Mr|Mrs|Ms|St|No)\./g, '$1')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function fleschKincaidGrade(text: string): number {
  const sents = sentences(text);
  const ws = words(text);
  if (!sents.length || !ws.length) return 0;
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (ws.length / sents.length) + 11.8 * (syl / ws.length) - 15.59;
}

export function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
}

export function sentenceLengthStdDev(text: string): number {
  return stdDev(sentences(text).map((s) => wordCount(s)));
}

const CONTRACTION = /\b\w+(?:'|’)(?:s|t|re|ve|ll|d|m)\b/gi;
export function contractionsPer100(text: string): number {
  const n = (text.match(CONTRACTION) ?? []).length;
  const wc = wordCount(text);
  return wc ? (n / wc) * 100 : 0;
}

/** First three words of each paragraph, lowercased. */
export function paragraphOpeners(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|[-*+]\s|\d+\.\s|\||>|```)/.test(p))
    .map((p) => words(stripMarkdown(p)).slice(0, 3).join(' ').toLowerCase())
    .filter(Boolean);
}

export function maxRepeatedOpener(openers: string[]): number {
  const counts = new Map<string, number>();
  for (const o of openers) counts.set(o, (counts.get(o) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/** Longest run of consecutive sentences that start with the same word. */
export function longestSameStartRun(text: string): number {
  let best = 1, run = 1, prev = '';
  for (const s of sentences(text)) {
    const first = (words(s)[0] ?? '').toLowerCase();
    if (first && first === prev) run++;
    else run = 1;
    prev = first;
    best = Math.max(best, run);
  }
  return best;
}

function shingles(text: string, n = 5): Set<string> {
  const ws = words(text).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

/** Fraction of the candidate's shingles that also appear in the other text (containment, not Jaccard). */
export function shingleSimilarity(candidate: string, other: string): number {
  const a = shingles(stripMarkdown(candidate));
  const b = shingles(stripMarkdown(other));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return shared / a.size;
}

export const normalizeKeyword = (k: string) => k.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export function countOccurrences(text: string, phrase: string): number {
  const p = normalizeKeyword(phrase);
  if (!p) return 0;
  const t = normalizeKeyword(text);
  let n = 0, i = 0;
  while ((i = t.indexOf(p, i)) !== -1) { n++; i += p.length; }
  return n;
}
