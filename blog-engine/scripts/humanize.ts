// Rhythm/voice rewrite pass. Runs after the draft and before the editor. Facts, links and numbers must survive unchanged.
import YAML from 'yaml';
import { repairYaml } from '../lib/post.js';
import type { Config } from '../lib/config.js';
import { Budget, ask, splitDelimited } from '../lib/claude.js';
import type { Post } from '../lib/post.js';
import { prompt, loadVoice } from '../lib/pipeline.js';
import { links } from '../lib/gates.js';
import { wordCount } from '../lib/text.js';

const nums = (s: string) => (s.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((n) => n.replace(/,/g, '')).sort().join('|');
const hrefs = (s: string) => links(s).map((l) => l.href).sort().join('|');

export async function humanize(post: Post, cfg: Config, budget: Budget): Promise<{ post: Post; kept: boolean; note: string }> {
  const system = prompt('humanize', { BANNED: cfg.bannedPhrases.join(', '), VOICE: loadVoice() });
  const user = `===FRONTMATTER===\n${YAML.stringify(post.fm, { lineWidth: 0 }).trim()}\n===BODY===\n${post.body}`;
  let out;
  try {
    out = splitDelimited(await ask({ model: cfg.models.humanize, system, user, effort: 'medium', maxTokens: 16000, budget }));
  } catch (e) {
    return { post, kept: false, note: `humanize failed (${(e as Error).message}); kept original` };
  }
  // Invariants: the rewrite may not change any link, number, or bring the length off a cliff.
  if (hrefs(out.body) !== hrefs(post.body)) return { post, kept: false, note: 'humanize changed links; reverted' };
  if (nums(out.body) !== nums(post.body)) return { post, kept: false, note: 'humanize changed numbers; reverted' };
  const ratio = wordCount(out.body) / Math.max(1, wordCount(post.body));
  if (ratio < 0.7 || ratio > 1.15) return { post, kept: false, note: `humanize changed length x${ratio.toFixed(2)}; reverted` };
  const fm = YAML.parse(repairYaml(out.frontmatter)) as Partial<Post['fm']>;
  const next: Post = { ...post, body: out.body };
  const d = String(fm.description ?? '');
  if (d.length >= 140 && d.length <= 155) next.fm = { ...next.fm, description: d };
  return { post: next, kept: true, note: 'humanized' };
}
