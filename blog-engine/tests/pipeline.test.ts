import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setMockClaude, extractJson, splitDelimited } from '../lib/claude.js';
import { runPipeline } from '../scripts/run-pipeline.js';
import { factCheck } from '../scripts/fact-check.js';
import { backlinkTargets, addBackLink } from '../scripts/publish.js';
import { pickTopic, pickFormat } from '../scripts/pick-topic.js';
import { humanize } from '../scripts/humanize.js';
import { Budget, buildCliInvocation, ask, UsageLimit } from '../lib/claude.js';
import { loadConfig } from '../lib/config.js';
import { parseQueriesCsv } from '../scripts/import-baseline.js';
import { goodPost, clone } from './helpers.js';
import { BLOG_DIR, readJson } from '../lib/paths.js';
import { STATE_FILES, type BacklogItem } from '../lib/state.js';
import { mtToDate } from '../lib/schedule.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(here, 'fixtures/good-post.md'), 'utf8');
const [, fmText, bodyText] = fixture.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
const okFetch = async (url: string) => ({ url, ok: true, status: 200, text: 'page text' });
const cfgPath = path.resolve(here, '../config.json');

const goodScores = { scores: { helpfulness: 5, originalValue: 4, accuracy: 5, specificity: 4, voice: 5, intentMatch: 5, honesty: 5 }, autoFail: false, problems: [], rewriteInstructions: [] };

function mockModel(over: { editor?: unknown; claims?: unknown } = {}) {
  const calls: string[] = [];
  setMockClaude((req) => {
    if (req.system.includes('research editor')) {
      calls.push('brief');
      return JSON.stringify({
        title: 'How Long Does a Small Business Website Take?', slug: 'how-long-small-business-website', searcherQuestion: 'q', intent: 'informational', serpNotes: 'n',
        directAnswer: 'd', outline: [], originalValue: { type: 'checklist', description: 'timeline' },
        facts: [
          { claim: 'a', sourceTitle: 'Google Search Central, creating helpful content', sourceUrl: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
          { claim: 'b', sourceTitle: 'web.dev, Core Web Vitals', sourceUrl: 'https://web.dev/articles/vitals' },
        ],
        internalLinks: [], faqCandidates: [], cta: 'Book a free call', category: 'Web Design',
      });
    }
    if (req.system.includes('published by Mayfly Web Design') || req.system.includes('revising your draft')) {
      calls.push(req.system.includes('published by Mayfly Web Design') ? 'write' : 'revise');
      return `===FRONTMATTER===\n${fmText}\n===BODY===\n${bodyText}`;
    }
    if (req.system.includes('Rewrite the draft below')) { calls.push('humanize'); return req.user; }
    if (req.system.includes('skeptical search quality rater')) { calls.push('editor'); return JSON.stringify(over.editor ?? goodScores); }
    if (req.system.includes('Extract every statistic')) { calls.push('claims'); return JSON.stringify(over.claims ?? { claims: [] }); }
    if (req.system.includes('verify factual claims')) { calls.push('verify'); return JSON.stringify({ results: [] }); }
    throw new Error('unexpected model call: ' + req.system.slice(0, 60));
  });
  return calls;
}

test('full dry-run pipeline (mock model, real gates) publishes the good fixture', async () => {
  const calls = mockModel();
  const before = fs.readdirSync(BLOG_DIR).sort();
  const r = await runPipeline({ dryRun: true, now: true, site: false, fetcher: okFetch, date: mtToDate('2026-10-05', 9) });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.published);
  assert.deepEqual(calls.slice(0, 5), ['brief', 'write', 'humanize', 'editor', 'claims']);
  assert.deepEqual(fs.readdirSync(BLOG_DIR).sort(), before, 'dry-run leaves no files behind');
  setMockClaude(undefined);
});

test('low editor scores trigger rewrites, then discard after max rewrites', async () => {
  const bad = { ...goodScores, scores: { ...goodScores.scores, originalValue: 2 }, rewriteInstructions: ['add a real worked example'] };
  const calls = mockModel({ editor: bad });
  const r = await runPipeline({ dryRun: true, now: true, site: false, fetcher: okFetch });
  assert.equal(r.ok, false);
  assert.equal(calls.filter((c) => c === 'revise').length >= 2, true, 'two rewrites attempted');
  assert.match(r.reason, /editor loop failed/);
  setMockClaude(undefined);
});

