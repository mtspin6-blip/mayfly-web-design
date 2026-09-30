import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';

// Accurate <lastmod> for blog URLs: read date / updatedDate from post frontmatter.
const blogDir = path.resolve('src/content/blog');
const lastmodBySlug = new Map();
const noindexSlugs = new Set();
const CATEGORY_TO_PILLAR = { Pricing: 'website-cost', SEO: 'local-seo', 'AI Search': 'ai-search', Automations: 'automations', 'Web Design': 'website-problems' };
const pillarCounts = new Map();
const HUB_MIN_POSTS = 3; // keep in sync with src/lib/site.ts
for (const file of fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  if (/^draft:\s*true/m.test(fm)) continue;
  if (/^noindex:\s*true/m.test(fm)) { noindexSlugs.add(file.replace(/\.md$/, '')); continue; }
  const get = (k) => ((fm.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?`, 'm')) || [])[1] || '').trim();
  const pillar = get('pillar') || CATEGORY_TO_PILLAR[get('category')] || 'website-problems';
  pillarCounts.set(pillar, (pillarCounts.get(pillar) || 0) + 1);
  const d = get('updatedDate') || get('date');
  if (d) lastmodBySlug.set(file.replace(/\.md$/, ''), new Date(d));
}

export default defineConfig({
  site: 'https://mayflywebdesign.com',
  trailingSlash: 'ignore',
  // Stylesheets are small; inlining removes render-blocking round trips.
  build: { inlineStylesheets: 'always' },
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap({
      filter: (page) => {
        if (page.includes('/services/seo-geo')) return false;
        const hub = page.match(/\/blog\/topic\/([^/]+)\/?$/);
        if (hub) return (pillarCounts.get(hub[1]) || 0) >= HUB_MIN_POSTS;
        const m = page.match(/\/blog\/([^/]+)\/?$/);
        return !(m && noindexSlugs.has(m[1]));
      },
      serialize(item) {
        const m = item.url.match(/\/blog\/([^/]+)\/?$/);
        if (m && lastmodBySlug.has(m[1])) item.lastmod = lastmodBySlug.get(m[1]).toISOString();
        return item;
      },
    }),
  ],
});
