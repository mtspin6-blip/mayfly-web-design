import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    // <title> override for posts whose H1 is too long for search results.
    seoTitle: z.string().optional(),
    excerpt: z.string(),
    // Meta description (140-155 chars). Falls back to the excerpt when absent.
    description: z.string().optional(),
    date: z.string(),
    updatedDate: z.string().optional(),
    category: z.string(),
    readTime: z.string(),
    author: z.string().default('Mitchell Spinetta'),
    image: image().optional(),
    pillar: z.enum([
      'website-cost', 'local-seo', 'ai-search', 'niche-guides', 'automations', 'website-problems',
    ]).optional(),
    // Post format, tracked so consecutive posts never share a skeleton.
    format: z.enum([
      'how-to', 'cost-breakdown', 'checklist', 'comparison', 'myth-vs-fact', 'decision-guide', 'glossary',
    ]).optional(),
    primaryKeyword: z.string().optional(),
    sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    // CTA button wording, rotated by the engine.
    cta: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
