import { enginePath, readJson, writeJson } from './paths.js';

export type Pillar = 'website-cost' | 'local-seo' | 'ai-search' | 'niche-guides' | 'automations' | 'website-problems';

export interface PublishedEntry {
  slug: string;
  keyword: string;
  title: string;
  format: string;
  pillar: Pillar;
  publishedAt: string;
  gateSummary: string;
  editorScores?: Record<string, number>;
  ctaChanged?: { from: string; to: string; at: string; baselineCtr?: number };
  refreshedAt?: string[];
  status?: 'live' | 'noindex' | 'merged';
}

export interface BacklogItem {
  keyword: string;
  cluster: { primary: string; secondary: string[] };
  score: number;
  intent: 'informational' | 'commercial' | 'local' | 'navigational' | 'unrelated';
  pillar: Pillar;
  sources: string[];
  status: 'new' | 'queued' | 'published' | 'rejected';
  signals?: {
    gscImpressions?: number; gscPosition?: number; bingImpressions?: number; autocompleteDepth?: number;
    trends?: number; winnability?: number; local?: boolean; cannibalization?: number;
  };
  rejectedReason?: string;
  rejectedAt?: string;
}

export interface HealthState {
  launchDate?: string;
  cadence: 'weekly' | 'twice-weekly';
  consecutiveHealthy: number;
  pausedUntil?: string;
  pauseReason?: string;
  resumeCadence?: 'weekly' | 'twice-weekly';
  lastCheck?: string;
  nextPublishAt?: { slot: string; at: string };
  runs: { at: string; ok: boolean; reason?: string }[];
  siteImpressionsHistory: { at: string; twoWeekImpressions: number }[];
  seed?: boolean;
}

export const STATE_FILES = {
  published: enginePath('published-log.json'),
  backlog: enginePath('keyword-backlog.json'),
  health: enginePath('health-state.json'),
  spend: enginePath('data/usage-ledger.json'),
  seeds: enginePath('seeds.json'),
};

export const loadPublished = () => readJson<PublishedEntry[]>(STATE_FILES.published, []);
export const savePublished = (v: PublishedEntry[]) => writeJson(STATE_FILES.published, v);
export const loadBacklog = () => readJson<BacklogItem[]>(STATE_FILES.backlog, []);
export const saveBacklog = (v: BacklogItem[]) => writeJson(STATE_FILES.backlog, v);

export const defaultHealth = (): HealthState => ({
  cadence: 'weekly',
  consecutiveHealthy: 0,
  runs: [],
  siteImpressionsHistory: [],
});
export const loadHealth = () => ({ ...defaultHealth(), ...readJson<Partial<HealthState>>(STATE_FILES.health, {}) });
export const saveHealth = (v: HealthState) => writeJson(STATE_FILES.health, v);
