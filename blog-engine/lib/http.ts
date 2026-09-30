// Polite fetch helpers: timeouts, retry with backoff, a cache for flaky unofficial endpoints, page-to-text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { enginePath } from './paths.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(url: string, init: RequestInit = {}, tries = 3, timeoutMs = 20000): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'MayflyBlogEngine/1.0 (+https://mayflywebdesign.com)', ...(init.headers ?? {}) } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      await sleep(500 * 2 ** i + Math.random() * 250);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const cacheDir = enginePath('data/cache');
export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const file = path.join(cacheDir, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlMs) return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch { /* miss */ }
  const v = await produce();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v));
  return v;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PageFetch { url: string; ok: boolean; status: number; text: string }
export async function fetchPageText(url: string, maxChars = 60000): Promise<PageFetch> {
  try {
    const res = await fetchRetry(url, { redirect: 'follow' }, 2, 20000);
    if (!res.ok) return { url, ok: false, status: res.status, text: '' };
    const type = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    return { url, ok: true, status: res.status, text: (type.includes('html') ? htmlToText(raw) : raw).slice(0, maxChars) };
  } catch {
    return { url, ok: false, status: 0, text: '' };
  }
}
