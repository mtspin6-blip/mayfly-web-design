// Skeptical editor: scores the draft, returns rewrite instructions, and the writer revises (max 2 rewrites).
import YAML from 'yaml';
import type { Config } from '../lib/config.js';
import { Budget, ask, askJson, splitDelimited } from '../lib/claude.js';
import type { Post } from '../lib/post.js';
import { runDeterministicGates, gateEditor, allPassed, summarize, type EditorScores, type GateContext, type GateResult } from '../lib/gates.js';
import { prompt, loadVoice } from '../lib/pipeline.js';
import { buildPost, type Brief } from './draft-post.js';

interface EditorReply { scores: EditorScores; autoFail?: boolean; problems: string[]; rewriteInstructions: string[] }

const render = (p: Post) => `===FRONTMATTER===\n${YAML.stringify(p.fm, { lineWidth: 0 }).trim()}\n===BODY===\n${p.body}`;

export async function edit(post: Post, brief: Brief, cfg: Config, budget: Budget, voiceHint = loadVoice()): Promise<EditorReply> {
  const r = await askJson<EditorReply>({
    model: cfg.models.editor,
    system: prompt('editor-rubric') + `\n\n# VOICE PROFILE\n${voiceHint}\n\n# OFFER\n${JSON.stringify(cfg.offer)}`,
    user: JSON.stringify({ targetQuery: post.fm.primaryKeyword, brief, draft: render(post) }, null, 2),
    effort: 'medium',
    maxTokens: 6000,
    budget,
  });
  r.scores.autoFail = r.scores.autoFail || r.autoFail;
  return r;
}

export interface LoopResult { post: Post; scores?: EditorScores; rounds: number; gates: GateResult[]; ok: boolean; log: string[] }

export async function editorLoop(o: { post: Post; brief: Brief; item: { keyword: string; pillar: string }; format: string; cfg: Config; budget: Budget; ctx: GateContext }): Promise<LoopResult> {
  let post = o.post;
  const log: string[] = [];
  let scores: EditorScores | undefined;
  let gates: GateResult[] = [];
  for (let round = 0; round <= o.cfg.gates.maxRewrites; round++) {
    gates = runDeterministicGates(post, o.ctx);
    const review = await edit(post, o.brief, o.cfg, o.budget);
    scores = review.scores;
    const eg = gateEditor(scores, o.cfg);
    log.push(`round ${round}: editor ${eg.detail}; deterministic failures: ${gates.filter((g) => !g.ok).map((g) => g.id).join(', ') || 'none'}`);
    if (scores.autoFail || scores.honesty < 5) return { post, scores, rounds: round, gates: [...gates, eg], ok: false, log: [...log, 'honesty auto-fail'] };
    if (allPassed(gates) && eg.ok) return { post, scores, rounds: round, gates: [...gates, eg], ok: true, log };
    if (round === o.cfg.gates.maxRewrites) return { post, scores, rounds: round, gates: [...gates, eg], ok: false, log };

    const failures = gates.filter((g) => !g.ok);
    const raw = await ask({
      model: o.cfg.models.draft,
      system: prompt('revise') + `\n\n# BANNED\n${o.cfg.bannedPhrases.join(', ')}\n\n# VOICE PROFILE\n${loadVoice()}`,
      user: `# EDITOR REWRITE INSTRUCTIONS\n${review.rewriteInstructions.map((r, i) => `${i + 1}. ${r}`).join('\n') || '(none)'}\n\n# EDITOR PROBLEMS\n${review.problems.join('\n') || '(none)'}\n\n# GATE FAILURES TO FIX\n${failures.length ? summarize(failures) : '(none)'}\n\n# BRIEF (facts and sources you may use)\n${JSON.stringify(o.brief.facts)}\n\n# CURRENT DRAFT\n${render(post)}`,
      effort: 'high',
      maxTokens: 16000,
      budget: o.budget,
    });
    try {
      post = buildPost(raw, { cfg: o.cfg, item: o.item, format: o.format, brief: o.brief, slug: post.slug, prior: post });
    } catch (e) {
      log.push(`revision unparseable: ${(e as Error).message}`);
      return { post, scores, rounds: round, gates: [...gates, eg], ok: false, log };
    }
  }
  return { post, scores, rounds: o.cfg.gates.maxRewrites, gates, ok: false, log };
}
