// Thin wrapper around the Anthropic SDK: spend caps, web search, delimited/JSON output parsing, and a mock for tests.
import Anthropic from '@anthropic-ai/sdk';
import { Config } from './config.js';
import { STATE_FILES } from './state.js';
import { readJson, writeJson } from './paths.js';

// $ per million tokens (first-party API list prices).
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

export class BudgetExceeded extends Error {}

interface Ledger { month: string; usd: number; tokens: number }
const monthKey = () => new Date().toISOString().slice(0, 7);

export class Budget {
  runTokens = 0;
  runUsd = 0;
  searches = 0;
  constructor(private cfg: Config) {}

  private ledger(): Ledger {
    const l = readJson<Ledger>(STATE_FILES.spend, { month: monthKey(), usd: 0, tokens: 0 });
    return l.month === monthKey() ? l : { month: monthKey(), usd: 0, tokens: 0 };
  }

  assertAvailable(): void {
    if (this.runTokens >= this.cfg.budget.maxTokensPerRun) throw new BudgetExceeded(`per-run token budget ${this.cfg.budget.maxTokensPerRun} reached`);
    if (this.ledger().usd >= this.cfg.budget.monthlySpendCapUsd) throw new BudgetExceeded(`monthly spend cap $${this.cfg.budget.monthlySpendCapUsd} reached`);
  }

  charge(model: string, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }, searches = 0): void {
    const price = PRICES[model] ?? PRICES['claude-opus-5-5'];
    const inTok = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) * 0.1;
    const outTok = usage.output_tokens ?? 0;
    const usd = (inTok * price.in + outTok * price.out) / 1e6 + searches * this.cfg.budget.webSearchCostUsd;
    this.runTokens += (usage.input_tokens ?? 0) + outTok;
    this.runUsd += usd;
    this.searches += searches;
    const l = this.ledger();
    writeJson(STATE_FILES.spend, { month: l.month, usd: +(l.usd + usd).toFixed(4), tokens: l.tokens + (usage.input_tokens ?? 0) + outTok });
  }

  searchesLeft(): number {
    return Math.max(0, this.cfg.budget.maxWebSearchesPerRun - this.searches);
  }
}

// ---- mock support (tests and dry-run rehearsal without an API key) ----
export interface MockRequest { model: string; system: string; user: string; webSearch: boolean }
type Mock = (req: MockRequest) => string | Promise<string>;
let mock: Mock | undefined;
export const setMockClaude = (fn: Mock | undefined) => { mock = fn; };

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

export interface AskOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  webSearch?: { maxUses: number };
  budget: Budget;
}

export async function ask(o: AskOptions): Promise<string> {
  o.budget.assertAvailable();
  if (mock) return mock({ model: o.model, system: o.system, user: o.user, webSearch: !!o.webSearch });

  const isHaiku = o.model.includes('haiku');
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.user }];
  const params: Record<string, unknown> = { model: o.model, max_tokens: o.maxTokens ?? 16000, system: o.system };
  if (o.effort && !isHaiku) params.output_config = { effort: o.effort };
  if (o.webSearch) {
    const allowed = Math.min(o.webSearch.maxUses, o.budget.searchesLeft());
    if (allowed > 0) {
      params.tools = [{ type: isHaiku ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: allowed }];
    }
  }

  let text = '';
  for (let turn = 0; turn < 6; turn++) {
    const res = await getClient().messages.create({ ...params, messages } as never) as Anthropic.Message;
    const searches = (res.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    o.budget.charge(o.model, res.usage as never, searches);
    if (res.stop_reason === 'refusal') throw new Error('model refused this request (safety classifier); topic skipped');
    text += res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    if (res.stop_reason === 'pause_turn') {
      // Server tool loop hit its iteration cap; hand the partial turn back to continue.
      messages.push({ role: 'assistant', content: res.content });
      o.budget.assertAvailable();
      continue;
    }
    if (res.stop_reason === 'max_tokens') throw new Error('response hit max_tokens; output truncated');
    return text.trim();
  }
  throw new Error('too many pause_turn continuations');
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
