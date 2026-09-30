// Manual: exercises the real build + JSON-LD validate + Lighthouse gates against the good fixture.
import { siteChecks } from '../../scripts/quality-gate.js';
import { goodPost } from '../helpers.js';
import { loadConfig } from '../../lib/config.js';

const r = await siteChecks(goodPost(), loadConfig(), { keepOnSuccess: false });
console.log(JSON.stringify(r, null, 1));
process.exit(r.every((g) => g.ok) ? 0 : 1);
