// IndexNow ownership file. Served only when INDEXNOW_KEY is set at build time (Cloudflare Pages env var).
import type { APIRoute, GetStaticPaths } from 'astro';

export const getStaticPaths: GetStaticPaths = () => {
  const key = import.meta.env.INDEXNOW_KEY;
  return key && /^[a-zA-Z0-9-]{8,128}$/.test(key) ? [{ params: { indexnowKey: key } }] : [];
};

export const GET: APIRoute = ({ params }) =>
  new Response(params.indexnowKey, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
