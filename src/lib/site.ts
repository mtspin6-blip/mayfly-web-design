// Single source of truth for site-wide constants used by layouts, schema and feeds.
export const SITE_URL = 'https://mayflywebdesign.com';
export const SITE_NAME = 'Mayfly Web Design';
export const AUTHOR = {
  name: 'Mitchell Spinetta',
  jobTitle: 'Founder',
  url: `${SITE_URL}/about/`,
};
export const BOOKING_URL = 'https://cal.com/mayflywebdesign/discovery';

export const PILLARS = {
  'website-cost': {
    title: 'Website Cost & Choosing',
    blurb: 'What a small business website really costs in Montana, and how to pick the right kind.',
  },
  'local-seo': {
    title: 'Local SEO & Google Business Profile',
    blurb: 'Getting found on Google Maps and in "near me" searches across Montana.',
  },
  'ai-search': {
    title: 'AI Search & GAIO',
    blurb: 'Showing up when people ask ChatGPT, Claude and Perplexity for a local business.',
  },
  'niche-guides': {
    title: 'Website Guides by Industry',
    blurb: 'What outfitters, breweries, contractors and other Montana trades need on their site.',
  },
  automations: {
    title: 'Automations',
    blurb: 'Lead follow-up, review requests and booking that run without you.',
  },
  'website-problems': {
    title: 'Website Problems',
    blurb: 'Signs your website is costing you leads, and what to fix first.',
  },
} as const;

export type PillarSlug = keyof typeof PILLARS;

// Existing posts predate the `pillar` field; map their category to a pillar.
const CATEGORY_TO_PILLAR: Record<string, PillarSlug> = {
  Pricing: 'website-cost',
  SEO: 'local-seo',
  'AI Search': 'ai-search',
  Automations: 'automations',
  'Web Design': 'website-problems',
};

export function pillarOf(data: { pillar?: string; category: string }): PillarSlug {
  if (data.pillar && data.pillar in PILLARS) return data.pillar as PillarSlug;
  return CATEGORY_TO_PILLAR[data.category] ?? 'website-problems';
}

/** Absolute, trailing-slash canonical URL on the apex host, whatever host served the request. */
export function canonicalFor(pathname: string): string {
  const p = pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname) ? pathname : `${pathname}/`;
  return `${SITE_URL}${p}`;
}
