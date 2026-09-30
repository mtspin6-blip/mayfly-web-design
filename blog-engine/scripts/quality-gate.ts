// All gates: deterministic text gates + editor scores + real build/schema validation + Lighthouse mobile performance.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../lib/config.js';
import { runDeterministicGates, gateEditor, summarize, allPassed, type EditorScores, type GateContext, type GateResult } from '../lib/gates.js';
import { writePost, type Post } from '../lib/post.js';
import { ROOT, BLOG_DIR } from '../lib/paths.js';
import { sleep } from '../lib/http.js';

function sh(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim() };
  }
}

function chromePath(): string | null {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find((p) => p && fs.existsSync(p)) ?? null;
}

async function lighthouseMobile(slug: string, min: number): Promise<GateResult> {
  const chrome = chromePath();
  if (!chrome) {
    // Fail closed in CI (Chrome is preinstalled on GitHub runners); allow a local skip with a loud note.
    return { id: 'performance', ok: !process.env.CI, detail: 'skipped: no Chrome found' + (process.env.CI ? ' (CI: failing closed)' : ' (local run)') };
  }
  const port = '4399';
  const server = spawn('npx', ['astro', 'preview', '--port', port], { cwd: ROOT, stdio: 'ignore' });
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await sleep(750);
      try { up = (await fetch(`http://localhost:${port}/blog/${slug}/`)).ok; } catch { /* not yet */ }
    }
    if (!up) return { id: 'performance', ok: false, detail: 'preview server did not start' };
    // Median of three runs: a single Lighthouse run on a busy machine swings by ~10 points.
    const scores: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = sh('npx', ['--yes', 'lighthouse@12', `http://localhost:${port}/blog/${slug}/`, '--only-categories=performance', '--form-factor=mobile', '--output=json', '--output-path=stdout', '--quiet', `--chrome-flags=--headless=new --no-sandbox`]);
      if (!r.ok) return { id: 'performance', ok: false, detail: `lighthouse failed: ${r.out.slice(0, 200)}` };
      scores.push(Math.round(((JSON.parse(r.out) as { categories: { performance: { score: number } } }).categories.performance.score ?? 0) * 100));
    }
    scores.sort((a, b) => a - b);
    const median = scores[1];
    return { id: 'performance', ok: median >= min, detail: `mobile performance median ${median} of [${scores.join(', ')}] (>=${min})` };
  } catch (e) {
    return { id: 'performance', ok: false, detail: `lighthouse error: ${(e as Error).message}` };
  } finally {
    server.kill('SIGTERM');
  }
}

/** Write the post, build the real site, validate schema, measure performance. Removes the file again on failure. */
export async function siteChecks(post: Post, cfg: Config, opts: { keepOnSuccess: boolean }): Promise<GateResult[]> {
  const file = path.join(BLOG_DIR, `${post.slug}.md`);
  const existed = fs.existsSync(file);
  writePost(post);
  const results: GateResult[] = [];
  const build = sh('npm', ['run', 'build']);
  results.push({ id: 'build', ok: build.ok, detail: build.ok ? 'npm run build succeeded' : build.out.slice(-300) });
  if (build.ok) {
    const v = sh('npm', ['run', 'validate']);
    results.push({ id: 'jsonld-validate', ok: v.ok, detail: v.ok ? 'JSON-LD, titles, canonicals valid' : v.out.slice(-400) });
    results.push(await lighthouseMobile(post.slug, cfg.gates.psiMobileMin));
  }
  const ok = results.every((r) => r.ok);
  if (!(ok && opts.keepOnSuccess) && !existed) fs.rmSync(file, { force: true });
  return results;
}

export interface GateReport { ok: boolean; results: GateResult[]; text: string }

export async function runAllGates(post: Post, ctx: GateContext, scores: EditorScores | undefined, o: { site: boolean; keepOnSuccess: boolean }): Promise<GateReport> {
  const results = [...runDeterministicGates(post, ctx), gateEditor(scores, ctx.cfg)];
  if (allPassed(results) && o.site) results.push(...(await siteChecks(post, ctx.cfg, { keepOnSuccess: o.keepOnSuccess })));
  return { ok: allPassed(results), results, text: summarize(results) };
}
