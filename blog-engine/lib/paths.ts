import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_DIR = path.resolve(here, '..');
export const ROOT = path.resolve(ENGINE_DIR, '..');
export const BLOG_DIR = path.join(ROOT, 'src/content/blog');
export const REPORTS_DIR = path.join(ROOT, 'reports');

export const enginePath = (...parts: string[]) => path.join(ENGINE_DIR, ...parts);

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function readText(file: string, fallback = ''): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}
