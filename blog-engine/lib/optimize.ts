// Pure helpers for the monthly optimization loop.
import type { Config } from './config.js';

/** Rough expected organic CTR by average position (industry curves; used only to spot clear under-performers). */
export function expectedCtr(position: number): number {
  const table: [number, number][] = [[1, 0.28], [2, 0.15], [3, 0.11], [4, 0.08], [5, 0.06], [6, 0.05], [7, 0.04], [8, 0.035], [9, 0.03], [10, 0.025]];
  if (position <= 0) return 0;
  if (position <= 10) return table[Math.max(0, Math.round(position) - 1)][1];
  if (position <= 20) return 0.015;
  return 0.005;
}

export interface PostPerfLite { slug: string; impressions: number; ctr: number; position: number }

/** CTR fix candidates: 100+ impressions and CTR below both the expected curve and the 3% goal (unless position is deep). */
export function needsCtrFix(p: PostPerfLite): boolean {
  if (p.impressions < 100) return false;
  const expected = expectedCtr(p.position);
  return p.ctr < expected * 0.8 && p.ctr < 0.03 && p.position <= 20;
}

/** After 28 days: keep a title test unless CTR got clearly worse than the baseline. */
export function titleTestVerdict(baselineCtr: number | undefined, newCtr: number, impressions: number): 'keep' | 'revert' | 'wait' {
  if (impressions < 50) return 'wait';
  if (baselineCtr == null) return 'keep';
  return newCtr < baselineCtr * 0.9 ? 'revert' : 'keep';
}

export function wordChangeRatio(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  const wb = new Set(b.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const uni = new Set([...wa, ...wb]).size;
  return uni ? 1 - inter / uni : 0;
}

export const daysSince = (iso: string, now = new Date()) => (now.getTime() - Date.parse(iso)) / 86400000;

export const isStale = (dateIso: string, now = new Date(), days = 90) => daysSince(dateIso, now) > days;

export function checkTitleVariant(v: { title: string; description: string }, cfg: Config): boolean {
  return v.title.length > 0 && v.title.length <= 60 && v.description.length >= 140 && v.description.length <= 155 && !/[—–]/.test(v.title + v.description)
    && !cfg.bannedPhrases.some((b) => (v.title + ' ' + v.description).toLowerCase().includes(b));
}
