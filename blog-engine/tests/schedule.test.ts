import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, mtParts, mtToDate, weekStart, effectiveCadence, publishedInWeek } from '../lib/schedule.js';
import { HARD_CAPS, loadConfig } from '../lib/config.js';
import { defaultHealth, type PublishedEntry } from '../lib/state.js';

const cfg = () => ({ ...loadConfig(), paused: false });
const entry = (iso: string, slug = 'p'): PublishedEntry => ({ slug, keyword: slug, title: slug, format: 'how-to', pillar: 'website-cost', publishedAt: iso, gateSummary: '' });

test('hard caps are constants and cannot exceed 2/week or 1/day', () => {
  assert.equal(HARD_CAPS.maxPerWeek, 2);
  assert.equal(HARD_CAPS.maxPerDay, 1);
  assert.ok(Object.isFrozen(HARD_CAPS));
  try { (HARD_CAPS as { maxPerWeek: number }).maxPerWeek = 9; } catch { /* strict mode throws */ }
  assert.equal(HARD_CAPS.maxPerWeek, 2);
});

test('MT time conversion handles DST', () => {
  assert.equal(mtToDate('2026-10-05', 7).toISOString(), '2026-10-05T13:00:00.000Z'); // MDT
  assert.equal(mtToDate('2026-12-07', 7).toISOString(), '2026-12-07T14:00:00.000Z'); // MST
  assert.equal(mtParts(new Date('2026-10-05T13:00:00Z')).weekday, 'Mon');
  assert.equal(weekStart('2026-10-08'), '2026-10-05');
});

test('jitter stays within +/-3 hours of 07:00 MT', () => {
  for (const r of [0, 0.25, 0.5, 0.99, 1]) {
    const now = mtToDate('2026-10-05', 12);
    const d = decide({ now, cfg: cfg(), health: defaultHealth(), log: [], rng: () => r });
    const at = Date.parse(d.nextPublishAt!.at);
    const base = mtToDate('2026-10-05', 7).getTime();
    assert.ok(Math.abs(at - base) <= 3 * 3600000 + 1);
  }
});

test('publishes on a Monday slot after the jittered target, not before', () => {
  const health = defaultHealth();
  const early = decide({ now: mtToDate('2026-10-05', 4, 30), cfg: cfg(), health, log: [], rng: () => 0.5 }); // target 07:00
  assert.equal(early.publish, false);
  const late = decide({ now: mtToDate('2026-10-05', 8), cfg: cfg(), health, log: [], rng: () => 0.5 });
  assert.equal(late.publish, true);
});

test('no slot on Tuesday; Thursday only when twice-weekly and past the ramp', () => {
  const c = cfg();
  assert.equal(decide({ now: mtToDate('2026-10-06', 9), cfg: c, health: defaultHealth(), log: [] }).publish, false);
  const health = { ...defaultHealth(), launchDate: '2026-08-01T00:00:00Z', cadence: 'twice-weekly' as const };
  const thu = decide({ now: mtToDate('2026-10-08', 12), cfg: c, health, log: [], rng: () => 0.5 });
  assert.equal(thu.publish, true);
  const weekly = decide({ now: mtToDate('2026-10-08', 12), cfg: c, health: { ...health, cadence: 'weekly' }, log: [], rng: () => 0.5 });
  assert.equal(weekly.publish, false);
});

test('ramp: weeks 1-4 are weekly even if cadence says twice-weekly', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const health = { ...defaultHealth(), launchDate: '2026-10-05T12:00:00Z', cadence: 'twice-weekly' as const };
  assert.equal(effectiveCadence(health, cfg(), now), 'weekly');
  assert.equal(effectiveCadence(health, cfg(), new Date('2026-11-10T12:00:00Z')), 'twice-weekly');
});

test('never more than one post per day, never more than two per week', () => {
  const c = cfg();
  const health = { ...defaultHealth(), launchDate: '2026-08-01T00:00:00Z', cadence: 'twice-weekly' as const };
  const mon = mtToDate('2026-10-05', 8).toISOString();
  assert.equal(decide({ now: mtToDate('2026-10-05', 15), cfg: c, health, log: [entry(mon)], rng: () => 0.5 }).publish, false, 'already today');
  const log = [entry(mtToDate('2026-10-05', 8).toISOString(), 'a'), entry(mtToDate('2026-10-07', 8).toISOString(), 'b')];
  assert.equal(publishedInWeek(log, '2026-10-08'), 2);
  assert.equal(decide({ now: mtToDate('2026-10-08', 12), cfg: c, health, log, rng: () => 0.5 }).publish, false, 'weekly cap');
  const manual = decide({ now: mtToDate('2026-10-08', 12), cfg: c, health, log, ignoreSlot: true });
  assert.equal(manual.publish, false, 'manual runs still obey hard caps');
});

test('paused config blocks publishing', () => {
  const d = decide({ now: mtToDate('2026-10-05', 12), cfg: { ...loadConfig(), paused: true }, health: defaultHealth(), log: [] });
  assert.equal(d.publish, false);
  assert.match(d.reason, /paused/);
});

test('at most two attempts per slot', () => {
  const health = { ...defaultHealth(), runs: [{ at: 'x', ok: false, reason: 'slot 2026-10-05:mon failed' }, { at: 'y', ok: false, reason: 'slot 2026-10-05:mon failed' }] };
  const d = decide({ now: mtToDate('2026-10-05', 12), cfg: cfg(), health, log: [], rng: () => 0.5 });
  assert.equal(d.publish, false);
});
