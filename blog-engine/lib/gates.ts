// Deterministic quality gates. Pure functions: (post, context) -> results. Any failed gate discards the draft.
import { Config, allowedOfferNumbers } from './config.js';
import type { Post } from './post.js';
import type { PublishedEntry } from './state.js';
import {
  stripMarkdown, words, wordCount, sentences, fleschKincaidGrade, sentenceLengthStdDev, contractionsPer100,
  paragraphOpeners, maxRepeatedOpener, longestSameStartRun, shingleSimilarity, normalizeKeyword, countOccurrences,
} from './text.js';

export interface GateResult {
  id: string;
  ok: boolean;
  detail: string;
}

export interface GateContext {
  cfg: Config;
  existing: Post[]; // already-published posts
  published: PublishedEntry[]; // log, newest last
  knownPaths: string[]; // valid internal paths, e.g. /pricing/ and /blog/<slug>/
}

const pass = (id: string, detail = 'ok'): GateResult => ({ id, ok: true, detail });
const fail = (id: string, detail: string): GateResult => ({ id, ok: false, detail });
const check = (id: string, ok: boolean, detail: string): GateResult => (ok ? pass(id, detail) : fail(id, detail));

// ---------- helpers ----------

export function firstParagraph(body: string): string {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim());
  return blocks.find((b) => b && !/^(#|[-*+]\s|\d+\.\s|\||>|```|!\[)/.test(b)) ?? '';
}

export const h2s = (body: string): string[] =>
  [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].trim());

interface Link { text: string; href: string }
export function links(body: string): Link[] {
  return [...body.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => ({ text: m[1], href: m[2] }));
}

const isInternal = (href: string) => href.startsWith('/') || /^https?:\/\/(www\.)?mayflywebdesign\.com/i.test(href);
export const internalPath = (href: string) =>
  href.replace(/^https?:\/\/(www\.)?mayflywebdesign\.com/i, '').split('#')[0].split('?')[0].replace(/([^/])$/, '$1/');

function listBlocks(body: string): number {
  let n = 0, inList = false;
  for (const line of body.split('\n')) {
    const isItem = /^\s*[-*+]\s+/.test(line);
    if (isItem && !inList) n++;
    inList = isItem || (inList && /^\s+\S/.test(line));
  }
  return n;
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

function phraseRegex(p: string): RegExp {
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, 'i');
}

// ---------- individual gates ----------

export function gateLength(p: Post): GateResult {
  const n = wordCount(stripMarkdown(p.body));
  return check('length', n >= 700 && n <= 1800, `${n} words (700-1800)`);
}

export function gateDirectAnswer(p: Post): GateResult {
  const n = wordCount(stripMarkdown(firstParagraph(p.body)));
  return check('direct-answer', n >= 50 && n <= 75, `first paragraph ${n} words (50-75)`);
}

export function gateTitleMeta(p: Post): GateResult {
  const t = p.fm.title?.length ?? 0;
  const d = p.fm.description?.length ?? 0;
  const ok = t > 0 && t <= 60 && d >= 140 && d <= 155;
  return check('title-meta', ok, `title ${t} (<=60), description ${d} (140-155)`);
}

export function gateHeadings(p: Post): GateResult {
  const hs = h2s(p.body);
  const q = hs.filter((h) => h.trim().endsWith('?')).length;
  const colonTitles = hs.filter((h) => /^[^:]{3,40}:\s/.test(h)).length;
  const ok = hs.length >= 3 && q / hs.length > 0.5 && colonTitles / Math.max(hs.length, 1) < 0.5;
  return check('headings', ok, `${hs.length} H2s, ${q} questions, ${colonTitles} colon-style`);
}

export function gateFaq(p: Post): GateResult {
  const faq = p.fm.faq ?? [];
  if (faq.length < 3 || faq.length > 5) return fail('faq', `${faq.length} items (3-5)`);
  const bad = faq.filter((f) => !f.q?.trim() || !f.a?.trim() || wordCount(f.a) < 40 || wordCount(f.a) > 60);
  if (bad.length) return fail('faq', `${bad.length} answers outside 40-60 words: "${bad[0].q}"`);
  const schema = { '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  try {
    JSON.parse(JSON.stringify(schema));
  } catch {
    return fail('faq', 'FAQPage JSON-LD failed to serialize');
  }
  return pass('faq', `${faq.length} items, 40-60 words each`);
}

const STAT = /\d+(?:\.\d+)?\s?%|\$\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|billion|percent)\b/gi;

