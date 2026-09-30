# Blog engine: how it works and how to run it

A scheduled, hands-off pipeline: research keywords, write a helpful post, run it past automated editors and
gates, publish it, index it, and watch the results. It ships **paused**. Nothing publishes until you flip it on
(see the go-live checklist in [SETUP.md](./SETUP.md)).

## The weekly loop

```
GitHub Actions (Mon + Thu, hourly window) -> blog-engine scripts -> commit to main -> Cloudflare Pages deploys

pick topic -> brief (web research) -> draft -> humanize -> editor loop (max 2 rewrites)
  -> fact-check -> deterministic gates -> build + JSON-LD validate + Lighthouse -> commit -> IndexNow / GSC sitemap
```

If a draft fails after two rewrites it's discarded, the keyword is marked `rejected` with the reason, and the next
topic is tried (max 3 per run, then the run is skipped and logged).

## Guardrails that live in code (not config, not prompts)

- **Never more than 2 posts a week or 1 a day.** `HARD_CAPS` in `blog-engine/lib/config.ts`, frozen, tested.
- **Ramp:** weeks 1 to 4 are 1 post a week (Mondays). Twice a week (Mon + Thu) only after the ramp weeks and 4 healthy weekly checks in a row.
- **Jitter:** each slot gets a random publish target of 07:00 Mountain +/- 3 hours.
- **Never fabricated:** no clients, testimonials, case studies, results, or personal stories. First-person experience is allowed only from `blog-engine/notes/inbox.md`. The editor auto-fails any post that contains it otherwise.
- **Every statistic needs a linked source in the same paragraph**, and the fact-checker fetches each cited page to confirm the claim appears there.
- **Kill switch:** `blog-engine/config.json` -> `"paused": true`.

## The gates (`blog-engine/lib/gates.ts`)

First paragraph 50 to 75 words. Title 60 or fewer, meta 140 to 155. At least 3 H2s, most as questions. 3 to 5 FAQs
(40 to 60 words each). At least 2 sources, every number cited. 3 to 5 internal links that all resolve, one to a
service page. Primary keyword unused and under 50% similar to any post. No em dashes, banned phrases, fake-client
phrases or disparagement. Keyword density under 2%. Mayfly prices match `config.json`. Grade 9 or below. Sentence
variety, contractions, no repeated openers. Format differs from the last post; no pillar over 40% of the last 10.
Editor: every score at least 4, average at least 4.2, voice at least 4. Then a real `npm run build`, JSON-LD
validation, and mobile Lighthouse (median of 3) of at least 90.

## Commands

| Command | What it does |
|---|---|
| `npm run engine:test` | Unit + rehearsal tests (mock model, real gates) |
| `npm run engine:baseline` | Import Search Console CSVs from `blog-engine/data/baseline/` into the backlog |
| `npm run engine:research` | Expand seeds, score, cluster, write `keyword-backlog.json` (add `-- --deep`, `-- --offline`) |
| `npm run engine:pick` | Show the next topic without writing anything |
| `npm run engine:dry-run` | Full pipeline except the commit (needs `ANTHROPIC_API_KEY`) |
| `npm run engine:run` | The real scheduled run (respects slot, caps, paused) |
| `npm run engine:health` | Weekly circuit breaker (`-- --dry-run --simulate bad-index` to rehearse) |
| `npm run engine:refresh` | Monthly CTR tests, striking-distance FAQs, freshness, prune |
| `npm run engine:report` | Writes `reports/YYYY-MM.md` |
| `npm run engine:audit` | Checks existing posts against the accuracy gates |
| `npm run validate` | After a build: JSON-LD, titles, canonicals on every page |

## Circuit breaker (`engine:health`, Sundays)

| Signal | Action |
|---|---|
| More than 30% of the last 6 posts not indexed 21+ days after publishing | Pause 3 weeks, auto-resume at 1 post a week, open an issue |
| Site impressions down more than 35% over 2 weeks | Pause, write `reports/ALERT.md`, open an issue (manual resume) |
| Blog CTR in the bottom quartile for 60 days | Drop to weekly, queue refreshes |
| Post with 0 impressions | Refresh at 120 days; `noindex` at 180 days |
| More than 50% of runs failed this month | Pause, alert |

Search Console has no API for manual-action notices. Keep Search Console email alerts on as the backup signal.

## Monthly optimization (`engine:refresh`)

CTR fix (3 title/meta variants, best applied, re-measured after 28 days, reverted if worse), striking-distance FAQ
(queries at position 8 to 20), freshness re-check for posts older than 90 days (`updatedDate` moves only when the
content really changed), prune. Back-links added to older posts do not bump `updatedDate`.

## Files

```
blog-engine/
  config.json  seeds.json  keyword-backlog.json  published-log.json  health-state.json
  lib/        gates, text metrics, schedule, health, Claude wrapper, GSC/Bing/IndexNow clients
  scripts/    research, pick, draft, humanize, editor-loop, fact-check, quality-gate, publish, ...
  prompts/    writer, brief, editor-rubric, factcheck, humanize, revise, keyword-analysis
  voice/      voice-profile.md and samples/
  notes/      inbox.md (public, see below)
  data/       baseline CSVs, spend ledger, caches
  tests/
```

**This repo is public.** Everything committed, including `notes/inbox.md`, the voice profile, backlog, prompts and
alert issues, is visible to anyone. Don't put anything private in them.
