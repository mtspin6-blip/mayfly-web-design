// Optional: refine voice/voice-profile.md from real writing samples in voice/samples/. Uses your Claude account (Claude Code), no API key.
import fs from 'node:fs';
import { loadConfig } from '../lib/config.js';
import { Budget, ask } from '../lib/claude.js';
import { enginePath, readText } from '../lib/paths.js';

const dir = enginePath('voice/samples');
const samples = fs.readdirSync(dir).filter((f) => /\.(md|txt)$/.test(f) && f !== 'README.md').map((f) => `--- ${f}\n${fs.readFileSync(`${dir}/${f}`, 'utf8').slice(0, 6000)}`);
if (!samples.length) { console.log('No samples in blog-engine/voice/samples/. Add some .md or .txt files first.'); process.exit(0); }
const cfg = loadConfig();
ask({
  model: cfg.models.brief, budget: new Budget(cfg), effort: 'medium', maxTokens: 6000,
  system: 'You maintain a writing voice profile. Given the current profile and new real writing samples from the same person, return an improved profile in the same markdown structure (sections: Who\'s talking, Rhythm, Word choice, Avoids, Humor, Openers and closers, Few-shot excerpts). Keep what still holds, correct what the samples contradict, and use real excerpts from the samples as few-shots. Do not invent traits the samples do not show. Return the markdown only.',
  user: `CURRENT PROFILE:\n${readText(enginePath('voice/voice-profile.md'))}\n\nSAMPLES:\n${samples.join('\n\n')}`,
}).then((t) => { fs.writeFileSync(enginePath('voice/voice-profile.md'), t + '\n'); console.log('voice-profile.md updated. Review the diff before committing.'); });
