// Fact-check: fetch every cited URL, confirm each claim appears there, drop dead links, remove unsupported claims.
import YAML from 'yaml';
import type { Config } from '../lib/config.js';
import { Budget, ask, askJson, splitDelimited } from '../lib/claude.js';
import { fetchPageText, type PageFetch } from '../lib/http.js';
import type { Post } from '../lib/post.js';
import { links } from '../lib/gates.js';
import { prompt } from '../lib/pipeline.js';

interface Claim { id: number; sentence: string; claim: string; url: string | null }
export interface FactReport { deadLinks: string[]; checked: number; unsupported: string[]; rewrites: number; ok: boolean }

const isExternal = (h: string) => /^https?:\/\//.test(h) && !/^https?:\/\/(www\.)?mayflywebdesign\.com/i.test(h);

export async function factCheck(post: Post, cfg: Config, budget: Budget, fetcher: (u: string) => Promise<PageFetch> = fetchPageText): Promise<{ post: Post; report: FactReport }> {
  const report: FactReport = { deadLinks: [], checked: 0, unsupported: [], rewrites: 0, ok: false };
  let cur = structuredClone(post);

  // 1. Verify every external link returns 200; drop dead ones (keep the anchor text).
  const pages = new Map<string, PageFetch>();
  for (const url of new Set(links(cur.body).map((l) => l.href).filter(isExternal).concat((cur.fm.sources ?? []).map((s) => s.url)))) {
    pages.set(url, await fetcher(url));
  }
  for (const [url, page] of pages) {
    if (page.ok) continue;
    report.deadLinks.push(url);
    const esc = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cur.body = cur.body.replace(new RegExp(`\\[([^\\]]+)\\]\\(${esc}\\)`, 'g'), '$1');
    cur.fm.sources = (cur.fm.sources ?? []).filter((s) => s.url !== url);
  }

  // 2 + 3. Extract claims, verify against the fetched page, rewrite what isn't supported. Up to 2 passes.
  for (let pass = 0; pass < 2; pass++) {
    const { claims } = await askJson<{ claims: Claim[] }>({
      model: cfg.models.factCheck, system: prompt('extract-claims'), user: cur.body, maxTokens: 6000, budget,
    });
    report.checked = claims.length;
    if (!claims.length) { report.ok = true; break; }
    const bundle = claims.map((c) => ({ id: c.id, claim: c.claim, page: c.url ? (pages.get(c.url)?.text ?? '').slice(0, 30000) : '' }));
    const { results } = await askJson<{ results: { id: number; supported: boolean }[] }>({
      model: cfg.models.factCheck, system: prompt('factcheck'), user: JSON.stringify(bundle), maxTokens: 6000, budget,
    });
    const bad = claims.filter((c) => !results.find((r) => r.id === c.id)?.supported || !c.url);
    report.unsupported = bad.map((b) => b.sentence);
    if (!bad.length) { report.ok = true; break; }
    if (pass === 1) break; // still unsupported after one rewrite: fail the post

    // Remove or rewrite unsupported claims; never leave them in.
    const raw = await ask({
      model: cfg.models.humanize,
      system: `You are a fact-check editor. The listed sentences make claims that their cited sources do not support. Remove each claim, or rewrite the sentence so it says only what is safe without a statistic. Keep every other word, link, heading and the frontmatter exactly as is. Do not add new facts. No em dashes. Return the full post as:\n===FRONTMATTER===\n(yaml)\n===BODY===\n(markdown)`,
      user: `UNSUPPORTED SENTENCES:\n${bad.map((b, i) => `${i + 1}. ${b.sentence}`).join('\n')}\n\nPOST:\n===FRONTMATTER===\n${YAML.stringify(cur.fm, { lineWidth: 0 }).trim()}\n===BODY===\n${cur.body}`,
      effort: 'low', maxTokens: 16000, budget,
    });
    const out = splitDelimited(raw);
    cur = { ...cur, body: out.body };
    report.rewrites++;
  }
  return { post: cur, report };
}
