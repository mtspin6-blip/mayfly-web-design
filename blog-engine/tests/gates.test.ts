import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeterministicGates, gateEditor, allPassed, type GateResult } from '../lib/gates.js';
import { loadConfig } from '../lib/config.js';
import { goodPost, clone, ctx } from './helpers.js';

const byId = (r: GateResult[], id: string) => r.find((g) => g.id === id)!;
const run = (p = goodPost(), c = ctx()) => runDeterministicGates(p, c);

test('good fixture passes every deterministic gate', () => {
  const r = run();
  const failed = r.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  assert.deepEqual(failed, []);
  assert.ok(allPassed(r));
});

test('em dash fails banned-patterns', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('It\'s waiting on content', 'It\'s waiting on content — and approvals');
  assert.equal(byId(run(p), 'banned-patterns').ok, false);
});

test('AI cliches fail banned-patterns', () => {
  const p = clone(goodPost());
  p.body += '\nIn today\'s digital landscape you must leverage a seamless, robust website.\n';
  const g = byId(run(p), 'banned-patterns');
  assert.equal(g.ok, false);
  assert.match(g.detail, /leverage|seamless|robust|digital landscape/);
});

test('fake client claims fail banned-patterns', () => {
  const p = clone(goodPost());
  p.body += '\nWe built a site for a Bozeman brewery and my clients say it doubled bookings.\n';
  const g = byId(run(p), 'banned-patterns');
  assert.equal(g.ok, false);
  assert.match(g.detail, /client|first-person/);
});

test('too short fails length', () => {
  const p = clone(goodPost());
  p.body = p.body.split('\n\n').slice(0, 4).join('\n\n');
  assert.equal(byId(run(p), 'length').ok, false);
});

test('long opening paragraph fails direct-answer', () => {
  const p = clone(goodPost());
  p.body = 'Short answer here.\n\n' + p.body.split('\n\n').slice(1).join('\n\n');
  assert.equal(byId(run(p), 'direct-answer').ok, false);
});

test('overlong title and meta fail title-meta', () => {
  const p = clone(goodPost());
  p.fm.title = 'How Long Does It Really Take To Build A Small Business Website In Montana';
  assert.equal(byId(run(p), 'title-meta').ok, false);
  const q = clone(goodPost());
  q.fm.description = 'Too short.';
  assert.equal(byId(run(q), 'title-meta').ok, false);
});

test('missing sources fail sources', () => {
  const p = clone(goodPost());
  p.fm.sources = [{ title: 'one', url: 'https://example.com/a' }];
  assert.equal(byId(run(p), 'sources').ok, false);
});

test('uncited statistic fails sources', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('A Starter site can move faster because there\'s less to build.', 'About 63% of shoppers leave a slow site. A Starter site can move faster because there\'s less to build.');
  const g = byId(run(p), 'sources');
  assert.equal(g.ok, false);
  assert.match(g.detail, /63%/);
});

test('cited statistic passes sources', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('A Starter site can move faster because there\'s less to build.', 'Google reports 75% of pages in one study passed [Core Web Vitals](https://web.dev/articles/vitals). A Starter site can move faster because there\'s less to build.');
  assert.equal(byId(run(p), 'sources').ok, true);
});

test('wrong Mayfly price fails offer-accuracy', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('The Starter plan is $59 a month', 'The Starter plan is $79 a month');
  assert.equal(byId(run(p), 'offer-accuracy').ok, false);
});

test('dead internal link fails internal-links', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('/pricing/', '/pricing-old/');
  assert.equal(byId(run(p), 'internal-links').ok, false);
});

test('no service page link fails internal-links', () => {
  const p = clone(goodPost());
  p.body = p.body.replace('[website design service](/services/website-design/)', 'website design service').replace('[pricing page](/pricing/)', 'pricing page');
  const g = byId(run(p), 'internal-links');
  assert.equal(g.ok, false);
});

test('duplicate primary keyword fails duplicate', () => {
  const existing = clone(goodPost());
  existing.slug = 'older';
  const g = byId(run(goodPost(), ctx({ existing: [existing] })), 'duplicate');
  assert.equal(g.ok, false);
});

