// Circuit-breaker evaluation. Pure: takes measurements, returns the actions to take.
import type { Config } from './config.js';
import type { HealthState, PublishedEntry } from './state.js';

export interface PostIndexStatus { slug: string; publishedAt: string; verdict: 'indexed' | 'not-indexed' | 'unknown' }
export interface PostPerf { slug: string; publishedAt: string; impressions: number; clicks: number; ctr: number; position: number }

export interface HealthInput {
  now: Date;
  cfg: Config;
  state: HealthState;
  published: PublishedEntry[];
  indexStatus: PostIndexStatus[]; // for the last 6 posts
  siteImpressionsTwoWeeks?: number; // most recent 14 days
  siteImpressionsPriorTwoWeeks?: number; // the 14 days before that
  postPerf: PostPerf[];
  recentRuns: { at: string; ok: boolean }[]; // this month
  seasonalityNote?: string;
}

export type HealthAction =
  | { type: 'pause'; reason: string; weeks?: number; autoResume: boolean; alert: boolean; resumeCadence?: 'weekly' }
  | { type: 'reduce-cadence'; reason: string }
  | { type: 'queue-refresh'; slug: string; reason: string }
  | { type: 'noindex'; slug: string; reason: string }
  | { type: 'healthy' };

export function evaluateHealth(i: HealthInput): HealthAction[] {
  const actions: HealthAction[] = [];
  const { cfg } = i;
  const DAY = 86400000;

  // 1. Indexing: >30% of the last 6 posts not indexed 21+ days after publish.
  const aged = i.indexStatus.filter((p) => (i.now.getTime() - Date.parse(p.publishedAt)) / DAY >= cfg.health.notIndexedAfterDays);
  const sample = aged.slice(-6);
  const notIndexed = sample.filter((p) => p.verdict === 'not-indexed').length;
  if (sample.length >= 3 && notIndexed / sample.length > cfg.health.notIndexedShare) {
    actions.push({
      type: 'pause',
      reason: `${notIndexed} of the last ${sample.length} posts are not indexed ${cfg.health.notIndexedAfterDays}+ days after publishing`,
      weeks: cfg.health.pauseWeeksOnIndexing, autoResume: true, alert: true, resumeCadence: 'weekly',
    });
  }

  // 2. Impressions drop > 35% over two weeks (only with two full windows of data and no seasonality note).
  if (i.siteImpressionsTwoWeeks != null && i.siteImpressionsPriorTwoWeeks && i.siteImpressionsPriorTwoWeeks >= 50) {
    const drop = 1 - i.siteImpressionsTwoWeeks / i.siteImpressionsPriorTwoWeeks;
    if (drop > cfg.health.impressionDropShare && !i.seasonalityNote) {
      actions.push({ type: 'pause', reason: `site impressions fell ${(drop * 100).toFixed(0)}% over two weeks (${i.siteImpressionsPriorTwoWeeks} to ${i.siteImpressionsTwoWeeks})`, autoResume: false, alert: true });
    }
  }

  // 3. Blog CTR in the bottom quartile for 60 days: reduce cadence, refresh instead of new posts.
  const old = i.postPerf.filter((p) => (i.now.getTime() - Date.parse(p.publishedAt)) / DAY >= 60 && p.impressions >= 50);
  if (old.length >= 4) {
    const sorted = [...old].sort((a, b) => a.ctr - b.ctr);
    const q1 = sorted[Math.floor(sorted.length / 4)].ctr;
    const avg = old.reduce((n, p) => n + p.ctr, 0) / old.length;
    if (avg <= q1 && avg < 0.015) {
      actions.push({ type: 'reduce-cadence', reason: `blog CTR ${(avg * 100).toFixed(2)}% is in the bottom quartile after 60+ days` });
      for (const p of sorted.slice(0, 2)) actions.push({ type: 'queue-refresh', slug: p.slug, reason: 'lowest CTR posts get refreshed before new ones' });
    }
  }

  // 4. Zero impressions: refresh once at 120 days; noindex at 180.
  for (const e of i.published) {
    const age = (i.now.getTime() - Date.parse(e.publishedAt)) / DAY;
    const perf = i.postPerf.find((p) => p.slug === e.slug);
    const imps = perf?.impressions ?? 0;
    if (e.status && e.status !== 'live') continue;
    if (imps === 0 && age >= cfg.health.zeroImpressionPruneDays && (e.refreshedAt?.length ?? 0) >= 1) {
      actions.push({ type: 'noindex', slug: e.slug, reason: `0 impressions at ${Math.floor(age)} days after one refresh` });
    } else if (imps === 0 && age >= cfg.health.zeroImpressionRefreshDays && !(e.refreshedAt?.length)) {
      actions.push({ type: 'queue-refresh', slug: e.slug, reason: `0 impressions at ${Math.floor(age)} days` });
    }
  }

  // 5. Build/gate failure rate > 50% of runs this month.
  if (i.recentRuns.length >= 4) {
    const failed = i.recentRuns.filter((r) => !r.ok).length;
    if (failed / i.recentRuns.length > cfg.health.gateFailureRateMax) {
      actions.push({ type: 'pause', reason: `${failed} of ${i.recentRuns.length} runs this month failed gates or builds`, autoResume: false, alert: true });
    }
  }

  if (!actions.some((a) => a.type === 'pause' || a.type === 'reduce-cadence')) actions.push({ type: 'healthy' });
  return actions;
}

/** Apply actions to config + state. Returns the mutated copies and whether anything paused. */
export function applyActions(actions: HealthAction[], cfg: Config, state: HealthState, now: Date): { cfg: Config; state: HealthState; paused: boolean; alerts: string[] } {
  const nextCfg = structuredClone(cfg);
  const next = structuredClone(state);
  let paused = false;
  const alerts: string[] = [];
  next.lastCheck = now.toISOString();
  for (const a of actions) {
    if (a.type === 'pause') {
      paused = true;
      nextCfg.paused = true;
      nextCfg.pausedReason = a.reason;
      next.pauseReason = a.reason;
      next.consecutiveHealthy = 0;
      if (a.autoResume && a.weeks) {
        next.pausedUntil = new Date(now.getTime() + a.weeks * 7 * 86400000).toISOString();
        next.resumeCadence = a.resumeCadence ?? 'weekly';
      } else {
        delete next.pausedUntil;
      }
      if (a.alert) alerts.push(a.reason);
    } else if (a.type === 'reduce-cadence') {
      next.cadence = 'weekly';
      next.consecutiveHealthy = 0;
      alerts.push(a.reason);
    }
  }
  if (!paused && !actions.some((a) => a.type === 'reduce-cadence')) {
    next.consecutiveHealthy += 1;
    if (next.consecutiveHealthy >= cfg.cadence.healthyChecksToRamp && next.cadence === 'weekly' && !next.resumeCadence) {
      // Step-up only happens after the ramp weeks too; schedule.effectiveCadence enforces that.
      next.cadence = 'twice-weekly';
    }
  }
  // Auto-resume after cooldown (indexing rule only).
  if (!paused && nextCfg.paused && next.pausedUntil && now.getTime() >= Date.parse(next.pausedUntil)) {
    nextCfg.paused = false;
    delete nextCfg.pausedReason;
    next.cadence = next.resumeCadence ?? 'weekly';
    next.consecutiveHealthy = 0;
    delete next.pausedUntil;
    delete next.resumeCadence;
    delete next.pauseReason;
  }
  return { cfg: nextCfg, state: next, paused, alerts };
}
