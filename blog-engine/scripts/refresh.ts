// Monthly optimization, auto-applied within limits: CTR title/meta tests, striking-distance FAQ, freshness, prune.
// Flags: --dry-run (compute, print, write nothing)
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from '../lib/config.js';
import { Budget, askJson } from '../lib/claude.js';
import { loadPosts, serializePost, type Post } from '../lib/post.js';
import { loadPublished, savePublished } from '../lib/state.js';
import { searchAnalytics, gscConfigured, isoDay, daysAgo } from '../lib/gsc.js';
import { needsCtrFix, titleTestVerdict, wordChangeRatio, isStale, checkTitleVariant, daysSince } from '../lib/optimize.js';
import { runDeterministicGates } from '../lib/gates.js';
import { factCheck } from './fact-check.js';
import { logAction } from '../lib/actions-log.js';
import { gateContext, arg } from '../lib/pipeline.js';
import { BLOG_DIR, enginePath, readJson, writeJson } from '../lib/paths.js';
import { normalizeKeyword } from '../lib/text.js';

const failing = (p: Post, ctx: ReturnType<typeof gateContext>) => new Set(runDeterministicGates(p, { ...ctx, existing: ctx.existing.filter((e) => e.slug !== p.slug) }).filter((g) => !g.ok).map((g) => g.id));
const newFailures = (before: Set<string>, after: Set<string>) => [...after].filter((x) => !before.has(x));
const save = (p: Post, dry: boolean) => { if (!dry) fs.writeFileSync(path.join(BLOG_DIR, `${p.slug}.md`), serializePost(p)); };

