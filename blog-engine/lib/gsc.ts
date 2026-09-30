// Google Search Console + URL Inspection via a service account. All calls degrade to null when creds are absent.
import { JWT } from 'google-auth-library';
import { fetchRetry } from './http.js';

const SCOPE = ['https://www.googleapis.com/auth/webmasters'];

export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

export function gscConfigured(): boolean {
  return !!process.env.GSC_SERVICE_ACCOUNT_JSON;
}

async function token(): Promise<string | null> {
  if (!gscConfigured()) return null;
  const creds = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON!);
  const jwt = new JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPE });
  const t = await jwt.getAccessToken();
  return t.token ?? null;
}

export const gscProperty = () => process.env.GSC_PROPERTY || 'sc-domain:mayflywebdesign.com';

export async function searchAnalytics(opts: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number; filters?: unknown[] }): Promise<GscRow[] | null> {
  const t = await token();
  if (!t) return null;
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscProperty())}/searchAnalytics/query`;
  const res = await fetchRetry(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: opts.startDate, endDate: opts.endDate, dimensions: opts.dimensions, rowLimit: opts.rowLimit ?? 1000, dimensionFilterGroups: opts.filters ? [{ filters: opts.filters }] : undefined }),
  });
  if (!res.ok) throw new Error(`GSC searchAnalytics ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { rows?: GscRow[] };
  return j.rows ?? [];
}

export type IndexVerdict = 'indexed' | 'not-indexed' | 'unknown';
export async function inspectUrl(pageUrl: string): Promise<{ verdict: IndexVerdict; coverage: string } | null> {
  const t = await token();
  if (!t) return null;
  const res = await fetchRetry('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: pageUrl, siteUrl: gscProperty() }),
  });
  if (!res.ok) throw new Error(`URL Inspection ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string } } };
  const r = j.inspectionResult?.indexStatusResult;
  const coverage = r?.coverageState ?? 'unknown';
  const verdict: IndexVerdict = r?.verdict === 'PASS' ? 'indexed' : r?.verdict === 'NEUTRAL' || r?.verdict === 'FAIL' ? 'not-indexed' : 'unknown';
  return { verdict, coverage };
}

export async function submitSitemap(sitemapUrl: string): Promise<boolean> {
  const t = await token();
  if (!t) return false;
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscProperty())}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const res = await fetchRetry(url, { method: 'PUT', headers: { Authorization: `Bearer ${t}` } });
  return res.ok;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
