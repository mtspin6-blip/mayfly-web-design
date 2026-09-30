import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.js';
import { parsePost, type Post } from '../lib/post.js';
import type { GateContext } from '../lib/gates.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const goodPost = (): Post =>
  parsePost('how-long-small-business-website', fs.readFileSync(path.join(here, 'fixtures/good-post.md'), 'utf8'));

export const clone = (p: Post): Post => structuredClone(p);

export function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    cfg: loadConfig(),
    existing: [],
    published: [],
    knownPaths: [
      '/services/website-design/', '/services/seo-gaio/', '/services/ai-automations/', '/pricing/', '/about/', '/contact/',
      '/web-design/missoula/', '/blog/montana-website-cost-guide/',
    ],
    ...overrides,
  };
}
