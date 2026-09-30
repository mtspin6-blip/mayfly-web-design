import YAML from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import { BLOG_DIR } from './paths.js';

export interface Frontmatter {
  title: string;
  seoTitle?: string;
  description?: string;
  excerpt: string;
  date: string;
  updatedDate?: string;
  category: string;
  readTime: string;
  author: string;
  pillar?: string;
  format?: string;
  primaryKeyword?: string;
  sources?: { title: string; url: string }[];
  faq?: { q: string; a: string }[];
  cta?: string;
  draft?: boolean;
  noindex?: boolean;
  titleTest?: { from: string; fromDescription?: string; to: string; at: string; baselineCtr?: number };
  [k: string]: unknown;
}

export interface Post {
  slug: string;
  fm: Frontmatter;
  body: string;
}

export function parsePost(slug: string, raw: string): Post {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`Post ${slug} has no frontmatter`);
  return { slug, fm: YAML.parse(m[1]) as Frontmatter, body: m[2].trim() + '\n' };
}

export function serializePost(p: Post): string {
  // Astro's YAML reader turns bare 2026-10-06 into a Date; the content schema wants a string, so quote date fields.
  const fm = YAML.stringify(p.fm, { lineWidth: 0 })
    .trimEnd()
    .replace(/^(date|updatedDate|at): (\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?)$/gm, '$1: "$2"');
  return `---\n${fm}\n---\n\n${p.body.trim()}\n`;
}

export function loadPosts(dir = BLOG_DIR): Post[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parsePost(f.replace(/\.md$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function writePost(p: Post, dir = BLOG_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${p.slug}.md`);
  fs.writeFileSync(file, serializePost(p));
  return file;
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 8).join('-');
