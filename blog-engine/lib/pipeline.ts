// Shared context for the pipeline scripts.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, type Config } from './config.js';
import { loadPosts, type Post } from './post.js';
import { loadPublished, type PublishedEntry } from './state.js';
import { enginePath, readText } from './paths.js';
import type { GateContext } from './gates.js';

export function knownPaths(cfg: Config, posts: Post[]): string[] {
  return [...cfg.internalPages, ...posts.filter((p) => !p.fm.draft && !p.fm.noindex).map((p) => `/blog/${p.slug}/`)];
}

export function gateContext(cfg = loadConfig(), extraPosts: Post[] = []): GateContext {
  const existing = loadPosts().filter((p) => !p.fm.draft);
  const published: PublishedEntry[] = loadPublished();
  return { cfg, existing, published, knownPaths: knownPaths(cfg, [...existing, ...extraPosts]) };
}

export function loadVoice(): string {
  const profile = readText(enginePath('voice/voice-profile.md'));
  const dir = enginePath('voice/samples');
  const samples = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.(md|txt)$/.test(f) && f !== 'README.md').map((f) => `--- sample: ${f}\n${fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 2500)}`)
    : [];
  return [profile, ...samples.slice(0, 2)].join('\n\n');
}

export function loadNotes(): string {
  const t = readText(enginePath('notes/inbox.md')).trim();
  return t && !/^<!--[\s\S]*-->$/.test(t) ? t : '(none provided)';
}

export function prompt(name: string, vars: Record<string, string> = {}): string {
  let t = readText(enginePath('prompts', `${name}.md`));
  for (const [k, v] of Object.entries(vars)) t = t.split(`{{${k}}}`).join(v);
  return t;
}

export const STYLE_RULES = `- Mix short and long sentences. Fragments are fine. Never a run of same-length sentences.
- Use contractions. Take a position ("I'd skip this", "Most owners don't need it") and say why.
- Specific nouns, numbers and Montana details beat abstractions. Speak to one reader: "you".
- Start paragraphs differently. Plain questions and short asides are fine. No rule-of-three lists in every section.
- End when the point is made. No summary paragraph.`;

export const FORMATS = ['how-to', 'cost-breakdown', 'checklist', 'comparison', 'myth-vs-fact', 'decision-guide', 'glossary'] as const;
export type Format = (typeof FORMATS)[number];

export const arg = (name: string) => process.argv.includes(`--${name}`);
export const argVal = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
