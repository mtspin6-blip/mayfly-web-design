import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, mtParts, mtToDate, weekStart, effectiveCadence, publishedInWeek, MIN_DAYS_BETWEEN } from '../lib/schedule.js';
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

test('there is no time window: a run at any hour of any trigger day publishes when nothing is recent', () => {
  // GitHub delivered runs at 17:20, 19:11 and 19:44 UTC; all of them must be able to publish.
  for (const iso of ['2026-10-05T15:00:00Z', '2026-10-05T17:20:00Z', '2026-10-05T21:00:00Z', '2026-10-06T19:44:00Z']) {
    const d = decide({ now: new Date(iso), cfg: cfg(), health: defaultHealth(), log: [] });
    assert.equal(d.publish, true, iso);
  }
});

test('publishes only when nothing went out in the last N days (weekly: 6, twice-weekly: 3)', () => {
  const c = cfg();
  assert.equal(MIN_DAYS_BETWEEN.weekly, 6);
  const last = mtToDate('2026-10-05', 8).toISOString();
  const log = [entry(last)];
  assert.equal(decide({ now: mtToDate('2026-10-06', 9), cfg: c, health: defaultHealth(), log }).publish, false, 'next day');
  assert.equal(decide({ now: mtToDate('2026-10-09', 9), cfg: c, health: defaultHealth(), log }).publish, false, '4 days later');
  assert.equal(decide({ now: mtToDate('2026-10-12', 9), cfg: c, health: defaultHealth(), log }).publish, true, '7 days later');
  const twice = { ...defaultHealth(), launchDate: '2026-08-01T00:00:00Z', cadence: 'twice-weekly' as const };
  assert.equal(decide({ now: mtToDate('2026-10-08', 9), cfg: c, health: twice, log }).publish, true, 'twice-weekly allows day 3');
  assert.equal(decide({ now: mtToDate('2026-10-07', 9), cfg: c, health: twice, log }).publish, false, 'but not day 2');
});

test('running again right after a publish is harmless (idempotent)', () => {
  const log = [entry(mtToDate('2026-10-05', 8).toISOString())];
  for (const iso of ['2026-10-05T21:00:00Z', '2026-10-06T15:00:00Z']) assert.equal(decide({ now: new Date(iso), cfg: cfg(), health: defaultHealth(), log }).publish, false, iso);
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
  assert.equal(decide({ now: mtToDate('2026-10-05', 15), cfg: c, health, log: [entry(mon)] }).publish, false, 'already today');
  const log = [entry(mtToDate('2026-10-05', 8).toISOString(), 'a'), entry(mtToDate('2026-10-07', 8).toISOString(), 'b')];
  assert.equal(publishedInWeek(log, '2026-10-08'), 2);
  assert.equal(decide({ now: mtToDate('2026-10-08', 12), cfg: c, health, log }).publish, false, 'weekly cap');
  const manual = decide({ now: mtToDate('2026-10-08', 12), cfg: c, health, log, ignoreInterval: true });
  assert.equal(manual.publish, false, 'manual runs still obey hard caps');
  const manualDay = decide({ now: mtToDate('2026-10-05', 15), cfg: c, health, log: [entry(mon)], ignoreInterval: true });
  assert.equal(manualDay.publish, false, 'manual runs still obey the daily cap');
});

test('paused config blocks publishing', () => {
  const d = decide({ now: mtToDate('2026-10-05', 12), cfg: { ...loadConfig(), paused: true }, health: defaultHealth(), log: [] });
  assert.equal(d.publish, false);
  assert.match(d.reason, /paused/);
});
