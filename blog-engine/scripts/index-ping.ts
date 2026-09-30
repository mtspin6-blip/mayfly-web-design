// After the push: wait for Cloudflare Pages to serve the post, then notify IndexNow (Bing etc.), submit the sitemap
// to Google via Search Console, and record a PageSpeed Insights reading. Google itself does NOT use IndexNow.
import { fetchRetry, sleep } from '../lib/http.js';
import { indexNow } from '../lib/sources.js';
import { submitSitemap, gscConfigured } from '../lib/gsc.js';
import { psiMobile } from '../lib/psi.js';
import { enginePath, readJson, writeJson } from '../lib/paths.js';

export async function waitForLive(url: string, maxMinutes = 12): Promise<boolean> {
  for (let i = 0; i < maxMinutes * 2; i++) {
    try {
      const res = await fetchRetry(url, {}, 1, 15000);
      if (res.ok) return true;
    } catch { /* not deployed yet */ }
    await sleep(30000);
  }
  return false;
}

export async function ping(slug: string): Promise<string[]> {
  const base = 'https://mayflywebdesign.com';
  const url = `${base}/blog/${slug}/`;
  const out: string[] = [];
  const live = await waitForLive(url);
  out.push(live ? `live: ${url}` : `NOT live after 12 min: ${url} (pings skipped)`);
  if (!live) return out;
  const inow = await indexNow([url, `${base}/blog/`, `${base}/sitemap-index.xml`]);
  out.push(inow ? `IndexNow ${inow.status}` : 'IndexNow skipped (INDEXNOW_KEY not set)');
  out.push(gscConfigured() ? `sitemap submitted to Search Console: ${await submitSitemap(`${base}/sitemap-index.xml`)}` : 'Search Console sitemap submit skipped (no credentials)');
  const psi = await psiMobile(url);
  if (psi) {
    const file = enginePath('data/psi-log.json');
    const log = readJson<Record<string, unknown>[]>(file, []);
    log.push({ slug, at: new Date().toISOString(), ...psi });
    writeJson(file, log);
    out.push(`PageSpeed mobile ${psi.performance}`);
  } else out.push('PageSpeed reading unavailable');
  return out;
}

if (process.argv[1]?.endsWith('index-ping.ts')) {
  const slug = process.argv[2];
  if (!slug) { console.error('usage: index-ping.ts <slug>'); process.exit(1); }
  ping(slug).then((l) => console.log(l.join('\n')));
}
