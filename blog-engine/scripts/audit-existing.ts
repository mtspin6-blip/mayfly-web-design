// Audit the posts already on the site against the accuracy-critical gates. Informational only; edits nothing.
import fs from 'node:fs';
import path from 'node:path';
import { runDeterministicGates, uncitedStats } from '../lib/gates.js';
import { loadPosts } from '../lib/post.js';
import { gateContext } from '../lib/pipeline.js';
import { REPORTS_DIR } from '../lib/paths.js';

const CRITICAL = new Set(['sources', 'offer-accuracy', 'banned-patterns', 'quotes']);
const ctx = gateContext();
const lines = ['# Existing posts vs the new accuracy gates', '', 'Informational. These posts predate the engine; this lists what would fail its accuracy-critical gates today.', ''];
for (const p of loadPosts().filter((x) => !x.fm.draft)) {
  const r = runDeterministicGates(p, { ...ctx, existing: ctx.existing.filter((e) => e.slug !== p.slug) }).filter((g) => CRITICAL.has(g.id));
  const unc = [...new Set(uncitedStats(p, ctx.cfg))];
  lines.push(`## ${p.slug}`, '', ...r.map((g) => `- ${g.ok ? 'PASS' : '**FAIL**'} \`${g.id}\`: ${g.detail}`), `- ${unc.length} statistic(s) with no cited source: ${unc.slice(0, 12).join(', ') || 'none'}`, '');
}
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORTS_DIR, 'existing-posts-audit.md'), lines.join('\n'));
console.log(lines.join('\n'));
