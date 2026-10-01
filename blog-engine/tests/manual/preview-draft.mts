// Manual: render a saved draft as it would look on the live blog (writes a temp post, you build, then delete it).
import fs from 'node:fs';
import { parsePost, repairYaml, writePost } from '../../lib/post.js';
const raw = fs.readFileSync(process.argv[2], 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
const post = parsePost(process.argv[3], `---\n${repairYaml(m[1])}\n---\n${m[2]}`);
writePost(post);
