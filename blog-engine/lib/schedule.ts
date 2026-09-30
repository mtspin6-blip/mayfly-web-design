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

/** Slots on which publishing is allowed today: Mon for weekly; Mon + Thu for twice-weekly. */
export function slotToday(cadence: Cadence, weekday: string): 'mon' | 'thu' | null {
  if (weekday === 'Mon') return 'mon';
  if (weekday === 'Thu' && cadence === 'twice-weekly') return 'thu';
  return null;
}

/** Deterministic-per-slot jitter target: 07:00 MT plus or minus jitterHours. `rng` injectable for tests. */
export function pickTarget(date: string, cfg: Config, rng: () => number = Math.random): Date {
  const base = mtToDate(date, cfg.cadence.publishHourMT, 0).getTime();
  const jitterMs = (rng() * 2 - 1) * cfg.cadence.jitterHours * 3600000;
  return new Date(base + jitterMs);
}

export interface Decision { publish: boolean; reason: string; nextPublishAt?: { slot: string; at: string } }

export function decide(opts: { now: Date; cfg: Config; health: HealthState; log: PublishedEntry[]; rng?: () => number; ignoreSlot?: boolean }): Decision {
  const { now, cfg, health, log } = opts;
  if (cfg.paused) return { publish: false, reason: `paused: ${cfg.pausedReason ?? 'config.paused is true'}` };
  const mt = mtParts(now);

  // Hard caps: constants in code. Nothing in config or a prompt can raise them.
  if (publishedOnDay(log, mt.date) >= HARD_CAPS.maxPerDay) return { publish: false, reason: 'hard cap: already published today' };
  if (publishedInWeek(log, mt.date) >= HARD_CAPS.maxPerWeek) return { publish: false, reason: 'hard cap: weekly limit reached' };

  const cadence = effectiveCadence(health, cfg, now);
  if (cadence === 'weekly' && publishedInWeek(log, mt.date) >= 1) return { publish: false, reason: 'weekly cadence: this week is done' };

  const slot = opts.ignoreSlot ? 'manual' : slotToday(cadence, mt.weekday);
  if (!slot) return { publish: false, reason: `no publish slot on ${mt.weekday} (${cadence})` };

  const slotKey = `${mt.date}:${slot}`;
  let next = health.nextPublishAt;
  if (!next || next.slot !== slotKey) next = { slot: slotKey, at: pickTarget(mt.date, cfg, opts.rng).toISOString() };
  if (opts.ignoreSlot) return { publish: true, reason: 'manual run (slot ignored, hard caps still enforced)', nextPublishAt: next };

  const attempts = health.runs.filter((r) => r.reason?.startsWith(`slot ${slotKey}`)).length;
  if (attempts >= 2) return { publish: false, reason: `already attempted slot ${slotKey} twice`, nextPublishAt: next };
  if (now.getTime() < Date.parse(next.at)) return { publish: false, reason: `waiting for jittered target ${next.at}`, nextPublishAt: next };
  return { publish: true, reason: `slot ${slotKey} due (${cadence})`, nextPublishAt: next };
}
