# CLAUDE.md: Mayfly Web Design site (mayflywebdesign.com)

Astro 4 + Tailwind on Cloudflare Pages. This folder is its **own git repo** (github.com/mtspin6-blip/mayfly-web-design, branch `main` auto-deploys). The parent `montana-business-wd/` repo is separate. Read `../../CLAUDE.md` for business rules (never invent reviews, prices, clients).

Mitchell is learning web development: explain in plain English.

## Commands
- `npm run dev` / `npm run build` / `npm run validate` (after a build: JSON-LD, titles, canonicals on every page)
- `npm run engine:test` (unit + rehearsal tests), `npm run engine:typecheck`

## Site rules
- Canonical URL is always the apex with a trailing slash (`src/lib/site.ts`, `BaseLayout.astro`). Never hard-code `www.`.
- `@astrojs/sitemap` is **pinned to 3.2.1**: newer versions need Astro 5 and crash the build on Astro 4.
- Blog frontmatter schema is in `src/content/config.ts` (`sources`, `faq`, `pillar`, `format`, `primaryKeyword`, `seoTitle`, `noindex`, ...). Dates are strings and must be quoted in YAML (`date: "2026-10-06"`), or Astro reads them as Dates and the build fails.
- City pages are data in `src/data/cities.ts`, rendered by `src/pages/web-design/[city].astro`. Each city's content is hand-written and specific. Never generate more in bulk and never claim a local presence outside Missoula.
- Prices come from `blog-engine/config.json` (`offer`). Source of truth for pricing is `../business/Mayfly_Web_Design_Pricing_Plan.md`.
- `llms.txt`, `rss.xml`, OG images (`/og/<slug>.png`), topic hubs and IndexNow key file are generated at build. Don't hand-edit or add static copies in `public/`.

## Blog engine (`blog-engine/`), see `docs/BLOG-ENGINE.md` and `docs/SETUP.md`
Automated weekly pipeline: research, brief, draft, humanize, editor loop, fact-check, gates, publish, index. Weekly health check with a circuit breaker; monthly optimization and report. Runs in GitHub Actions (`.github/workflows/blog-*.yml`).

Rules for anyone (human or model) editing it:
1. **Kill switch:** `blog-engine/config.json` `"paused"`. It ships `true`. Never flip it without Mitchell asking.
2. **Never raise `HARD_CAPS`** (1 post/day, 2/week) in `lib/config.ts` and never make them configurable.
3. **Never fabricate:** no clients, testimonials, case studies, results, invented quotes or personal stories. First-person material only from `blog-engine/notes/inbox.md`.
4. Every statistic needs a cited source; the gates and fact-checker enforce it. Don't loosen a gate to make a draft pass. Fix the draft.
5. Changing a gate, prompt or threshold? Add or update a test in `blog-engine/tests/`. The good fixture (`tests/fixtures/good-post.md`) must keep passing every gate.
6. Model calls go through `lib/claude.ts`, which runs Claude Code headless under Mitchell's Claude account (`CLAUDE_CODE_OAUTH_TOKEN`). **There is no API key and there must never be one**: API credentials are stripped from the child process so nothing can bill per token. Call caps and usage-limit handling live there. Models: `claude-opus-5-5` for brief/draft, `claude-sonnet-5-5` for humanize/editor/research, `claude-haiku-4-5` for fact-check.
7. The repo is **public**. Nothing private in `blog-engine/`, `notes/`, or alert issues.

## Known follow-ups
- `npm run engine:audit` shows the 5 posts written before the engine have 39 statistics with no cited source and no `sources`/`faq`. Fix or source them.
- The committed keyword backlog was built with heuristics (no Claude access when it was made). Re-run `npm run engine:research -- --deep` once Claude Code is signed in.
