// PageSpeed Insights API (free) for live URLs. Used after deploy; the pre-publish gate uses local Lighthouse.
import { fetchRetry } from './http.js';

export async function psiMobile(url: string): Promise<{ performance: number; lcpMs?: number } | null> {
  try {
    const key = process.env.PSI_API_KEY ? `&key=${process.env.PSI_API_KEY}` : '';
    const res = await fetchRetry(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key}`, {}, 2, 90000);
    if (!res.ok) return null;
    const j = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> } };
    const score = j.lighthouseResult?.categories?.performance?.score;
    if (score == null) return null;
    return { performance: Math.round(score * 100), lcpMs: j.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue };
  } catch {
    return null;
  }
}