test('honesty auto-fail discards the post immediately', async () => {
  const calls = mockModel({ editor: { ...goodScores, scores: { ...goodScores.scores, honesty: 1 }, autoFail: true } });
  const r = await runPipeline({ dryRun: true, now: true, site: false, fetcher: okFetch });
  assert.equal(r.ok, false);
  assert.equal(calls.filter((c) => c === 'revise').length, 0, 'no rewrite attempted on fabricated content');
  setMockClaude(undefined);
});

test('paused config blocks a real (non-dry) run', async () => {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(cfg.paused, true, 'ships paused');
  const r = await runPipeline({ dryRun: false, now: false, site: false });
  assert.equal(r.ok, true);
  assert.match(r.reason, /paused/);
  assert.equal(r.published, undefined);
});

test('fact-check drops dead links and removes unsupported claims', async () => {
  const post = clone(goodPost());
  const bad = 'About 90% of Montana sites fail [a study](https://dead.example.com/x). ';
  post.body = post.body.replace('Google measures loading', bad + 'Google measures loading');
  post.fm.sources = [...(post.fm.sources ?? []), { title: 'dead', url: 'https://dead.example.com/x' }];
  let n = 0;
  setMockClaude((req) => {
    if (req.system.includes('Extract every statistic')) return JSON.stringify(n++ === 0 ? { claims: [{ id: 0, sentence: 'About 90% of Montana sites fail a study.', claim: '90% fail', url: null }] } : { claims: [] });
    if (req.system.includes('verify factual claims')) return JSON.stringify({ results: [{ id: 0, supported: false }] });
    if (req.system.includes('fact-check editor')) return `===FRONTMATTER===\n${fmText}\n===BODY===\n${post.body.replace(bad, '')}`;
    throw new Error('unexpected');
  });
  const fetcher = async (url: string) => (url.includes('dead.example.com') ? { url, ok: false, status: 404, text: '' } : { url, ok: true, status: 200, text: 'x' });
  const { post: out, report } = await factCheck(post, loadConfig(), new Budget(loadConfig()), fetcher);
  assert.deepEqual(report.deadLinks, ['https://dead.example.com/x']);
  assert.equal(report.rewrites, 1);
  assert.equal(report.ok, true);
  assert.ok(!out.body.includes('dead.example.com'));
  assert.ok(!out.body.includes('90%'));
  assert.ok(!(out.fm.sources ?? []).some((s) => s.url.includes('dead.example.com')));
  setMockClaude(undefined);
});

test('fact-check fails a post whose claim stays unsupported after one rewrite', async () => {
  const post = clone(goodPost());
  setMockClaude((req) => {
    if (req.system.includes('Extract every statistic')) return JSON.stringify({ claims: [{ id: 0, sentence: 'X is 40%.', claim: '40%', url: 'https://web.dev/articles/vitals' }] });
    if (req.system.includes('verify factual claims')) return JSON.stringify({ results: [{ id: 0, supported: false }] });
    if (req.system.includes('fact-check editor')) return `===FRONTMATTER===\n${fmText}\n===BODY===\n${post.body}`;
    throw new Error('unexpected');
  });
  const { report } = await factCheck(post, loadConfig(), new Budget(loadConfig()), okFetch);
  assert.equal(report.ok, false);
  setMockClaude(undefined);
});

test('humanize reverts when the rewrite changes numbers or links', async () => {
  const post = clone(goodPost());
  setMockClaude(() => `===FRONTMATTER===\n${fmText}\n===BODY===\n${post.body.replace('$59', '$49')}`);
  const r = await humanize(post, loadConfig(), new Budget(loadConfig()));
  assert.equal(r.kept, false);
  assert.match(r.note, /numbers/);
  setMockClaude(undefined);
});

