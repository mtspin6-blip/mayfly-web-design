import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';

// Accurate <lastmod> for blog URLs: read date / updatedDate from post frontmatter.
const blogDir = path.resolve('src/content/blog');
const lastmodBySlug = new Map();
for (const file of fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'))) {
  const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  if (/^draft:\s*true/m.test(fm)) continue;
  const get = (k) => ((fm.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?`, 'm')) || [])[1] || '').trim();
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
      filter: (page) => !page.includes('/services/seo-geo'),
      serialize(item) {
        const m = item.url.match(/\/blog\/([^/]+)\/?$/);
        if (m && lastmodBySlug.has(m[1])) item.lastmod = lastmodBySlug.get(m[1]).toISOString();
        return item;
      },
    }),
  ],
});
