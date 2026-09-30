// Brief (with web research) then draft. Both are model calls; everything the model returns is treated as untrusted.
import YAML from 'yaml';
import { type Config } from '../lib/config.js';
import { Budget, ask, askJson, splitDelimited } from '../lib/claude.js';
import { slugify, type Post, type Frontmatter } from '../lib/post.js';
import type { BacklogItem } from '../lib/state.js';
import { prompt, loadVoice, loadNotes, STYLE_RULES, type Format } from '../lib/pipeline.js';
import { mtParts } from '../lib/schedule.js';
import { wordCount, stripMarkdown } from '../lib/text.js';
import { links, h2s, internalPath } from '../lib/gates.js';

export interface Brief {
  title: string; slug: string; searcherQuestion: string; intent: string; serpNotes: string; directAnswer: string;
  outline: { h2: string; points: string[] }[];
  originalValue: { type: string; description: string };
  facts: { claim: string; sourceTitle: string; sourceUrl: string }[];
  internalLinks: string[]; faqCandidates: string[]; cta: string; category: string;
}

const CATEGORIES = ['Pricing', 'SEO', 'AI Search', 'Automations', 'Web Design'];

export interface DraftContext {
  cfg: Config; budget: Budget; item: BacklogItem; format: Format;
  existing: Post[]; recentCtas: string[]; knownPaths: string[];
}

export async function makeBrief(c: DraftContext): Promise<Brief> {
  const recentSkeletons = c.existing
    .sort((a, b) => Date.parse(b.fm.date) - Date.parse(a.fm.date))
    .slice(0, 3)
    .map((p) => `${p.slug}: ${h2s(p.body).join(' | ')}`);
  const user = JSON.stringify({
    today: mtParts(new Date()).date,
    primaryKeyword: c.item.keyword,
    secondaryQuestions: c.item.cluster.secondary,
    pillar: c.item.pillar,
    requiredFormat: c.format,
    ALLOWED_INTERNAL_LINKS: c.knownPaths,
    OFFER: c.cfg.offer,
    existingPosts: c.existing.map((p) => ({ slug: p.slug, title: p.fm.title, primaryKeyword: p.fm.primaryKeyword })),
    recentPostSkeletons: recentSkeletons,
    recentCtaWording: c.recentCtas,
  }, null, 2);
  const brief = await askJson<Brief>({
    model: c.cfg.models.brief, system: prompt('brief'), user, webSearch: { maxUses: 8 }, effort: 'high', maxTokens: 12000, budget: c.budget,
  });
  brief.slug = slugify(brief.slug || brief.title);
  brief.facts = (brief.facts ?? []).filter((f) => /^https?:\/\//.test(f.sourceUrl));
  return brief;
}

/** Parse writer/reviser output into a Post, forcing every field the pipeline (not the model) owns. */
export function buildPost(raw: string, c: { cfg: Config; item: { keyword: string; pillar: string }; format: string; brief: Brief; slug: string; prior?: Post }): Post {
  const { frontmatter, body: rawBody } = splitDelimited(raw);
  const fm = YAML.parse(frontmatter) as Frontmatter;
  let body = rawBody;

  // Strip any external link the brief didn't supply (the model may not invent sources).
  const allowed = new Set(c.brief.facts.map((f) => f.sourceUrl.replace(/\/$/, '')));
  body = body.replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, text: string, url: string) => {
    if (/^https?:\/\/(www\.)?mayflywebdesign\.com/i.test(url)) return m;
    return allowed.has(url.replace(/\/$/, '')) ? m : text;
  });
  const usedUrls = new Set(links(body).map((l) => l.href.replace(/\/$/, '')));
  const briefSources = new Map(c.brief.facts.map((f) => [f.sourceUrl.replace(/\/$/, ''), f.sourceTitle]));
  const sources = [...(fm.sources ?? [])]
    .filter((s) => allowed.has(String(s.url).replace(/\/$/, '')))
    .concat([...usedUrls].filter((u) => briefSources.has(u) && !(fm.sources ?? []).some((s) => String(s.url).replace(/\/$/, '') === u)).map((u) => ({ title: briefSources.get(u)!, url: u })));

  const wc = wordCount(stripMarkdown(body));
  const category = CATEGORIES.includes(String(fm.category)) ? String(fm.category) : CATEGORIES.includes(c.brief.category) ? c.brief.category : 'Web Design';
  const post: Post = {
    slug: c.slug,
    fm: {
      ...fm,
      title: String(fm.title).trim(),
      excerpt: String(fm.excerpt).trim(),
      description: String(fm.description ?? '').trim(),
      date: c.prior?.fm.date ?? mtParts(new Date()).date,
      category,
      readTime: `${Math.max(3, Math.round(wc / 200))} min read`,
      author: 'Mitchell Spinetta',
      pillar: c.item.pillar,
      format: c.format,
      primaryKeyword: c.item.keyword,
      sources: [...new Map(sources.map((s) => [String(s.url), { title: String(s.title), url: String(s.url) }])).values()],
      faq: (fm.faq ?? []).map((f) => ({ q: String(f.q).trim(), a: String(f.a).trim() })),
      cta: fm.cta ? String(fm.cta).trim() : c.brief.cta,
      draft: false,
    },
    body,
  };
  // Normalize internal links to trailing-slash paths (the site uses them).
  post.body = post.body.replace(/\]\((https?:\/\/(?:www\.)?mayflywebdesign\.com)?(\/[^)\s#?]*)([#?][^)\s]*)?\)/g, (_m, _h, p: string, rest = '') => `](${internalPath(p)}${rest})`);
  return post;
}

export async function writeDraft(c: DraftContext & { brief: Brief }): Promise<Post> {
  const system = prompt('writer', {
    FORMAT: c.format,
    PILLAR: c.item.pillar,
    KEYWORD: c.item.keyword,
    STYLE_RULES,
    BANNED: c.cfg.bannedPhrases.join(', '),
    VOICE: loadVoice(),
    OFFER: JSON.stringify(c.cfg.offer, null, 2),
    NOTES: loadNotes(),
  });
  const user = JSON.stringify({ brief: c.brief, ALLOWED_INTERNAL_LINKS: c.knownPaths }, null, 2);
  const raw = await ask({ model: c.cfg.models.draft, system, user, effort: 'high', maxTokens: 16000, budget: c.budget });
  return buildPost(raw, { cfg: c.cfg, item: c.item, format: c.format, brief: c.brief, slug: c.brief.slug });
}
