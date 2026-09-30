import { enginePath, readJson } from './paths.js';

/**
 * Hard-coded publishing caps. Deliberately NOT read from config.json or any prompt,
 * so no configuration or model output can raise them.
 */
export const HARD_CAPS = Object.freeze({ maxPerWeek: 2, maxPerDay: 1 });

export interface Config {
  paused: boolean;
  pausedReason?: string;
  disclosure: { enabled: boolean; text: string };
  site: { url: string; author: string };
  gscProperty?: string;
  /** PRD week-8 niche lock: when set, niche-guides posts must match one of these keywords. null = open. */
  nicheLock?: { niche: string; keywords: string[] } | null;
  offer: {
    starter: { monthly: number; annual: number; buyout: number };
    business: { monthly: number; annual: number; buyout: number };
    localSeo: { monthly: number };
    addons: Record<string, number | { setup: number; monthly: number }>;
    termMonths: number;
    bookingUrl: string;
  };
  models: { brief: string; draft: string; humanize: string; editor: string; factCheck: string; research: string };
  budget: { maxTokensPerRun: number; maxModelCallsPerRun: number; monthlyModelCallCap: number; maxWebSearchesPerRun: number };
  cadence: { publishHourMT: number; jitterHours: number; rampWeeks: number; healthyChecksToRamp: number; maxSamePillarShareOfLast10: number };
  weights: { demand: number; intent: number; winnability: number; local: number; cannibalization: number; gscShiftAfterDays: number; gscHeavyDemandWeight: number };
  gates: {
    editorMinEach: number; editorMinAverage: number; voiceMin: number; maxRewrites: number; maxTopicTriesPerRun: number;
    similarityMax: number; keywordDensityMax: number; sentenceStdDevMin: number; contractionsPer100WordsMin: number;
    fleschKincaidMaxGrade: number; psiMobileMin: number;
  };
  health: {
    notIndexedShare: number; notIndexedAfterDays: number; impressionDropShare: number; pauseWeeksOnIndexing: number;
    zeroImpressionRefreshDays: number; zeroImpressionPruneDays: number; gateFailureRateMax: number;
  };
  bannedPhrases: string[];
  fakeClientPhrases: string[];
  disparagementPhrases: string[];
  internalPages: string[];
  servicePages: string[];
}

export function loadConfig(): Config {
  return readJson<Config>(enginePath('config.json'), {} as Config);
}

/** Every price/number that is allowed to be attributed to Mayfly in a post. */
export function allowedOfferNumbers(cfg: Config): Set<number> {
  const out = new Set<number>([0]); // "$0 upfront" is part of the offer
  const walk = (v: unknown) => {
    if (typeof v === 'number') out.add(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(cfg.offer);
  return out;
}
