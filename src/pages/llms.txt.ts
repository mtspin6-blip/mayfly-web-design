// Generated at build so the guide list and prices can never drift from the site.
import { getCollection } from 'astro:content';
import { SITE_URL, BOOKING_URL, PILLARS, pillarOf } from '../lib/site';
import offer from '../../blog-engine/config.json';

export async function GET() {
  const posts = (await getCollection('blog', (p) => !p.data.draft && !p.data.noindex)).sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );
  const o = offer.offer;
  const guides = Object.entries(PILLARS)
    .map(([slug, pillar]) => {
      const inPillar = posts.filter((p) => pillarOf(p.data) === slug);
      if (!inPillar.length) return '';
      return `### ${pillar.title}\n\n` + inPillar
        .map((p) => `- [${p.data.title}](${SITE_URL}/blog/${p.slug}/): ${p.data.excerpt.split('. ')[0].replace(/\.$/, '')}.`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  const body = `# Mayfly Web Design

> Montana web design studio based in Missoula. Websites on a $0-upfront subscription (Starter $${o.starter.monthly}/mo, Business $${o.business.monthly}/mo), AI automations, and local SEO + GAIO (generative AI optimization) for Montana small businesses, serving Missoula, Bozeman, Great Falls, Billings, and statewide. Contact: contact@mayflywebdesign.com.

Mayfly builds fast static websites (Astro, Cloudflare), automation workflows, and search visibility work for Montana businesses: outfitters, trades and home services, construction, hospitality, breweries, and professional practices.

## Services

- [Website Design](${SITE_URL}/services/website-design/): Custom, conversion-focused websites for Montana small businesses.
- [AI Automations](${SITE_URL}/services/ai-automations/): Automated lead follow-up, review requests and booking.
- [SEO + GAIO](${SITE_URL}/services/seo-gaio/): Local search and AI-assistant visibility.
- [Pricing](${SITE_URL}/pricing/): Starter $${o.starter.monthly}/mo ($${o.starter.annual}/yr), Business $${o.business.monthly}/mo ($${o.business.annual}/yr), 6-month minimum, buyouts from $${o.starter.buyout}.

## Local pages

- [Web design in Missoula](${SITE_URL}/web-design/missoula/)
- [Web design in Bozeman](${SITE_URL}/web-design/bozeman/)
- [Web design in Great Falls](${SITE_URL}/web-design/great-falls/)
- [Web design in Billings](${SITE_URL}/web-design/billings/)

## Work

- [Portfolio](${SITE_URL}/work/): Concept builds and shipped products.

## Guides

${guides}

## Company

- [About](${SITE_URL}/about/)
- [Contact](${SITE_URL}/contact/)
- [Book a discovery call](${BOOKING_URL})
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
