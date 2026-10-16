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
import { Budget, buildCliInvocation, ask, UsageLimit, classifyCliResult, modelAlias } from '../lib/claude.js';
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

const goodScores = { helpfulness: 5, originalValue: 4, accuracy: 5, specificity: 4, voice: 5, intentMatch: 5, honesty: 5 };
const goodReview = { scores: goodScores, problems: [], honestyViolations: [], fabricationRemaining: false };
const longTitle = 'title: "A Very Long Title About Small Business Websites In Montana That Goes On And On Forever"';
const badFm = fmText.replace(/^title: .*$/m, longTitle);

interface MockOpts { review?: unknown; correctedFm?: string; writerFm?: string; fixFm?: string; claims?: unknown }
function mockModel(over: MockOpts = {}) {
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
    if (req.system.includes('published by Mayfly Web Design')) { calls.push('write'); return `===FRONTMATTER===\n${over.writerFm ?? fmText}\n===BODY===\n${bodyText}`; }
    if (req.system.includes('writer fixing your draft')) { calls.push('fix'); return `===FRONTMATTER===\n${over.fixFm ?? fmText}\n===BODY===\n${bodyText}`; }
    if (req.system.includes('Rewrite the draft below')) { calls.push('humanize'); return req.user; }
    if (req.system.includes('skeptical search quality rater')) {
      calls.push('editor');
      return `===REVIEW===\n${JSON.stringify(over.review ?? goodReview)}\n===FRONTMATTER===\n${over.correctedFm ?? over.writerFm ?? fmText}\n===BODY===\n${bodyText}`;
    }
    if (req.system.includes('Extract every statistic')) { calls.push('claims'); return JSON.stringify(over.claims ?? { claims: [] }); }
    if (req.system.includes('verify factual claims')) { calls.push('verify'); return JSON.stringify({ results: [] }); }
    throw new Error('unexpected model call: ' + req.system.slice(0, 60));
  });
  return calls;
}

test('full dry-run pipeline (mock model, real gates) writes, queues and publishes the good fixture', async () => {
  const calls = mockModel();
  const before = fs.readdirSync(BLOG_DIR).sort();
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch, date: mtToDate('2026-10-05', 9) });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.published);
  assert.deepEqual(calls.slice(0, 5), ['brief', 'write', 'humanize', 'editor', 'claims']);
  assert.deepEqual(fs.readdirSync(BLOG_DIR).sort(), before, 'dry-run leaves no files behind');
  assert.equal(r.summary.queued.length >= 1, true);
  setMockClaude(undefined);
});

test('low advisory editor scores never reject a draft that passes the gates', async () => {
  const low = { ...goodReview, scores: { ...goodScores, originalValue: 2, specificity: 2 }, problems: ['table cell wording', 'title says 6 but brief says 7'] };
  mockModel({ review: low });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.published, 'published despite low editor scores');
  setMockClaude(undefined);
});

test('a draft with a small inconsistency (title over 60 chars) is fixed, not rejected', async () => {
  const calls = mockModel({ writerFm: badFm, fixFm: fmText });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.published);
  assert.ok(calls.includes('fix'), 'a targeted fix pass ran');
  assert.equal(r.summary.setAside.length, 0, 'nothing was set aside');
  setMockClaude(undefined);
});

test('the editor itself repairs: its corrected post replaces the draft before the gates run', async () => {
  const calls = mockModel({ writerFm: badFm, correctedFm: fmText });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
  assert.ok(r.published, r.reason);
  assert.equal(calls.includes('fix'), false, 'the editor already fixed it; no fix pass needed');
  setMockClaude(undefined);
});

test('a draft that still fails a gate after 3 fix passes is set aside, with the failure list', async () => {
  const calls = mockModel({ writerFm: badFm, correctedFm: badFm, fixFm: badFm });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
  assert.equal(r.ok, false);
  assert.equal(calls.filter((c) => c === 'fix').length >= 3, true, 'three fix passes before giving up');
  assert.match(r.summary.setAside[0].reason, /still failing after 3 fix passes/);
  assert.match(r.summary.setAside[0].reason, /title/);
  setMockClaude(undefined);
});

test('invented content the editor cannot remove is set aside immediately (no fix pass)', async () => {
  const calls = mockModel({ review: { ...goodReview, honestyViolations: ['a cafe on Higgins'], fabricationRemaining: true } });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
  assert.equal(r.ok, false);
  assert.equal(calls.filter((c) => c === 'fix').length, 0, 'no rewrite attempted on fabricated content');
  setMockClaude(undefined);
});

