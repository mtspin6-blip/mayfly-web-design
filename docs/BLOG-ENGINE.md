# Blog engine: how it works and how to run it

A scheduled, hands-off pipeline: research keywords, write a helpful post, run it past automated editors and
gates, publish it, index it, and watch the results. It ships **paused**. Nothing publishes until you flip it on
(see the go-live checklist in [SETUP.md](./SETUP.md)).

## The weekly loop

Writing and publishing are separate jobs that share a **ready queue** (`blog-engine/queue/`, two finished, gate-passing posts).

```
GitHub Actions (Mon 15:00 UTC, Mon 21:00 UTC, Tue 15:00 UTC)
  1. publisher (no model calls): if nothing went out in the last 6 days (3 if twice-weekly), publish the OLDEST queued post
  2. writer: if the queue holds fewer than 2, write more:
       pick topic -> brief (web research) -> draft -> humanize -> editor REPAIRS (returns a corrected post)
       -> fact-check + deterministic gates -> targeted fix pass with the exact failure list (up to 3 rounds)
       -> build + JSON-LD validate + Lighthouse -> queue
  3. one commit (post + queue + state) -> pull --rebase --autostash -> push (3 tries, fails loudly)
  4. poll the live URL until 200 (Cloudflare Pages), ping IndexNow / Search Console
  5. open a GitHub issue (GitHub emails you) saying what happened; a crash opens its own alert issue
```

- **Only deterministic gates can hold a draft back.** The editor's scores are advisory. A gate failure (or a claim the fact-checker can't support) goes to a fix pass with the exact list; only after 3 failed fix passes is the topic set aside (marked `rejected`, draft saved as a run artifact).
- **The one judgment call that stays:** if the editor says invented experience/clients remain after it tried to remove them, the draft is set aside at once (no fabrication, ever).
- **A bad writing day never costs a week:** the publisher needs no model, so a queued post goes out even if the writer fails or Claude's plan limit is hit.
- **No time window.** GitHub's cron can arrive hours late; any of the three runs may publish. Running twice is harmless: the "last N days" rule and the hard caps read the published log.
- **Alerts:** every run opens a GitHub issue. Runs that need nothing from you (published, queued, nothing due) are closed immediately; a run that needs a look (crash, post due but none went out, page not live, writer stopped with an empty queue) stays open with the `needs-attention` label.

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
| `npm run engine:dry-run` | Full pipeline except the commit (needs Claude Code signed in: locally `claude`, in GitHub `CLAUDE_CODE_OAUTH_TOKEN`) |
| `npm run engine:run` | The real scheduled run: publish from the queue, refill the queue (respects caps, paused) |
| `npm run engine:report-run` | Turns `data/last-run.json` into the GitHub issue (add `--crash` for the crash alert) |
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
  data/       baseline CSVs, usage ledger, caches
  tests/
```

**This repo is public.** Everything committed, including `notes/inbox.md`, the voice profile, backlog, prompts and
alert issues, is visible to anyone. Don't put anything private in them.
