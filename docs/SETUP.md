# Setup and go-live checklist

Everything the engine needs from you. None of it can be done from code.

## 1. Fix www vs non-www (Cloudflare, 3 minutes)
Follow [cloudflare-www-redirect.md](./cloudflare-www-redirect.md). Do this before anything publishes.

## 2. Search Console
- Use a **Domain property** for `mayflywebdesign.com`.
- Submit `https://mayflywebdesign.com/sitemap-index.xml` (Sitemaps). The old `sitemap.xml` was hand-written and is gone.
- In URL Inspection, check the 3 older posts that had no impressions and request indexing if they aren't indexed.
- Search Console **Settings -> Email notifications**: keep on. It's the only place manual-action notices reach you.

## 3. Search Console API access for the engine (service account)
1. Google Cloud Console -> create a project (name it `mayfly-blog-engine`).
2. **APIs & Services -> Library** -> enable **Google Search Console API**.
3. **IAM & Admin -> Service Accounts -> Create service account** (name `blog-engine`, no roles needed) -> **Keys -> Add key -> JSON**. A `.json` file downloads.
4. Copy the service account's email (ends `.iam.gserviceaccount.com`).
5. Search Console -> **Settings -> Users and permissions -> Add user** -> paste the email -> permission **Full** (sitemap submission needs it).
6. GitHub repo -> **Settings -> Secrets and variables -> Actions** -> new secret `GSC_SERVICE_ACCOUNT_JSON` = the entire contents of the JSON file.
7. Delete the downloaded file. Never commit it.

## 4. Secrets (GitHub -> Settings -> Secrets and variables -> Actions)

| Secret | Where to get it | Required |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | On your computer run `claude setup-token`, sign in to your Claude account, copy the token it prints. **No API key, no extra charges:** usage counts against your Claude plan's limits. | Yes |
| `GSC_SERVICE_ACCOUNT_JSON` | Step 3 | For indexing checks and real keyword data |
| `BING_WEBMASTER_API_KEY` | Bing Webmaster Tools -> Settings -> API access (site must be verified; you can import it from Search Console) | Optional |
| `INDEXNOW_KEY` | Run `openssl rand -hex 16`. Also add it as a **Cloudflare Pages environment variable** named `INDEXNOW_KEY` (Production) and redeploy, so `/<key>.txt` is served. | Optional |
| `PSI_API_KEY` | Google Cloud -> Credentials -> API key (PageSpeed Insights API). Works without one at low volume. | Optional |

Also in Cloudflare Pages -> Settings -> Environment variables: `PUBLIC_CF_BEACON_TOKEN` (from Cloudflare Web Analytics -> your site -> snippet token) to turn on the free analytics beacon.

## 5. Baseline data
Drop your Search Console exports into `blog-engine/data/baseline/` (`Queries.csv`, `Pages.csv`). The PRD's day-one table is already loaded from `prd-queries.json`. Then:

```bash
npm run engine:baseline
npm run engine:research -- --deep
```

`engine:research` uses Claude (your account, via Claude Code) for intent and winnability when it's signed in; otherwise it uses heuristics. The committed backlog was built with heuristics, so re-run it once you're signed in.

## 5b. How it uses your Claude account (and why there's no API key)
GitHub's scheduler runs on GitHub's computers, so it has to sign in as you. The workflows install Claude Code and
sign in with the long-lived token from `claude setup-token`. Every model step (brief, draft, rewrite, editor,
fact-check, web research) runs through Claude Code under your plan. Nothing is billed per token. The code
deliberately strips `ANTHROPIC_API_KEY` from the environment before each call, so a stray key can't cause API charges.

- If you hit your plan's usage limit mid-run, the run stops cleanly, the topic is **not** marked rejected, and the next hourly run tries again.
- Guard rails against eating your plan: max 40 model calls per run and 400 per month (`budget` in `config.json`).
- To use less of your limit, set `models.brief` and `models.draft` to `claude-sonnet-5-5` in `config.json`.
- Anthropic documents this token route for Claude Code in GitHub Actions. Check that your plan's terms cover automated use.

## 6. Rehearse, then go live
1. GitHub -> Actions -> **blog-publish** -> Run workflow -> leave **dry run** ticked. Read the log: brief, draft, editor scores, gates.
2. Optional: drop real notes in `blog-engine/notes/inbox.md` (public!) and real writing in `blog-engine/voice/samples/`, then `npm run engine:voice`.
3. Edit `blog-engine/config.json`: set `"paused": false`, commit, push. The next Monday window publishes the first post.

## Answers to the PRD's section 15 questions
1. **Free demand sources.** Google autocomplete works with no key and is what the committed backlog used. Bing Webmaster (`GetQueryStats`, `GetRelatedKeywords`) is wired but untested here because it needs your key; it fails soft. `google-trends-api` is unofficial and often breaks; it's optional (`--trends`) and fails soft.
2. **GSC service account.** Section 3 above.
3. **GitHub Actions minutes.** The repo is **public**, so standard Actions minutes are free and unlimited. If it ever goes private, expect roughly 100 to 150 minutes a month (most hourly runs exit in seconds), well under the 2,000 free.
4. **Niche lock (week 8).** `config.json` has `"nicheLock": null`. At week 8, set it to e.g. `{ "niche": "fly fishing outfitters", "keywords": ["fly fishing", "outfitter", "guide"] }` and niche-guides topics will match only those.