test('near-copy of existing post fails duplicate similarity', () => {
  const existing = clone(goodPost());
  existing.slug = 'older';
  existing.fm.primaryKeyword = 'website timeline montana';
  const g = byId(run(goodPost(), ctx({ existing: [existing] })), 'duplicate');
  assert.equal(g.ok, false);
  assert.match(g.detail, /similarity/);
});

test('keyword stuffing fails', () => {
  const p = clone(goodPost());
  p.body += '\n' + 'how long to build a small business website. '.repeat(30) + '\n';
  assert.equal(byId(run(p), 'keyword-stuffing').ok, false);
});

test('FAQ with wrong count or length fails', () => {
  const p = clone(goodPost());
  p.fm.faq = p.fm.faq!.slice(0, 2);
  assert.equal(byId(run(p), 'faq').ok, false);
  const q = clone(goodPost());
  q.fm.faq![0].a = 'Yes.';
  assert.equal(byId(run(q), 'faq').ok, false);
});

test('non-question headings fail headings', () => {
  const p = clone(goodPost());
  p.body = p.body.replace(/^## (.+)\?$/gm, '## $1');
  assert.equal(byId(run(p), 'headings').ok, false);
});

test('uniform robotic prose fails style', () => {
  const p = clone(goodPost());
  const sentence = 'The website owner should review the design carefully before launch time comes around. ';
  p.body = p.body.split('\n\n')[0] + '\n\n## What is next?\n\n' + sentence.repeat(60) + '\n\n## Why now?\n\nText.\n\n## How so?\n\nText.\n';
  const g = byId(run(p), 'style');
  assert.equal(g.ok, false);
});

test('same format as previous post fails variety', () => {
  const published = [{ slug: 'x', keyword: 'y', title: 't', format: 'how-to', pillar: 'local-seo' as const, publishedAt: '2026-10-01', gateSummary: '' }];
  assert.equal(byId(run(goodPost(), ctx({ published })), 'variety').ok, false);
});

test('pillar over 40% of recent posts fails variety', () => {
  const mk = (i: number, pillar: 'website-cost' | 'local-seo', format: string) => ({ slug: `s${i}`, keyword: `k${i}`, title: 't', format, pillar, publishedAt: '2026-10-01', gateSummary: '' });
  const published = [mk(1, 'website-cost', 'checklist'), mk(2, 'website-cost', 'comparison'), mk(3, 'local-seo', 'glossary'), mk(4, 'website-cost', 'myth-vs-fact')];
  assert.equal(byId(run(goodPost(), ctx({ published })), 'variety').ok, false);
});

test('missing frontmatter fields fail schema', () => {
  const p = clone(goodPost());
  delete p.fm.pillar;
  assert.equal(byId(run(p), 'schema').ok, false);
  const q = clone(goodPost());
  q.fm.author = 'Mayfly Web Design';
  assert.equal(byId(run(q), 'schema').ok, false);
});

test('editor gate thresholds', () => {
  const cfg = loadConfig();
  const ok = { helpfulness: 5, originalValue: 4, accuracy: 5, specificity: 4, voice: 4, intentMatch: 5, honesty: 5 };
  assert.equal(gateEditor(ok, cfg).ok, true);
  assert.equal(gateEditor({ ...ok, originalValue: 3 }, cfg).ok, false, 'any score below 4 fails');
  assert.equal(gateEditor({ ...ok, helpfulness: 4, originalValue: 4, accuracy: 4, specificity: 4, voice: 4, intentMatch: 4, honesty: 5 }, cfg).ok, false, 'avg below 4.2 fails');
  assert.equal(gateEditor({ ...ok, honesty: 2, autoFail: true }, cfg).ok, false, 'honesty auto-fail');
  assert.equal(gateEditor(undefined, cfg).ok, false);
});

test('long quotation fails quotes gate', async () => {
  const p = clone(goodPost());
  p.body += '\nOne source said "the quick brown fox jumps over the lazy dog while the sun sets slowly behind the tall mountains" about it.\n';
  assert.equal(byId(run(p), 'quotes').ok, false);
});
