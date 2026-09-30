import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealth, applyActions, type HealthInput } from '../lib/health.js';
import { loadConfig } from '../lib/config.js';
import { defaultHealth, type PublishedEntry } from '../lib/state.js';

const now = new Date('2026-12-01T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const entry = (slug: string, age: number): PublishedEntry => ({ slug, keyword: slug, title: slug, format: 'how-to', pillar: 'website-cost', publishedAt: day(age), gateSummary: '' });
const base = (): HealthInput => ({
  now, cfg: { ...loadConfig(), paused: false }, state: defaultHealth(), published: [], indexStatus: [], postPerf: [], recentRuns: [],
});

test('healthy state: no pause, counter increments', () => {
  const a = evaluateHealth(base());
  assert.deepEqual(a, [{ type: 'healthy' }]);
  const r = applyActions(a, base().cfg, defaultHealth(), now);
  assert.equal(r.paused, false);
  assert.equal(r.state.consecutiveHealthy, 1);
});

test('SIMULATED BAD INDEX STATE pauses publishing and raises an alert', () => {
  const idx = (slug: string, age: number, verdict: 'indexed' | 'not-indexed') => ({ slug, publishedAt: day(age), verdict });
  const input = { ...base(), indexStatus: [idx('a', 60, 'indexed'), idx('b', 50, 'not-indexed'), idx('c', 40, 'not-indexed'), idx('d', 30, 'indexed'), idx('e', 25, 'not-indexed'), idx('f', 22, 'not-indexed')] };
  const actions = evaluateHealth(input);
  const pause = actions.find((a) => a.type === 'pause');
  assert.ok(pause && pause.type === 'pause');
  assert.equal(pause.alert, true);
  assert.equal(pause.weeks, 3);
  const r = applyActions(actions, input.cfg, defaultHealth(), now);
  assert.equal(r.cfg.paused, true, 'config.paused flips to true');
  assert.ok(r.state.pausedUntil, 'auto-resume cooldown set');
  assert.equal(new Date(r.state.pausedUntil!).getTime() - now.getTime(), 21 * 86400000);
  assert.equal(r.alerts.length, 1);
});

test('young posts (under 21 days) do not count as not-indexed', () => {
  const input = { ...base(), indexStatus: [1, 2, 3, 4].map((n) => ({ slug: `p${n}`, publishedAt: day(5), verdict: 'not-indexed' as const })) };
  assert.deepEqual(evaluateHealth(input), [{ type: 'healthy' }]);
});

test('auto-resume after cooldown drops cadence to weekly', () => {
  const cfg = { ...loadConfig(), paused: true, pausedReason: 'x' };
  const state = { ...defaultHealth(), cadence: 'twice-weekly' as const, pausedUntil: day(1), resumeCadence: 'weekly' as const };
  const r = applyActions([{ type: 'healthy' }], cfg, state, now);
  assert.equal(r.cfg.paused, false);
  assert.equal(r.state.cadence, 'weekly');
});

test('cooldown not finished keeps the pause', () => {
  const cfg = { ...loadConfig(), paused: true };
  const state = { ...defaultHealth(), pausedUntil: new Date(now.getTime() + 86400000).toISOString() };
  assert.equal(applyActions([{ type: 'healthy' }], cfg, state, now).cfg.paused, true);
});

test('impression drop over 35% pauses with ALERT, no auto-resume', () => {
  const actions = evaluateHealth({ ...base(), siteImpressionsPriorTwoWeeks: 200, siteImpressionsTwoWeeks: 100 });
  const p = actions.find((a) => a.type === 'pause');
  assert.ok(p && p.type === 'pause' && !p.autoResume && p.alert);
});

test('seasonality note suppresses the impression-drop pause', () => {
  const actions = evaluateHealth({ ...base(), siteImpressionsPriorTwoWeeks: 200, siteImpressionsTwoWeeks: 100, seasonalityNote: 'holiday week' });
  assert.deepEqual(actions, [{ type: 'healthy' }]);
});

test('gate failure rate over 50% pauses', () => {
  const runs = [false, false, false, true].map((ok, i) => ({ at: day(i), ok }));
  const p = evaluateHealth({ ...base(), recentRuns: runs }).find((a) => a.type === 'pause');
  assert.ok(p);
});

test('zero impressions: refresh at 120 days, noindex at 180 after a refresh', () => {
  const refresh = evaluateHealth({ ...base(), published: [entry('old', 125)], postPerf: [] });
  assert.ok(refresh.some((a) => a.type === 'queue-refresh' && a.slug === 'old'));
  const refreshed = { ...entry('older', 190), refreshedAt: [day(60)] };
  const prune = evaluateHealth({ ...base(), published: [refreshed], postPerf: [] });
  assert.ok(prune.some((a) => a.type === 'noindex' && a.slug === 'older'));
});

test('four healthy checks step cadence up to twice-weekly', () => {
  let state = defaultHealth();
  let cfg = base().cfg;
  for (let i = 0; i < 4; i++) ({ state, cfg } = applyActions([{ type: 'healthy' }], cfg, state, now));
  assert.equal(state.cadence, 'twice-weekly');
});
