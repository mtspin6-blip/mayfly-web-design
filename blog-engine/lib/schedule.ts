// When may the engine publish? Pure functions of (now, state, published log) so they are unit-testable.
import { HARD_CAPS, Config } from './config.js';
import type { HealthState, PublishedEntry } from './state.js';

const TZ = 'America/Denver';

/** Wall-clock parts in Mountain Time. */
export function mtParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const o = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour) % 24, minute: Number(o.minute), weekday: o.weekday as string };
}

/** Epoch ms for a Mountain Time wall-clock moment, handling DST. */
export function mtToDate(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  for (const offset of [6, 7]) { // MDT = UTC-6, MST = UTC-7
    const cand = new Date(Date.UTC(y, m - 1, d, hour + offset, minute));
    const p = mtParts(cand);
    if (p.date === date && p.hour === hour) return cand;
  }
  return new Date(Date.UTC(y, m - 1, d, hour + 7, minute));
}

export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Monday of the MT week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun
  return addDays(date, -((dow + 6) % 7));
}

const mtDay = (iso: string) => mtParts(new Date(iso)).date;

export function publishedOnDay(log: PublishedEntry[], date: string): number {
  return log.filter((e) => e.status !== 'merged' && mtDay(e.publishedAt) === date).length;
}
export function publishedInWeek(log: PublishedEntry[], date: string): number {
  const ws = weekStart(date), we = addDays(ws, 6);
  return log.filter((e) => e.status !== 'merged' && mtDay(e.publishedAt) >= ws && mtDay(e.publishedAt) <= we).length;
}

export function weeksSinceLaunch(health: HealthState, now: Date): number {
  if (!health.launchDate) return 0;
  return Math.floor((now.getTime() - Date.parse(health.launchDate)) / (7 * 86400000));
}

export type Cadence = 'weekly' | 'twice-weekly';
/** Cadence in force: weekly during the ramp, or whenever health hasn't earned the step up. */
export function effectiveCadence(health: HealthState, cfg: Config, now: Date): Cadence {
  if (weeksSinceLaunch(health, now) < cfg.cadence.rampWeeks) return 'weekly';
  return health.cadence;
}

/** A post is due when nothing went out in the last N days (6 on the weekly cadence, 3 when twice-weekly). Hard caps still apply on top. */
export const MIN_DAYS_BETWEEN: Record<Cadence, number> = { weekly: 6, 'twice-weekly': 3 };

export interface Decision { publish: boolean; reason: string }

/**
 * Should the publisher put a post live right now? There is no time-of-day window: GitHub's cron can arrive hours late,
 * and a missed window used to mean a missed week. Any run on any trigger may publish if nothing went out recently,
 * and running twice is harmless because the day/week caps and the "last N days" rule both look at the published log.
 */
export function decide(opts: { now: Date; cfg: Config; health: HealthState; log: PublishedEntry[]; ignoreInterval?: boolean }): Decision {
  const { now, cfg, health, log } = opts;
  if (cfg.paused) return { publish: false, reason: `paused: ${cfg.pausedReason ?? 'config.paused is true'}` };
  const mt = mtParts(now);

  // Hard caps: constants in code. Nothing in config or a prompt can raise them.
  if (publishedOnDay(log, mt.date) >= HARD_CAPS.maxPerDay) return { publish: false, reason: 'hard cap: already published today' };
  if (publishedInWeek(log, mt.date) >= HARD_CAPS.maxPerWeek) return { publish: false, reason: 'hard cap: weekly limit reached' };

  const cadence = effectiveCadence(health, cfg, now);
  if (opts.ignoreInterval) return { publish: true, reason: 'manual run (interval ignored, hard caps still enforced)' };
  if (cadence === 'weekly' && publishedInWeek(log, mt.date) >= 1) return { publish: false, reason: 'weekly cadence: this week is done' };

  const last = log.filter((e) => e.status !== 'merged').map((e) => Date.parse(e.publishedAt)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0];
  const need = MIN_DAYS_BETWEEN[cadence];
  if (last !== undefined) {
    const days = (now.getTime() - last) / 86400000;
    if (days < need) return { publish: false, reason: `last post went out ${days.toFixed(1)} days ago (${cadence} needs ${need})` };
  }
  return { publish: true, reason: last === undefined ? 'nothing published yet' : `nothing published in the last ${need} days (${cadence})` };
}
