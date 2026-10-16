// The editor REPAIRS, it never rejects. It returns a corrected full post; then only the deterministic gates (lib/gates.ts)
// and the fact-checker's list of unsupported claims can hold a draft back, and every such failure goes to a targeted
// fix pass with the exact failure list (up to MAX_FIX_ROUNDS) before the topic is set aside.
import type { Config } from '../lib/config.js';
import { Budget, ask, extractJson } from '../lib/claude.js';
import { frontmatterYaml, type Post } from '../lib/post.js';
import { runDeterministicGates, summarize, type EditorScores, type GateContext } from '../lib/gates.js';
import { prompt, loadVoice } from '../lib/pipeline.js';
import { buildPost, type Brief } from './draft-post.js';
import { factCheck } from './fact-check.js';
import type { PageFetch } from '../lib/http.js';

export const MAX_FIX_ROUNDS = 3;

export interface EditorReview { scores: EditorScores; problems: string[]; honestyViolations: string[]; fabricationRemaining: boolean; corrected?: Post }

const render = (p: Post) => `===FRONTMATTER===\n${frontmatterYaml(p.fm)}\n===BODY===\n${p.body}`;

interface BuildCtx { cfg: Config; item: { keyword: string; pillar: string }; format: string; brief: Brief }

/** Split the editor's reply into its JSON review and (optionally) the corrected post. Pure, so it can be tested. */
export function parseEditorReply(raw: string, c: BuildCtx, post: Post): EditorReview {
  const at = raw.indexOf('===FRONTMATTER===');
  const head = at >= 0 ? raw.slice(0, at) : raw;
  const r = extractJson<Partial<EditorReview>>(head.replace('===REVIEW===', ''));
  const review: EditorReview = {
    scores: r.scores as EditorScores,
    problems: r.problems ?? [],
    honestyViolations: r.honestyViolations ?? [],
    fabricationRemaining: r.fabricationRemaining === true,
  };
  if (at >= 0) {
    try { review.corrected = buildPost(raw.slice(at), { ...c, slug: post.slug, prior: post }); }
    catch (e) { review.problems.push(`editor's corrected post was unparseable (${(e as Error).message}); kept the previous draft`); }
  }
  return review;
}

export async function edit(post: Post, c: BuildCtx, budget: Budget, voiceHint = loadVoice()): Promise<EditorReview> {
  const raw = await ask({
    model: c.cfg.models.editor,
    system: prompt('editor-rubric') + `\n\n# VOICE PROFILE\n${voiceHint}\n\n# OFFER\n${JSON.stringify(c.cfg.offer)}\n\n# BANNED\n${c.cfg.bannedPhrases.join(', ')}`,
    user: JSON.stringify({ targetQuery: post.fm.primaryKeyword, brief: c.brief, draft: render(post) }, null, 2),
    effort: 'medium',
    maxTokens: 16000,
    budget,
  });
  return parseEditorReply(raw, c, post);
}

/** One targeted fix: the writer gets the exact failure list and returns the full corrected post. */
export async function fixPass(post: Post, failures: string[], c: BuildCtx, budget: Budget): Promise<Post> {
  const raw = await ask({
    model: c.cfg.models.draft,
    system: prompt('revise') + `\n\n# BANNED\n${c.cfg.bannedPhrases.join(', ')}\n\n# VOICE PROFILE\n${loadVoice()}`,
    user: `# FAILURES TO FIX (fix every one)\n${failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n# BRIEF (facts and sources you may use)\n${JSON.stringify(c.brief.facts)}\n\n# CURRENT DRAFT\n${render(post)}`,
    effort: 'high',
    maxTokens: 16000,
    budget,
  });
  return buildPost(raw, { ...c, slug: post.slug, prior: post });
}

export class RejectedDraft extends Error {
  constructor(msg: string, public post: Post, public report: string) { super(msg); }
}

export interface RepairResult { post: Post; scores?: EditorScores; log: string[]; fixRounds: number }

export async function repairDraft(o: BuildCtx & { post: Post; budget: Budget; ctx: GateContext; fetcher?: (u: string) => Promise<PageFetch> }): Promise<RepairResult> {
  const log: string[] = [];
  let post = o.post;
  const review = await edit(post, o, o.budget);
  log.push(`editor (advisory) scores: ${JSON.stringify(review.scores)}`);
  log.push(`editor fixed: ${review.problems.join(' | ') || 'nothing to fix'}`);
  if (review.honestyViolations.length) log.push(`editor removed invented content: ${review.honestyViolations.join(' | ')}`);
  if (review.fabricationRemaining) throw new RejectedDraft('invented experience/clients could not be removed from the draft', post, log.join('\n'));
  if (review.corrected) post = review.corrected;

  for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
    const fc = await factCheck(post, o.cfg, o.budget, o.fetcher);
    post = fc.post;
    const gates = runDeterministicGates(post, o.ctx);
    const failures = [
      ...gates.filter((g) => !g.ok).map((g) => `gate ${g.id}: ${g.detail}`),
      ...fc.report.unsupported.map((s) => `unsupported claim (its cited source does not back it up): "${s}"`),
    ];
    log.push(`check ${round}: ${failures.length ? failures.join(' || ') : 'all gates pass, no unsupported claims'} (${fc.report.checked} claims, ${fc.report.deadLinks.length} dead links dropped)`);
    if (!failures.length) return { post, scores: review.scores, log, fixRounds: round };
    if (round === MAX_FIX_ROUNDS) throw new RejectedDraft(`still failing after ${MAX_FIX_ROUNDS} fix passes: ${failures.slice(0, 3).join('; ').slice(0, 300)}`, post, `${summarize(gates)}\n\n${log.join('\n')}`);
    try { post = await fixPass(post, failures, o, o.budget); }
    catch (e) { log.push(`fix pass ${round + 1} unusable: ${(e as Error).message}`); }
  }
  throw new RejectedDraft('unreachable', post, log.join('\n'));
}