async function main() {
  const dry = arg('dry-run');
  const cfg = loadConfig();
  const budget = new Budget(cfg);
  const ctx = gateContext(cfg);
  const posts = loadPosts().filter((p) => !p.fm.draft);
  const today = new Date().toISOString().slice(0, 10);
  const report: string[] = [];
  const hasModel = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  // ---- GSC data ----
  const perf = new Map<string, { impressions: number; ctr: number; position: number }>();
  const queriesByPage = new Map<string, { query: string; position: number; impressions: number }[]>();
  if (gscConfigured()) {
    try {
      for (const r of (await searchAnalytics({ startDate: isoDay(daysAgo(28)), endDate: isoDay(daysAgo(2)), dimensions: ['page'], rowLimit: 500 })) ?? []) {
        const m = r.keys[0].match(/\/blog\/([^/]+)\/?$/);
        if (m) perf.set(m[1], { impressions: r.impressions, ctr: r.ctr, position: r.position });
      }
      for (const r of (await searchAnalytics({ startDate: isoDay(daysAgo(28)), endDate: isoDay(daysAgo(2)), dimensions: ['page', 'query'], rowLimit: 2000 })) ?? []) {
        const m = r.keys[0].match(/\/blog\/([^/]+)\/?$/);
        if (m) queriesByPage.set(m[1], [...(queriesByPage.get(m[1]) ?? []), { query: r.keys[1], position: r.position, impressions: r.impressions }]);
      }
    } catch (e) { report.push(`GSC error: ${(e as Error).message}`); }
  } else report.push('GSC not configured: CTR tests and striking-distance work skipped (freshness and prune still run)');

  // ---- 1. resolve title tests older than 28 days ----
  for (const p of posts) {
    const t = p.fm.titleTest;
    if (!t || daysSince(t.at) < 28) continue;
    const cur = perf.get(p.slug);
    if (!cur) continue;
    const v = titleTestVerdict(t.baselineCtr, cur.ctr, cur.impressions);
    if (v === 'wait') continue;
    if (v === 'revert') {
      p.fm.seoTitle = t.from === p.fm.title ? undefined : t.from;
      if (t.fromDescription) p.fm.description = t.fromDescription;
      report.push(`reverted title test on ${p.slug} (CTR ${(cur.ctr * 100).toFixed(2)}% vs baseline ${((t.baselineCtr ?? 0) * 100).toFixed(2)}%)`);
      logAction('title-test-revert', `${t.to} -> ${t.from}`, p.slug);
    } else { report.push(`kept title test on ${p.slug} (CTR ${(cur.ctr * 100).toFixed(2)}%)`); logAction('title-test-keep', t.to, p.slug); }
    delete p.fm.titleTest;
    save(p, dry);
  }

  // ---- 2. CTR fix: 3 variants, apply best, re-measure in 28 days ----
  if (hasModel) {
    for (const p of posts) {
      const pf = perf.get(p.slug);
      if (!pf || p.fm.titleTest || !needsCtrFix({ slug: p.slug, ...pf })) continue;
      const qs = (queriesByPage.get(p.slug) ?? []).sort((a, b) => b.impressions - a.impressions).slice(0, 5).map((q) => q.query);
      try {
        const res = await askJson<{ variants: { title: string; description: string }[]; best: number }>({
          model: cfg.models.editor, budget, effort: 'low', maxTokens: 3000,
          system: 'You write search result titles and meta descriptions for a Montana web design studio blog. Return 3 variants. title: 60 characters or fewer, contains the primary keyword, promises a specific payoff, no clickbait, no em dashes. description: 140 to 155 characters. Never invent facts. Also give "best": the index (0-2) most likely to earn the click. JSON only: {"variants":[{"title":"","description":""}],"best":0}',
          user: JSON.stringify({ current: { title: p.fm.seoTitle ?? p.fm.title, description: p.fm.description }, primaryKeyword: p.fm.primaryKeyword, topQueries: qs, avgPosition: pf.position, ctr: pf.ctr }),
        });
        const ok = res.variants.filter((v) => checkTitleVariant(v, cfg));
        const pick = ok.includes(res.variants[res.best]) ? res.variants[res.best] : ok[0];
        if (!pick) continue;
        p.fm.titleTest = { from: p.fm.seoTitle ?? p.fm.title, fromDescription: p.fm.description, to: pick.title, at: today, baselineCtr: pf.ctr };
        p.fm.seoTitle = pick.title;
        p.fm.description = pick.description;
        report.push(`CTR test on ${p.slug}: "${p.fm.titleTest.from}" -> "${pick.title}" (baseline CTR ${(pf.ctr * 100).toFixed(2)}%)`);
        logAction('title-test-start', pick.title, p.slug);
        save(p, dry);
      } catch (e) { report.push(`CTR variants failed for ${p.slug}: ${(e as Error).message}`); }
    }

    // ---- 3. striking distance: add one FAQ answering a query ranking 8-20 ----
    for (const p of posts) {
      const near = (queriesByPage.get(p.slug) ?? []).filter((q) => q.position >= 8 && q.position <= 20 && q.impressions >= 10).sort((a, b) => b.impressions - a.impressions)[0];
      if (!near || (p.fm.faq ?? []).length >= 5) continue;
      const bodyText = normalizeKeyword(p.body + ' ' + (p.fm.faq ?? []).map((f) => f.q + f.a).join(' '));
      if (normalizeKeyword(near.query).split(' ').every((w) => bodyText.includes(w))) continue; // already covered
      try {
        const before = failing(p, ctx);
        const res = await askJson<{ q: string; a: string }>({
          model: cfg.models.editor, budget, effort: 'low', maxTokens: 1500,
          system: 'Write ONE FAQ entry that answers the search query for a Montana small business owner. Answer in 40 to 60 words, plain and specific, no invented facts, statistics or clients, no em dashes. Use only what the post already says or common-sense advice. JSON only: {"q":"","a":""}',
          user: JSON.stringify({ query: near.query, postTitle: p.fm.title, postBody: p.body.slice(0, 6000) }),
        });
        const next: Post = { ...p, fm: { ...p.fm, faq: [...(p.fm.faq ?? []), { q: res.q, a: res.a }] } };
        const broke = newFailures(before, failing(next, ctx));
        if (broke.length) { report.push(`skipped FAQ for "${near.query}" on ${p.slug}: would break gates ${broke.join(', ')}`); continue; }
        Object.assign(p, next);
        report.push(`added FAQ for "${near.query}" (pos ${near.position.toFixed(1)}) on ${p.slug}`);
        logAction('striking-distance-faq', near.query, p.slug);
        save(p, dry);
      } catch (e) { report.push(`FAQ failed for ${p.slug}: ${(e as Error).message}`); }
    }
  }

  // ---- 4. freshness: posts older than 90 days get a source/stat re-check ----
  if (hasModel) {
    for (const p of posts) {
      if (!isStale(p.fm.updatedDate ?? p.fm.date) || !(p.fm.sources ?? []).length) continue;
      try {
        const { post: fixed, report: fr } = await factCheck(p, cfg, budget);
        const ratio = wordChangeRatio(p.body, fixed.body);
        if (ratio > 0.03) {
          fixed.fm.updatedDate = today; // material change only
          Object.assign(p, fixed);
          save(p, dry);
          report.push(`refreshed ${p.slug}: ${fr.deadLinks.length} dead links, ${fr.rewrites} rewrite(s); updatedDate set`);
          logAction('freshness-refresh', `dead ${fr.deadLinks.length}, rewrites ${fr.rewrites}`, p.slug);
        }
      } catch (e) { report.push(`freshness check failed for ${p.slug}: ${(e as Error).message}`); }
    }
  }

  // ---- 5. process refresh queue from the health check (marks refreshedAt so prune can follow) ----
  const queue = readJson<{ slug: string; reason: string }[]>(enginePath('data/refresh-queue.json'), []);
  if (queue.length && hasModel) {
    const log = loadPublished();
    for (const q of queue) {
      const e = log.find((x) => x.slug === q.slug);
      if (e) e.refreshedAt = [...(e.refreshedAt ?? []), today];
      logAction('refresh-queued-processed', q.reason, q.slug);
      report.push(`processed refresh queue: ${q.slug} (${q.reason})`);
    }
    if (!dry) { savePublished(log); writeJson(enginePath('data/refresh-queue.json'), []); }
  }

  console.log(report.join('\n') || 'nothing to change this month');
  console.log(`spend: $${budget.runUsd.toFixed(3)}`);
}

if (process.argv[1]?.endsWith('refresh.ts')) main().catch((e) => { console.error(e); process.exit(1); });
