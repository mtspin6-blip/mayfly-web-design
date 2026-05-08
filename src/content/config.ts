import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(),
    category: z.string(),
    readTime: z.string(),
    author: z.string().default('Mayfly Web Design'),
    image: image().optional(),
  }),
});

export const collections = { blog };
