// Build-time branded Open Graph images (1200x630): warm black ground, sage rule, Fraunces + DM Sans.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

const font = (pkg: string, file: string) =>
  fs.readFileSync(path.resolve('node_modules/@fontsource', pkg, 'files', file));

const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
});

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getCollection('blog', (p) => !p.data.draft);
  return [
    { params: { slug: 'default' }, props: { title: 'Websites, automations and search for Montana small businesses', eyebrow: 'Mayfly Web Design' } },
    ...posts.map((p) => ({
      params: { slug: p.slug },
      props: { title: p.data.title, eyebrow: p.data.category },
    })),
  ];
};

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow: string };
  const size = title.length > 70 ? 54 : title.length > 45 ? 64 : 76;

  const tree = el('div', {
    width: '100%', height: '100%', backgroundColor: '#161614', flexDirection: 'column',
    justifyContent: 'space-between', padding: '72px 80px', borderLeft: '14px solid #5E7E58',
  }, [
    el('div', { fontFamily: 'DM Sans', fontSize: 26, letterSpacing: 4, color: '#B8882E', textTransform: 'uppercase' }, eyebrow),
    el('div', { fontFamily: 'Fraunces', fontWeight: 300, fontSize: size, lineHeight: 1.1, color: '#F2EDE3', letterSpacing: -1.5 }, title),
    el('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, [
      el('div', { fontFamily: 'DM Sans', fontSize: 28, color: '#F2EDE3', fontWeight: 500 }, 'Mayfly Web Design'),
      el('div', { fontFamily: 'DM Sans', fontSize: 24, color: '#9DB597' }, 'mayflywebdesign.com'),
    ]),
  ]);

  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Fraunces', data: font('fraunces', 'fraunces-latin-300-normal.woff'), weight: 300, style: 'normal' },
      { name: 'DM Sans', data: font('dm-sans', 'dm-sans-latin-400-normal.woff'), weight: 400, style: 'normal' },
      { name: 'DM Sans', data: font('dm-sans', 'dm-sans-latin-500-normal.woff'), weight: 500, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
