import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(),
    category: z.string(),
    readTime: z.string(),
    author: z.string().default('Mitchell Spinetta'),
  }),
});

export const collections = { blog };
