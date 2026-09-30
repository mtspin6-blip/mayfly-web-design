// Commit the passing post with a full audit trail. Also adds back-links from 2-3 related older posts.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../lib/config.js';
import { loadPosts, writePost, type Post } from '../lib/post.js';
import { loadPublished, savePublished, loadBacklog, saveBacklog, STATE_FILES, type PublishedEntry, type Pillar } from '../lib/state.js';
import type { EditorScores } from '../lib/gates.js';
import { ROOT, BLOG_DIR } from '../lib/paths.js';
import { normalizeKeyword } from '../lib/text.js';
import { links } from '../lib/gates.js';

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

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

export interface PublishOpts {
  post: Post; scores?: EditorScores; gateText: string; item: { keyword: string; pillar: Pillar }; cfg: Config; dryRun: boolean;
}

export function publish(o: PublishOpts): { slug: string; committed: boolean; backlinked: string[] } {
  const { post, dryRun } = o;
  const file = path.join(BLOG_DIR, `${post.slug}.md`);
  if (dryRun) {
    fs.rmSync(file, { force: true });
    console.log(`[dry-run] would publish /blog/${post.slug}/ ("${post.fm.title}")`);
    return { slug: post.slug, committed: false, backlinked: [] };
  }
  writePost(post);
  const changed = [file];
  const backlinked: string[] = [];
  for (const target of backlinkTargets(post, loadPosts().filter((p) => p.slug !== post.slug))) {
    changed.push(writePost(addBackLink(target, post)));
    backlinked.push(target.slug);
  }
  const log = loadPublished();
  const entry: PublishedEntry = {
    slug: post.slug, keyword: o.item.keyword, title: post.fm.title, format: String(post.fm.format), pillar: o.item.pillar,
    publishedAt: new Date().toISOString(), gateSummary: o.gateText.split('\n').filter((l) => l.startsWith('FAIL')).length ? 'has failures' : 'all gates passed',
    editorScores: o.scores as unknown as Record<string, number>, status: 'live',
  };
  savePublished([...log, entry]);
  const backlog = loadBacklog();
  const bi = backlog.find((b) => normalizeKeyword(b.keyword) === normalizeKeyword(o.item.keyword));
  if (bi) bi.status = 'published';
  saveBacklog(backlog);
  changed.push(STATE_FILES.published, STATE_FILES.backlog);
  if (fs.existsSync(STATE_FILES.spend)) changed.push(STATE_FILES.spend);

  git('add', ...changed);
  const s = o.scores;
  const msg = [
    `blog: publish "${post.fm.title}"`,
    '',
    `keyword: ${o.item.keyword}`,
    `format: ${post.fm.format}  pillar: ${o.item.pillar}`,
    s ? `editor: helpfulness ${s.helpfulness}, original ${s.originalValue}, accuracy ${s.accuracy}, specificity ${s.specificity}, voice ${s.voice}, intent ${s.intentMatch}, honesty ${s.honesty}` : 'editor: n/a',
    backlinked.length ? `back-links added to: ${backlinked.join(', ')}` : 'back-links: none',
    '',
    'gates:',
    o.gateText,
  ].join('\n');
  git('commit', '-m', msg);
  return { slug: post.slug, committed: true, backlinked };
}
