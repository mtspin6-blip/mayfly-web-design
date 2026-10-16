// The publisher: no model calls. Takes the oldest post from the ready queue, puts it live (files only, the workflow makes the one
// commit for the whole run), and adds back-links from 2-3 related older posts.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config.js';
import { loadPosts, writePost, type Post } from '../lib/post.js';
import { loadPublished, savePublished, loadBacklog, saveBacklog, loadHealth, type PublishedEntry } from '../lib/state.js';
import { runDeterministicGates, summarize, allPassed, links } from '../lib/gates.js';
import { BLOG_DIR } from '../lib/paths.js';
import { normalizeKeyword } from '../lib/text.js';
import { decide, mtParts } from '../lib/schedule.js';
import { listQueue, dequeue, type QueueItem } from '../lib/queue.js';
import { gateContext } from '../lib/pipeline.js';
import { buildCheck } from './quality-gate.js';
import { RejectedDraft } from './editor-loop.js';
import { saveRejected } from './write-queue.js';

export function backlinkTargets(newPost: Post, older: Post[], max = 3): Post[] {
  const tok = (s: string) => new Set(normalizeKeyword(s).split(' ').filter((t) => t.length > 3));
  const mine = tok(`${newPost.fm.title} ${newPost.fm.primaryKeyword}`);
  return older
    .filter((p) => !p.fm.draft && !p.fm.noindex && p.slug !== newPost.slug)
    .filter((p) => !links(p.body).some((l) => l.href.includes(`/blog/${newPost.slug}/`)))
    .map((p) => {
      const t = tok(`${p.fm.title} ${p.fm.primaryKeyword ?? ''}`);
      const overlap = [...mine].filter((x) => t.has(x)).length;
      return { p, score: overlap + (p.fm.pillar && p.fm.pillar === newPost.fm.pillar ? 2 : 0) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.p);
}

/**
 * Small edit: one "Related" line at the end of an older post. updatedDate is deliberately NOT bumped,
 * because adding a link is not a material content change (PRD: bump only when content really changes).
 */
export function addBackLink(older: Post, newPost: Post): Post {
  const line = `Related: [${newPost.fm.title}](/blog/${newPost.slug}/)`;
  return { ...older, body: older.body.trimEnd() + `\n\n${line}\n` };
}

export interface PublishOutcome { published?: string; title?: string; reason: string; due: boolean; setAside: { slug: string; reason: string }[]; backlinked: string[] }

/**
 * Put the oldest queued post live. Safe to run any number of times: the schedule rule and hard caps read the published log,
 * and a queued post whose slug is already live is just dropped from the queue.
 */
export function publishFromQueue(o: { dryRun: boolean; now?: Date; ignoreInterval?: boolean; site?: boolean; virtual?: QueueItem[] }): PublishOutcome {
  const cfg = loadConfig();
  const now = o.now ?? new Date();
  const out: PublishOutcome = { reason: '', due: false, setAside: [], backlinked: [] };
  const d = decide({ now, cfg, health: loadHealth(), log: loadPublished(), ignoreInterval: o.ignoreInterval });
  out.reason = d.reason;
  if (!d.publish) return out;
  out.due = true;

  const queue = [...listQueue(), ...(o.virtual ?? [])];
  while (queue.length) {
    const item = queue.shift()!;
    const { post, meta } = item;
    if (fs.existsSync(path.join(BLOG_DIR, `${post.slug}.md`)) || loadPublished().some((e) => e.slug === post.slug)) {
      if (!o.dryRun) dequeue(post.slug);
      console.log(`${post.slug} is already live; dropped from the queue`);
      continue;
    }
    // Last look before it goes live. A post that no longer passes (a link target vanished, say) is set aside, and the next one is tried.
    const ctx = gateContext(cfg);
    const gates = runDeterministicGates(post, ctx);
    if (!allPassed(gates)) {
      const reason = `no longer passes: ${gates.filter((g) => !g.ok).map((g) => `${g.id} (${g.detail})`).join('; ').slice(0, 300)}`;
      out.setAside.push({ slug: post.slug, reason });
      console.error(`set aside queued ${post.slug}: ${reason}`);
      if (!o.dryRun) { saveRejected(new RejectedDraft(reason, post, summarize(gates))); dequeue(post.slug); }
      continue;
    }

    const live = structuredClone(post);
    live.fm.date = mtParts(now).date;
    if (o.dryRun) {
      console.log(`[dry-run] would publish /blog/${post.slug}/ ("${live.fm.title}")`);
      return { ...out, published: post.slug, title: live.fm.title, reason: `would publish ${post.slug}` };
    }
    const changed = [writePost(live)];
    const backlinked: string[] = [];
    for (const target of backlinkTargets(live, loadPosts().filter((p) => p.slug !== live.slug))) {
      changed.push(writePost(addBackLink(target, live)));
      backlinked.push(target.slug);
    }
    if (o.site !== false) {
      const checks = buildCheck();
      if (!checks.every((c) => c.ok)) {
        // Undo this post's files so nothing broken can ship, then stop loudly.
        for (const f of changed) fs.rmSync(f, { force: true });
        throw new Error(`site build/validation failed with ${post.slug} in place: ${checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`).join(' | ')}`);
      }
    }
    const entry: PublishedEntry = {
      slug: live.slug, keyword: meta.keyword, title: live.fm.title, format: meta.format, pillar: meta.pillar,
      publishedAt: now.toISOString(), gateSummary: meta.gateText.split('\n').some((l) => l.startsWith('FAIL')) ? 'has failures' : 'all gates passed',
      editorScores: meta.scores as unknown as Record<string, number>, status: 'live',
    };
    savePublished([...loadPublished(), entry]);
    const backlog = loadBacklog();
    const bi = backlog.find((b) => normalizeKeyword(b.keyword) === normalizeKeyword(meta.keyword));
    if (bi) bi.status = 'published';
    saveBacklog(backlog);
    dequeue(post.slug);
    return { ...out, published: live.slug, title: live.fm.title, reason: `published ${live.slug}`, backlinked };
  }
  out.reason = out.setAside.length ? 'every queued post was set aside' : 'due, but the queue is empty';
  return out;
}