test('back-links: related older posts get one small Related line, no updatedDate bump', () => {
  const older = clone(goodPost());
  older.slug = 'older-post';
  older.fm.title = 'What a website costs in Montana';
  older.fm.primaryKeyword = 'website cost montana';
  older.fm.pillar = 'website-cost';
  older.body = 'Old body text.\n';
  const targets = backlinkTargets(goodPost(), [older]);
  assert.equal(targets.length, 1);
  const edited = addBackLink(older, goodPost());
  assert.match(edited.body, /Related: \[How Long Does a Small Business Website Take\?\]\(\/blog\/how-long-small-business-website\/\)/);
  assert.equal(edited.fm.updatedDate, undefined);
});

test('topic picker skips used keywords and respects pillar share; formats never repeat', () => {
  const cfg = loadConfig();
  const mk = (keyword: string, pillar: BacklogItem['pillar'], score: number): BacklogItem => ({ keyword, cluster: { primary: keyword, secondary: [] }, score, intent: 'informational', pillar, sources: [], status: 'new' });
  const backlog = [mk('a a', 'local-seo', 90), mk('b b', 'local-seo', 80), mk('c c', 'ai-search', 70)];
  const published = ['local-seo', 'local-seo', 'ai-search', 'local-seo'].map((pillar, i) => ({ slug: `s${i}`, keyword: `k${i}`, title: 't', format: 'how-to', pillar: pillar as BacklogItem['pillar'], publishedAt: '2026-10-01', gateSummary: '' }));
  const pick = pickTopic({ cfg, backlog, published, usedKeywords: [] });
  assert.equal(pick?.item.keyword, 'c c', 'local-seo would exceed 40% of the last 10');
  assert.notEqual(pickFormat('how to get more google reviews', [{ ...published[0], format: 'how-to' }]), 'how-to');
  assert.equal(pickTopic({ cfg, backlog, published: [], usedKeywords: ['a a'] })?.item.keyword, 'b b');
});

test('JSON and delimiter parsers tolerate noise', () => {
  assert.deepEqual(extractJson<{ a: number }>('Sure!\n```json\n{"a": 1, "b": "}"}\n```'), { a: 1, b: '}' } as never);
  assert.throws(() => splitDelimited('no delimiters'));
  assert.equal(splitDelimited('===FRONTMATTER===\nt: 1\n===BODY===\nhello').body.trim(), 'hello');
});

test('GSC Queries.csv export parses (quotes, commas, percent CTR)', () => {
  const csv = 'Top queries,Clicks,Impressions,CTR,Position\n"montana web design, small business",1,"1,204",0.08%,57.5\nlocal seo montana,0,22,0%,22\n';
  const q = parseQueriesCsv(csv);
  assert.equal(q.length, 2);
  assert.equal(q[0].query, 'montana web design, small business');
  assert.equal(q[0].impressions, 1204);
  assert.equal(q[0].position, 57.5);
});

test('committed backlog has 100+ clustered keywords with unique primaries', () => {
  const b = readJson<BacklogItem[]>(STATE_FILES.backlog, []);
  assert.ok(b.length >= 100, `only ${b.length}`);
  assert.equal(new Set(b.map((x) => x.keyword.toLowerCase())).size, b.length);
  assert.ok(b.every((x) => typeof x.score === 'number' && x.cluster?.primary));
});

test('serialized frontmatter quotes dates so Astro reads them as strings', async () => {
  const { serializePost } = await import('../lib/post.js');
  const out = serializePost(goodPost());
  assert.match(out, /^date: "2026-10-06"$/m);
});

test('optimize helpers: CTR-fix candidates, title-test verdicts, change ratio', async () => {
  const o = await import('../lib/optimize.js');
  assert.equal(o.needsCtrFix({ slug: 'a', impressions: 150, ctr: 0.005, position: 4 }), true);
  assert.equal(o.needsCtrFix({ slug: 'a', impressions: 50, ctr: 0.001, position: 4 }), false, 'needs 100+ impressions');
  assert.equal(o.needsCtrFix({ slug: 'a', impressions: 500, ctr: 0.2, position: 1 }), false, 'healthy CTR');
  assert.equal(o.titleTestVerdict(0.02, 0.01, 200), 'revert');
  assert.equal(o.titleTestVerdict(0.02, 0.03, 200), 'keep');
  assert.equal(o.titleTestVerdict(0.02, 0.0, 10), 'wait');
  assert.ok(o.wordChangeRatio('the quick brown fox', 'the quick brown fox') === 0);
  assert.ok(o.wordChangeRatio('the quick brown fox', 'a totally different sentence here') > 0.5);
  assert.equal(o.isStale('2026-01-01', new Date('2026-06-01')), true);
});

