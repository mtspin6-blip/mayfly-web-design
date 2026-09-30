import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_URL } from '../lib/site';

export async function GET() {
  const posts = (await getCollection('blog', (p) => !p.data.draft && !p.data.noindex)).sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );
  return rss({
    title: 'Mayfly Web Design Blog',
    description: 'Web design, local SEO and AI search guides for Montana small businesses.',
    site: SITE_URL,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description ?? p.data.excerpt,
      pubDate: new Date(p.data.date),
      link: `/blog/${p.slug}/`,
      categories: [p.data.category],
    })),
  });
}
