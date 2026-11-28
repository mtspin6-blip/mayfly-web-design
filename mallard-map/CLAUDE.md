# Montana Duck Movement Map — project rules for Claude Code

## Who this is for
Mitch: a non-technical product manager in Great Falls, MT who hunts waterfowl. Explain things in plain language, lead with
results, keep replies short, and use tables or bullets for anything complex. Ask only when truly blocked; otherwise pick a
sensible default and say what you assumed.

## The goal (read SPEC.md for detail)
Understand how mallards and other ducks move through Montana during **duck season**: flight paths, hot spots, where birds
spend time, and where to expect them, statewide and zoomed into regions (Bitterroot, Great Falls, Flathead, Hi-Line, etc.).
Must work well on a **phone** first, and also on a laptop.

## Non-negotiable rules
1. **Label every layer and number by evidence type:**
   - **REAL**: measured individual birds (GPS/Argos tracks, band recoveries).
   - **DERIVED**: computed from REAL data (stopovers, time spent, recovery corridors).
   - **MODELED**: statistical estimates (eBird Status & Trends, our own expected-use model).
   Never present a MODELED corridor as an observed flight path.
2. **Say so when data is missing.** Today there is **no public mallard GPS data inside Montana** (see DATA_SOURCES.md).
   If a layer has no Montana data, show where its data actually is (label by state/province).
3. **Species are separate.** Mallard data and other-duck data are never merged into a single "mallard" number.
4. **Cite everything.** Every source gets a citation and license in the map's Sources panel and in report.md.
5. **Reference layers stay quiet** (towns, topo/hillshade, rivers, wetlands, refuges): light gray/blue, behind the birds.
6. **Mobile first.** Test at 390×844 (phone) and 1280×800 (laptop) with Playwright screenshots after every UI change.
7. **Don't bypass bot checks or logins.** ScienceBase and Movebank-private data must be downloaded by Mitch in a browser
   or requested from the data owner. Never scrape around a Cloudflare challenge.
8. Season window comes from FWP regulations, verified each year (2026–27: Sep 26 – Jan 19 covers youth days and all zones).
9. Secrets (eBird key, Movebank login) live in `.env`, never in code or commits.
10. **Lines first.** The main view is real flight-path lines + time-spent stops. Heat maps are the knowledge underneath:
    off by default, shown on demand.
11. **Topo base map by default.** Every panel closes with a visible ✕; legend starts closed on phones.
12. **No emails to researchers.** Use public data and browser downloads only (Claude in Chrome is OK for clicks).
13. **Work autonomously.** Run the gather → learn → model → show loop in SPEC §5; keep `docs/kb/` and `data/catalog.csv`
    current; ask Mitch only for decisions, sign-ins, or hosting details.

## Layout
- `app/`: **v5 map app** (MapLibre, static files). Lives at `../public/duck-map/` (served at mayflywebdesign.com/duck-map/ once merged; branch previews on Cloudflare Pages). Data built by `python scripts/build_app.py` → `../public/duck-map/data/`. See `APP_README.md`.
  The eBird `.tif` is not in git (license); without it the build keeps the existing eBird files.
- `scripts/mallard_map.py`: current working pipeline (folium map + report). Run: `python scripts/mallard_map.py --data data --ref reference --out outputs/map.html --report outputs/report.md`
- `scripts/get_ebird_mallard.py`: eBird S&T downloader (Python, uses `EBIRDST_KEY`).
- `scripts/get_bbl_mallard.py`: banding data filter (needs files Mitch downloads from ScienceBase).
- `scripts/get_movebank_public.py`: downloads public Movebank studies.
- `data/`: inputs (see DATA_SOURCES.md). `outputs/`: v4 map + report from the chat session.
- `docs/kb/`: the knowledge base: what we've learned per state and per topic. **Update it as you learn**; it is the
  project's memory between sessions.

## Definition of done for any change
Map builds without errors, phone and laptop screenshots look right, report.md counts match the data, labels follow the rules above.
