import { enginePath, readJson, writeJson } from './paths.js';

const FILE = enginePath('data/actions-log.json');
export interface ActionEntry { at: string; kind: string; slug?: string; detail: string }

export const logAction = (kind: string, detail: string, slug?: string) => {
  const log = readJson<ActionEntry[]>(FILE, []);
  log.push({ at: new Date().toISOString(), kind, slug, detail });
  writeJson(FILE, log.slice(-500));
};
export const loadActions = () => readJson<ActionEntry[]>(FILE, []);