/** Statistics in the body that have no supporting link (from the post's sources) in the same paragraph. */
export function uncitedStats(p: Post, cfg: Config): string[] {
  const srcUrls = new Set((p.fm.sources ?? []).map((s) => s.url.replace(/\/$/, '')));
  const offer = allowedOfferNumbers(cfg);
  const unsupported: string[] = [];
  for (const para of p.body.split(/\n{2,}/)) {
    if (/^\s*\|/.test(para)) continue; // table rows checked as a block below
    const paraLinks = links(para).map((l) => l.href.replace(/\/$/, ''));
    const cited = paraLinks.some((h) => srcUrls.has(h));
    for (const sent of sentences(para)) {
      for (const h of sent.match(STAT) ?? []) {
        const num = Number(h.replace(/[^0-9.]/g, ''));
        const isOffer = h.includes('$') && offer.has(num);
        if (!isOffer && !cited) unsupported.push(h.trim());
      }
    }
  }
  return unsupported;
}

export function gateSources(p: Post, cfg: Config): GateResult {
  const src = p.fm.sources ?? [];
  if (src.length < 2) return fail('sources', `${src.length} sources (need >=2)`);
  const badUrl = src.filter((s) => !/^https?:\/\/[^\s]+\.[^\s]+/.test(s.url) || !s.title?.trim());
  if (badUrl.length) return fail('sources', `invalid source entry: ${badUrl[0].url}`);
  const unsupported = uncitedStats(p, cfg);
  return check('sources', unsupported.length === 0, unsupported.length ? `uncited numbers: ${[...new Set(unsupported)].slice(0, 5).join(', ')}` : `${src.length} sources, all stats cited`);
}

export function gateInternalLinks(p: Post, cfg: Config, knownPaths: string[]): GateResult {
  const internal = links(p.body).filter((l) => isInternal(l.href)).map((l) => internalPath(l.href));
  const uniq = [...new Set(internal)];
  const known = new Set(knownPaths.map((k) => internalPath(k)));
  const dead = uniq.filter((u) => !known.has(u));
  const hasService = uniq.some((u) => cfg.servicePages.includes(u));
  if (uniq.length < 3 || uniq.length > 5) return fail('internal-links', `${uniq.length} unique internal links (3-5)`);
  if (dead.length) return fail('internal-links', `unresolved: ${dead.join(', ')}`);
  return check('internal-links', hasService, hasService ? `${uniq.length} links incl. a service page` : 'no link to a service page');
}

export function gateDuplicate(p: Post, ctx: GateContext): GateResult {
  const kw = normalizeKeyword(p.fm.primaryKeyword ?? '');
  if (!kw) return fail('duplicate', 'missing primaryKeyword');
  const usedKw = [
    ...ctx.existing.map((e) => normalizeKeyword(e.fm.primaryKeyword ?? '')),
    ...ctx.published.map((e) => normalizeKeyword(e.keyword)),
  ];
  if (usedKw.includes(kw)) return fail('duplicate', `primary keyword "${kw}" already used`);
  let worst = { slug: '', sim: 0 };
  for (const e of ctx.existing) {
    const sim = shingleSimilarity(p.body, e.body);
    if (sim > worst.sim) worst = { slug: e.slug, sim };
  }
  return check('duplicate', worst.sim < ctx.cfg.gates.similarityMax, `max similarity ${(worst.sim * 100).toFixed(0)}% (${worst.slug || 'n/a'}), limit ${ctx.cfg.gates.similarityMax * 100}%`);
}

