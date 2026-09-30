// Free keyword-demand sources. Each function fails soft: on any error it returns [] and the run continues.
import { cached, fetchRetry, sleep } from './http.js';

const QUESTION_PREFIXES = ['how', 'what', 'why', 'does', 'can', 'should', 'how much'];

export async function autocomplete(q: string): Promise<string[]> {
  try {
    return await cached(`ac:${q}`, 7 * 86400000, async () => {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${encodeURIComponent(q)}`;
      const res = await fetchRetry(url, {}, 3, 10000);
      if (!res.ok) return [];
      const j = (await res.json()) as [string, string[]];
      await sleep(400 + Math.random() * 300); // stay polite; this endpoint is unofficial
      return Array.isArray(j[1]) ? j[1] : [];
    });
  } catch {
    return [];
  }
}

/** Expand a seed by letters a-z and question prefixes. Returns suggestion -> depth (how many probes surfaced it). */
export async function expandSeed(seed: string, opts: { letters?: boolean } = {}): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const probes = [seed, ...QUESTION_PREFIXES.map((p) => `${p} ${seed}`)];
  if (opts.letters) probes.push(...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => `${seed} ${l}`));
  for (const p of probes) {
    for (const s of await autocomplete(p)) out.set(s.toLowerCase(), (out.get(s.toLowerCase()) ?? 0) + 1);
  }
  return out;
}

export async function trendsInterest(keyword: string): Promise<number | null> {
  try {
    const mod = await import('google-trends-api');
    const api = (mod as { default?: { interestOverTime: (o: unknown) => Promise<string> } }).default ?? (mod as never);
    const raw = await cached(`trends:${keyword}`, 14 * 86400000, () =>
      (api as { interestOverTime: (o: unknown) => Promise<string> }).interestOverTime({ keyword, geoCode: 'US-MT' }),
    );
    const j = JSON.parse(raw) as { default: { timelineData: { value: number[] }[] } };
    const vals = j.default.timelineData.map((d) => d.value[0]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  } catch {
    return null; // Trends is unofficial and breaks often. Treat as optional.
  }
}

// ---- Bing Webmaster Tools (verified site, free API key) ----
const BING = 'https://ssl.bing.com/webmaster/api.svc/json';
export const bingConfigured = () => !!process.env.BING_WEBMASTER_API_KEY;

export async function bingQueryStats(siteUrl = 'https://mayflywebdesign.com/'): Promise<{ query: string; impressions: number; clicks: number; avgImpressionPosition: number }[]> {
  if (!bingConfigured()) return [];
  try {
    const res = await fetchRetry(`${BING}/GetQueryStats?apikey=${process.env.BING_WEBMASTER_API_KEY}&siteUrl=${encodeURIComponent(siteUrl)}`);
    if (!res.ok) return [];
    const j = (await res.json()) as { d?: { Query: string; Impressions: number; Clicks: number; AvgImpressionPosition: number }[] };
    return (j.d ?? []).map((r) => ({ query: r.Query, impressions: r.Impressions, clicks: r.Clicks, avgImpressionPosition: r.AvgImpressionPosition }));
  } catch {
    return [];
  }
}

export async function bingRelatedKeywords(q: string): Promise<string[]> {
  if (!bingConfigured()) return [];
  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const url = `${BING}/GetRelatedKeywords?apikey=${process.env.BING_WEBMASTER_API_KEY}&q=${encodeURIComponent(q)}&country=us&language=en-US&startDate=${start}&endDate=${end}`;
    const res = await fetchRetry(url);
    if (!res.ok) return [];
    const j = (await res.json()) as { d?: { Query: string }[] };
    return (j.d ?? []).map((r) => r.Query);
  } catch {
    return [];
  }
}

// ---- IndexNow (Bing, Yandex, others; Google does not participate) ----
export async function indexNow(urls: string[]): Promise<{ ok: boolean; status: number } | null> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !urls.length) return null;
  const res = await fetchRetry('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'mayflywebdesign.com', key, keyLocation: `https://mayflywebdesign.com/${key}.txt`, urlList: urls }),
  });
  return { ok: res.ok, status: res.status };
}