test('niche lock restricts niche-guides topics once set', () => {
  const cfg = { ...loadConfig(), nicheLock: { niche: 'fly fishing', keywords: ['fly fishing', 'outfitter'] } };
  const mk = (keyword: string, pillar: BacklogItem['pillar'], score: number): BacklogItem => ({ keyword, cluster: { primary: keyword, secondary: [] }, score, intent: 'informational', pillar, sources: [], status: 'new' });
  const backlog = [mk('brewery website must haves', 'niche-guides', 90), mk('outfitter website checklist', 'niche-guides', 50)];
  assert.equal(pickTopic({ cfg, backlog, published: [], usedKeywords: [] })?.item.keyword, 'outfitter website checklist');
});

test('Claude Code invocation never carries an API key (no API billing possible)', () => {
  const { args, env } = buildCliInvocation(
    { model: 'claude-opus-5-5', system: 'sys', webSearch: { maxUses: 5 } },
    { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-x', ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'https://x', CLAUDE_CODE_OAUTH_TOKEN: 'sub-token' },
  );
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'sub-token', 'subscription token is kept');
  assert.ok(args.includes('-p') && args.includes('--no-session-persistence'));
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', 'WebSearch,WebFetch']);
  const noTools = buildCliInvocation({ model: 'm', system: 's' }, {});
  assert.deepEqual(noTools.args.slice(noTools.args.indexOf('--tools'), noTools.args.indexOf('--tools') + 2), ['--tools', '']);
  assert.ok(!noTools.args.includes('--allowedTools'));
});

test('a usage-limit stop ends the run without rejecting the topic', async () => {
  setMockClaude(() => { throw new UsageLimit('Claude plan usage limit reached'); });
  const r = await runPipeline({ dryRun: true, now: true, site: false, fetcher: okFetch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /usage-limit/);
  setMockClaude(undefined);
});

test('call caps stop a runaway loop', async () => {
  const cfg = loadConfig();
  const b = new Budget({ ...cfg, budget: { ...cfg.budget, maxModelCallsPerRun: 1 } });
  setMockClaude(() => 'ok');
  await ask({ model: 'm', system: 's', user: 'u', budget: b });
  b.record(10);
  await assert.rejects(ask({ model: 'm', system: 's', user: 'u', budget: b }), /call cap/);
  setMockClaude(undefined);
});

test('a token pasted with a line break or spaces is cleaned before use', () => {
  const { env } = buildCliInvocation({ model: 'm', system: 's' }, { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-abc\ndef ghi\r\n' });
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'sk-ant-oat01-abcdefghi');
});

test('YAML repair quotes titles with colons and keeps valid values', async () => {
  const { repairYaml } = await import('../lib/post.js');
  const YAML = (await import('yaml')).default;
  const fixed = YAML.parse(repairYaml('title: How to Start an Online Booking Business: 7 Steps\ndescription: How to get reviews this week: find your link, ask\ncta: "Book a call"\nreadTime: 5 min read\nsources:\n  - title: Google: helpful content\n    url: https://developers.google.com/x\nfaq:\n  - q: Why? Because: reasons\n    a: Ok.\ndate: 2026-10-06')) as Record<string, unknown>;
  assert.equal(fixed.title, 'How to Start an Online Booking Business: 7 Steps');
  assert.equal(fixed.description, 'How to get reviews this week: find your link, ask');
  assert.equal(fixed.cta, 'Book a call');
  assert.equal(fixed.readTime, '5 min read');
  assert.equal((fixed.sources as { title: string }[])[0].title, 'Google: helpful content');
  assert.equal((fixed.faq as { q: string }[])[0].q, 'Why? Because: reasons');
});