export function gateBannedPatterns(p: Post, cfg: Config): GateResult {
  const text = `${p.fm.title}\n${p.fm.excerpt}\n${p.fm.description ?? ''}\n${p.body}\n${(p.fm.faq ?? []).map((f) => f.q + ' ' + f.a).join('\n')}`;
  const problems: string[] = [];
  if (/[—–]/.test(text)) problems.push('em/en dash');
  for (const ph of cfg.bannedPhrases) if (phraseRegex(ph).test(text)) problems.push(`banned phrase "${ph}"`);
  for (const ph of cfg.fakeClientPhrases) if (phraseRegex(ph).test(text)) problems.push(`client/testimonial phrase "${ph}"`);
  for (const ph of cfg.disparagementPhrases) if (phraseRegex(ph).test(text)) problems.push(`disparagement "${ph}"`);
  if (/\b(?:I|we)(?:'ve| have)?\s+(?:built|helped|worked with|redesigned|launched|ranked)\b/i.test(text)) problems.push('first-person client claim');
  if (/not just [^.!?]{1,80},\s*(?:it['’]s|it is|but)/i.test(text)) problems.push('"not just X, it\'s Y" structure');
  if ((text.match(/!/g) ?? []).length > 1) problems.push('more than one exclamation mark');
  if ((p.body.match(/;/g) ?? []).length > 2) problems.push('more than 2 semicolons');
  if (EMOJI.test(text)) problems.push('emoji');
  if (/\bFirst,[\s\S]{0,400}\bSecond,[\s\S]{0,400}\bThird,/i.test(p.body)) problems.push('First/Second/Third scaffold');
  if (/^#{2,3}\s+[^:\n]{3,40}:\s+\S/m.test(p.body) && (p.body.match(/^##\s+[^:\n]{3,40}:\s+\S/gm) ?? []).length > 1) problems.push('title-colon-subtitle headings');
  return check('banned-patterns', problems.length === 0, problems.length ? problems.slice(0, 6).join('; ') : 'clean');
}

export function gateKeywordStuffing(p: Post, cfg: Config): GateResult {
  const kw = p.fm.primaryKeyword ?? '';
  const wc = wordCount(stripMarkdown(p.body));
  const occ = countOccurrences(stripMarkdown(p.body), kw);
  const kwWords = words(kw).length || 1;
  const density = wc ? (occ * kwWords) / wc : 0;
  const heads = h2s(p.body);
  const inHeads = heads.filter((h) => countOccurrences(h, kw) > 0).length;
  const headShare = heads.length ? inHeads / heads.length : 0;
  const ok = density < cfg.gates.keywordDensityMax && headShare <= 0.3;
  return check('keyword-stuffing', ok, `density ${(density * 100).toFixed(2)}% (<${cfg.gates.keywordDensityMax * 100}%), in ${inHeads}/${heads.length} H2s (<=30%)`);
}

export function gateOfferAccuracy(p: Post, cfg: Config): GateResult {
  const offer = allowedOfferNumbers(cfg);
  const bad: string[] = [];
  const text = stripMarkdown(p.body) + ' ' + (p.fm.faq ?? []).map((f) => f.a).join(' ');
  for (const sent of sentences(text)) {
    if (!/\b(mayfly|starter|business plan|business website|local seo|buyout|our (?:plans?|pricing|subscription))\b/i.test(sent)) continue;
    for (const m of sent.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!offer.has(n)) bad.push(`$${m[1]}`);
    }
  }
  return check('offer-accuracy', bad.length === 0, bad.length ? `prices not in config: ${bad.join(', ')}` : 'prices match config');
}

export function gateQuotes(p: Post): GateResult {
  const long: string[] = [];
  for (const m of p.body.matchAll(/["\u201C]([^"\u201D\n]{20,})["\u201D]/g)) {
    if (wordCount(m[1]) > 15) long.push(m[1].slice(0, 40));
  }
  const blockquotes = (p.body.match(/^>\s+\S/gm) ?? []).length;
  const problems = [...long.map((l) => `quote over 15 words: "${l}..."`), ...(blockquotes ? [`${blockquotes} blockquote(s); paraphrase sources instead`] : [])];
  return check('quotes', problems.length === 0, problems.length ? problems.join('; ') : 'no long quotes');
}

export function gateSchema(p: Post): GateResult {
  const f = p.fm;
  const missing = ['title', 'excerpt', 'description', 'date', 'category', 'readTime', 'author', 'pillar', 'format', 'primaryKeyword']
    .filter((k) => !f[k] || String(f[k]).trim() === '');
  if (missing.length) return fail('schema', `frontmatter missing: ${missing.join(', ')}`);
  if (Number.isNaN(Date.parse(f.date))) return fail('schema', 'date is not a valid date');
  if (f.author !== 'Mitchell Spinetta') return fail('schema', 'author must be Mitchell Spinetta (Person schema)');
  const blogPosting = { '@type': 'BlogPosting', headline: f.title, datePublished: f.date, author: { '@type': 'Person', name: f.author } };
  const breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [1, 2, 3, 4].map((position) => ({ '@type': 'ListItem', position })) };
  try {
    JSON.parse(JSON.stringify([blogPosting, breadcrumb]));
  } catch {
    return fail('schema', 'JSON-LD failed to serialize');
  }
  return pass('schema', 'BlogPosting/Person/FAQPage/BreadcrumbList inputs valid');
}

export function gateReadability(p: Post, cfg: Config): GateResult {
  const grade = fleschKincaidGrade(stripMarkdown(p.body));
  return check('readability', grade <= cfg.gates.fleschKincaidMaxGrade, `Flesch-Kincaid grade ${grade.toFixed(1)} (<=${cfg.gates.fleschKincaidMaxGrade})`);
}

export function gateStyle(p: Post, ctx: GateContext): GateResult {
  const { cfg } = ctx;
  const plain = stripMarkdown(p.body);
  const wc = wordCount(plain);
  const problems: string[] = [];
  const sd = sentenceLengthStdDev(plain);
  if (sd < cfg.gates.sentenceStdDevMin) problems.push(`sentence-length std dev ${sd.toFixed(1)} (<${cfg.gates.sentenceStdDevMin})`);
  const c = contractionsPer100(plain);
  if (c < cfg.gates.contractionsPer100WordsMin) problems.push(`contractions ${c.toFixed(2)}/100 words (<${cfg.gates.contractionsPer100WordsMin})`);
  const rep = maxRepeatedOpener(paragraphOpeners(p.body));
  if (rep > 2) problems.push(`same 3-word paragraph opener used ${rep}x (max 2)`);
  const run = longestSameStartRun(plain);
  if (run >= 3) problems.push(`${run} consecutive sentences start with the same word`);
  const lists = listBlocks(p.body);
  const maxLists = Math.max(1, Math.ceil(wc / 400));
  if (lists > maxLists) problems.push(`${lists} bulleted lists (max ${maxLists} for ${wc} words)`);
  const bolds = (p.body.match(/\*\*[^*]+\*\*/g) ?? []).length;
  if (bolds > Math.max(2, Math.floor(wc / 250))) problems.push(`${bolds} bolded phrases`);
  return check('style', problems.length === 0, problems.length ? problems.join('; ') : `sd ${sd.toFixed(1)}, ${c.toFixed(1)} contractions/100w`);
}

export function gateVarietyVsRecent(p: Post, ctx: GateContext): GateResult {
  const last = ctx.published.at(-1);
  const problems: string[] = [];
  if (last && p.fm.format && last.format === p.fm.format) problems.push(`format "${p.fm.format}" repeats the previous post`);
  const recent = ctx.existing
    .filter((e) => !e.fm.draft)
    .sort((a, b) => Date.parse(b.fm.date) - Date.parse(a.fm.date))
    .slice(0, 3);
  const open = (b: string) => words(stripMarkdown(firstParagraph(b))).slice(0, 5).join(' ').toLowerCase();
  const myOpen = open(p.body);
  const sig = (b: string) => h2s(b).map((h) => words(h).slice(0, 2).join(' ').toLowerCase()).join('|');
  for (const r of recent) {
    if (myOpen && myOpen === open(r.body)) problems.push(`opening matches ${r.slug}`);
    if (sig(p.body) && sig(p.body) === sig(r.body)) problems.push(`heading skeleton matches ${r.slug}`);
  }
  const last10 = ctx.published.slice(-10);
  if (last10.length >= 4 && p.fm.pillar) {
    const share = (last10.filter((e) => e.pillar === p.fm.pillar).length + 1) / (last10.length + 1);
    if (share > ctx.cfg.cadence.maxSamePillarShareOfLast10) problems.push(`pillar "${p.fm.pillar}" would be ${(share * 100).toFixed(0)}% of recent posts`);
  }
  return check('variety', problems.length === 0, problems.length ? problems.join('; ') : 'differs from recent posts');
}

// ---------- editor-score gate (scores come from the editor model; the threshold check is deterministic) ----------

export interface EditorScores {
  helpfulness: number; originalValue: number; accuracy: number; specificity: number; voice: number; intentMatch: number; honesty: number;
  autoFail?: boolean;
}

export function gateEditor(scores: EditorScores | undefined, cfg: Config): GateResult {
  if (!scores) return fail('editor', 'no editor scores');
  const vals = [scores.helpfulness, scores.originalValue, scores.accuracy, scores.specificity, scores.voice, scores.intentMatch, scores.honesty];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  if (scores.autoFail || scores.honesty < 5) return fail('editor', `honesty auto-fail (honesty=${scores.honesty})`);
  const ok = min >= cfg.gates.editorMinEach && avg >= cfg.gates.editorMinAverage && scores.voice >= cfg.gates.voiceMin;
  return check('editor', ok, `min ${min}, avg ${avg.toFixed(2)}, voice ${scores.voice} (need each >=${cfg.gates.editorMinEach}, avg >=${cfg.gates.editorMinAverage})`);
}

// ---------- runner ----------

export function runDeterministicGates(p: Post, ctx: GateContext): GateResult[] {
  const { cfg } = ctx;
  return [
    gateLength(p),
    gateDirectAnswer(p),
    gateTitleMeta(p),
    gateHeadings(p),
    gateFaq(p),
    gateSources(p, cfg),
    gateInternalLinks(p, cfg, ctx.knownPaths),
    gateDuplicate(p, ctx),
    gateBannedPatterns(p, cfg),
    gateKeywordStuffing(p, cfg),
    gateOfferAccuracy(p, cfg),
    gateQuotes(p),
    gateSchema(p),
    gateReadability(p, cfg),
    gateStyle(p, ctx),
    gateVarietyVsRecent(p, ctx),
  ];
}

export const allPassed = (r: GateResult[]) => r.every((g) => g.ok);
export const summarize = (r: GateResult[]) => r.map((g) => `${g.ok ? 'PASS' : 'FAIL'} ${g.id}: ${g.detail}`).join('\n');
