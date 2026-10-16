// The ready queue: finished, gate-passing posts waiting to go live. The writer fills it, the publisher (no model calls) drains it.
// Each entry is two committed files: queue/<slug>.md (the post) and queue/<slug>.json (what the publisher needs to log it).
import fs from 'node:fs';
import path from 'node:path';
import { enginePath, readJson, writeJson } from './paths.js';
import { parsePost, serializePost, type Post } from './post.js';
import type { EditorScores } from './gates.js';
import type { Pillar, PublishedEntry } from './state.js';

export const QUEUE_TARGET = 2;
export const queueDir = () => enginePath('queue');

export interface QueueMeta {
  slug: string; keyword: string; pillar: Pillar; format: string; queuedAt: string; gateText: string; scores?: EditorScores;
}
export interface QueueItem { meta: QueueMeta; post: Post }

export function enqueue(item: QueueItem, dir = queueDir()): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${item.meta.slug}.md`), serializePost(item.post));
  writeJson(path.join(dir, `${item.meta.slug}.json`), item.meta);
}

/** Oldest first, so posts go live in the order they were written (the writer chose formats and pillars with that order in mind). */
export function listQueue(dir = queueDir()): QueueItem[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const slug = f.replace(/\.json$/, '');
      const meta = readJson<QueueMeta | null>(path.join(dir, f), null);
      const md = path.join(dir, `${slug}.md`);
      if (!meta || !fs.existsSync(md)) return null;
      return { meta, post: parsePost(slug, fs.readFileSync(md, 'utf8')) };
    })
    .filter((x): x is QueueItem => x !== null)
    .sort((a, b) => a.meta.queuedAt.localeCompare(b.meta.queuedAt));
}

export function dequeue(slug: string, dir = queueDir()): void {
  fs.rmSync(path.join(dir, `${slug}.md`), { force: true });
  fs.rmSync(path.join(dir, `${slug}.json`), { force: true });
}

/** Queued posts shown to the topic picker and variety gates as if already published, so the writer doesn't repeat a format or pillar. */
export const queuedAsPublished = (q: QueueItem[]): PublishedEntry[] =>
  q.map((i) => ({ slug: i.meta.slug, keyword: i.meta.keyword, title: i.post.fm.title, format: i.meta.format, pillar: i.meta.pillar, publishedAt: i.meta.queuedAt, gateSummary: 'queued' }));
