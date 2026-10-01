import fs from 'node:fs';
import { parsePost, repairYaml } from '../../lib/post.js';
import { runDeterministicGates } from '../../lib/gates.js';
import { gateContext } from '../../lib/pipeline.js';
const raw = fs.readFileSync(process.argv[2], 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
const post = parsePost('x', `---\n${repairYaml(m[1])}\n---\n${m[2]}`);
for (const g of runDeterministicGates(post, gateContext())) console.log(g.ok ? 'PASS' : 'FAIL', g.id, '-', g.detail);