test('editor reply parsing: review JSON plus corrected post; unparseable correction keeps the old draft', async () => {
  const { parseEditorReply } = await import('../scripts/editor-loop.js');
  const brief = { facts: [{ claim: 'a', sourceTitle: 't', sourceUrl: 'https://web.dev/articles/vitals' }], cta: 'x', category: 'Web Design' } as never;
  const c = { cfg: loadConfig(), item: { keyword: 'k', pillar: 'website-cost' }, format: 'how-to', brief };
  const prior = clone(goodPost());
  const ok = parseEditorReply(`===REVIEW===\n${JSON.stringify(goodReview)}\n===FRONTMATTER===\n${fmText}\n===BODY===\n${bodyText}`, c, prior);
  assert.ok(ok.corrected);
  assert.equal(ok.scores.helpfulness, 5);
  const none = parseEditorReply(`${JSON.stringify(goodReview)}`, c, prior);
  assert.equal(none.corrected, undefined, 'no corrected post: keep the draft');
  const broken = parseEditorReply(`===REVIEW===\n${JSON.stringify(goodReview)}\n===FRONTMATTER===\n: : :\n===BODY===\nx`, c, prior);
  assert.equal(broken.corrected, undefined);
  assert.match(broken.problems.at(-1)!, /unparseable/);
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
  assert.deepEqual(args.slice(args.indexOf('--setting-sources'), args.indexOf('--setting-sources') + 2), ['--setting-sources', 'project']);
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', 'WebSearch,WebFetch']);
  const noTools = buildCliInvocation({ model: 'm', system: 's' }, {});
  assert.deepEqual(noTools.args.slice(noTools.args.indexOf('--tools'), noTools.args.indexOf('--tools') + 2), ['--tools', '']);
  assert.ok(!noTools.args.includes('--allowedTools'));
});

test('a usage-limit stop ends the run without rejecting the topic', async () => {
  setMockClaude(() => { throw new UsageLimit('Claude plan usage limit reached'); });
  const r = await runPipeline({ dryRun: true, now: true, site: false, queueTarget: 1, fetcher: okFetch });
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

test('a successful answer that mentions "limit" is not a usage limit; only a CLI-reported error is', () => {
  const article = 'Rate limit headers and the daily usage limit hit your quota when you login too often.';
  assert.deepEqual(classifyCliResult({ is_error: false, result: article }), { kind: 'ok', text: article });
  assert.equal(classifyCliResult({ result: article }).kind, 'ok');
  assert.equal(classifyCliResult({ is_error: true, result: "You've hit your session limit. Resets 3pm" }).kind, 'limit');
  assert.equal(classifyCliResult({ is_error: true, result: 'Invalid token, please login' }).kind, 'auth');
  assert.equal(classifyCliResult({ is_error: true, result: "There's an issue with the selected model (claude-opus-5-5). It may not exist" }).kind, 'model');
  assert.equal(classifyCliResult({ is_error: true, result: 'boom' }).kind, 'error');
});

test('a model id the installed CLI does not know falls back to the alias', async () => {
  assert.equal(modelAlias('claude-opus-5-5'), 'opus');
  assert.equal(modelAlias('claude-sonnet-5-5'), 'sonnet');
  assert.equal(modelAlias('claude-haiku-4-5'), 'haiku');
  assert.equal(modelAlias('gpt-x'), null);
});

test('queue: oldest first, round-trips a post, dequeue removes both files', async () => {
  const os = await import('node:os');
  const { enqueue, listQueue, dequeue } = await import('../lib/queue.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-test-'));
  const a = clone(goodPost()); a.slug = 'a-post';
  const b = clone(goodPost()); b.slug = 'b-post';
  const meta = (slug: string, at: string) => ({ slug, keyword: slug, pillar: 'website-cost' as const, format: 'how-to', queuedAt: at, gateText: 'PASS' });
  enqueue({ post: b, meta: meta('b-post', '2026-10-02T00:00:00Z') }, dir);
  enqueue({ post: a, meta: meta('a-post', '2026-10-01T00:00:00Z') }, dir);
  const q = listQueue(dir);
  assert.deepEqual(q.map((i) => i.meta.slug), ['a-post', 'b-post']);
  assert.equal(q[0].post.fm.title, goodPost().fm.title);
  dequeue('a-post', dir);
  assert.deepEqual(listQueue(dir).map((i) => i.meta.slug), ['b-post']);
  fs.rmSync(dir, { recursive: true, force: true });
});
