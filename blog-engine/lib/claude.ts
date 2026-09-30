// Model access via Claude Code headless mode (`claude -p`), signed in with YOUR Claude account.
// Usage counts against your plan's limits. There is no API key and no per-token billing: the API key
// variables are stripped from the child process so a stray key can never turn this into API spend.
import { spawn, spawnSync } from 'node:child_process';
import { Config } from './config.js';
import { enginePath, readJson, writeJson } from './paths.js';

export class BudgetExceeded extends Error {}
/** Plan usage limit hit. Not the post's fault: the run stops without rejecting the topic. */
export class UsageLimit extends BudgetExceeded {}

interface Ledger { month: string; calls: number; tokens: number }
const LEDGER = enginePath('data/usage-ledger.json');
const monthKey = () => new Date().toISOString().slice(0, 7);

/** Counts model calls and tokens per run and per month so a runaway loop can't burn the whole plan. */
export class Budget {
  runTokens = 0;
  runCalls = 0;
  searches = 0;
  constructor(private cfg: Config) {}

  private ledger(): Ledger {
    const l = readJson<Ledger>(LEDGER, { month: monthKey(), calls: 0, tokens: 0 });
    return l.month === monthKey() ? l : { month: monthKey(), calls: 0, tokens: 0 };
  }

  assertAvailable(): void {
    const b = this.cfg.budget;
    if (this.runTokens >= b.maxTokensPerRun) throw new BudgetExceeded(`per-run token budget ${b.maxTokensPerRun} reached`);
    if (this.runCalls >= b.maxModelCallsPerRun) throw new BudgetExceeded(`per-run call cap ${b.maxModelCallsPerRun} reached`);
    if (this.ledger().calls >= b.monthlyModelCallCap) throw new BudgetExceeded(`monthly call cap ${b.monthlyModelCallCap} reached`);
  }

  record(tokens: number, searches = 0): void {
    this.runCalls += 1;
    this.runTokens += tokens;
    this.searches += searches;
    const l = this.ledger();
    writeJson(LEDGER, { month: l.month, calls: l.calls + 1, tokens: l.tokens + tokens });
  }
}

// ---- mock support (tests and rehearsal without any model access) ----
export interface MockRequest { model: string; system: string; user: string; webSearch: boolean }
type Mock = (req: MockRequest) => string | Promise<string>;
let mock: Mock | undefined;
export const setMockClaude = (fn: Mock | undefined) => { mock = fn; };

export interface AskOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number; // kept for call-site compatibility; Claude Code manages output length itself
  effort?: 'low' | 'medium' | 'high';
  webSearch?: { maxUses: number };
  budget: Budget;
}

/** Build the `claude` invocation. Pure, so it can be tested without running anything. */
export function buildCliInvocation(o: Pick<AskOptions, 'model' | 'system' | 'webSearch'>, env: NodeJS.ProcessEnv = process.env) {
  const tools = o.webSearch ? 'WebSearch,WebFetch' : '';
  const args = [
    '-p',
    '--model', o.model,
    '--system-prompt', o.system,
    '--tools', tools,
    '--output-format', 'json',
    '--no-session-persistence',
    '--max-turns', String(o.webSearch ? o.webSearch.maxUses + 4 : 1),
  ];
  if (o.webSearch) args.push('--allowedTools', 'WebSearch', 'WebFetch');
  const childEnv: NodeJS.ProcessEnv = { ...env };
  // Never allow API billing: drop every API credential before the child starts.
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete childEnv[k];
  return { args, env: childEnv };
}

interface CliResult { is_error?: boolean; result?: string; usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } }

const LIMIT_RE = /(usage limit|rate limit|limit reached|too many requests|overloaded|quota)/i;
const AUTH_RE = /(authenticate|oauth|not logged in|login|unauthorized|invalid token)/i;

function runClaude(o: AskOptions): Promise<CliResult> {
  const { args, env } = buildCliInvocation(o);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude timed out after 12 minutes')); }, 12 * 60 * 1000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`could not start claude CLI: ${e.message}. Install with: npm i -g @anthropic-ai/claude-code`)); });
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out) as CliResult); }
      catch { reject(new Error(`claude returned no JSON: ${(out || err).slice(0, 300)}`)); }
    });
    child.stdin.end(o.user);
  });
}

export async function ask(o: AskOptions): Promise<string> {
  o.budget.assertAvailable();
  if (mock) return mock({ model: o.model, system: o.system, user: o.user, webSearch: !!o.webSearch });

  const res = await runClaude(o);
  const text = (res.result ?? '').trim();
  if (res.is_error) {
    if (LIMIT_RE.test(text)) throw new UsageLimit(`Claude plan usage limit: ${text.slice(0, 160)}`);
    if (AUTH_RE.test(text)) throw new UsageLimit(`Claude sign-in problem (check CLAUDE_CODE_OAUTH_TOKEN): ${text.slice(0, 160)}`);
    throw new Error(`claude error: ${text.slice(0, 300)}`);
  }
  o.budget.record((res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0), res.usage?.server_tool_use?.web_search_requests ?? 0);
  if (!text) throw new Error('claude returned an empty result');
  return text;
}

/** True when this environment can reach Claude: a long-lived token (CI) or a logged-in local CLI. */
export function claudeAvailable(): boolean {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return true;
  if (process.env.CI) return false;
  return spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
}

/** Extract the first balanced JSON object from model text (tolerates prose or code fences around it). */
export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('no JSON object in model output');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(cleaned.slice(start, i + 1)) as T;
  }
  throw new Error('unbalanced JSON in model output');
}

export async function askJson<T>(o: AskOptions): Promise<T> {
  const first = await ask(o);
  try {
    return extractJson<T>(first);
  } catch {
    const retry = await ask({ ...o, user: `${o.user}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.` });
    return extractJson<T>(retry);
  }
}

/** Parse the writer's delimited output into frontmatter YAML + body. */
export function splitDelimited(text: string): { frontmatter: string; body: string } {
  const m = text.match(/===FRONTMATTER===\s*([\s\S]*?)\s*===BODY===\s*([\s\S]*)$/);
  if (!m) throw new Error('writer output missing ===FRONTMATTER=== / ===BODY=== delimiters');
  return { frontmatter: m[1].replace(/^```ya?ml\n?|```$/g, '').trim(), body: m[2].replace(/```$/g, '').trim() + '\n' };
}
