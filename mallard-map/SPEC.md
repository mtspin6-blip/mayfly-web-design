# SPEC: Montana Duck Movement Map (v5+)

## 1. Goal
Show **how ducks actually fly through Montana during duck season**: flight paths as **lines from real tracking data**,
where they stop and how long they stay, hot spots, and where to expect birds. View it statewide or zoomed into a region
(Bitterroot, Great Falls, Flathead, Hi-Line, etc.). Mallards first, other ducks too.

## 2. What Mitch told us (decisions)
- **Lines, not heat maps.** The main view is flight-path lines from REAL tracks. Heat maps (eBird, model output) are
  the *knowledge underneath*: used to learn, rank hot spots and fill gaps, shown only when asked.
- **Topo base by default** so marshes, water and terrain show.
- **Duck season focus** (Montana 2026–27: youth Sep 26–27; Pacific Flyway Oct 3–Jan 15; Central Zone 1 Oct 3–Jan 7;
  Central Zone 2 Oct 3–11 & Oct 24–Jan 19; **verify in the FWP PDF**). A "full year" toggle is fine.
- **Expand beyond Montana** wherever Montana data is thin (ND, SD, WY, ID, AB, SK and the full flyways if tracks pass
  through), and learn from it.
- **No emails to researchers.** Use only data that's public or downloadable by Mitch in a browser (Claude in Chrome
  on his laptop is fine for click-through downloads; never script around a bot check).
- **Mobile first**, laptop second. Every panel must be closable (✕), nothing covers the map by default on a phone.
- **Hosting:** private link. Deploy to a dev subdomain on Mayfly Web Design's hosting (ask Mitch which host and domain
  on first deploy), or Netlify / Cloudflare Pages / GitHub Pages. Unlisted URL + `noindex`; add a password if the host
  supports it cheaply. Note: a Claude artifact page can't load map tiles (its security rules block remote images),
  so it is not a fit for this app.

## 3. Species
Mallard `mallar3` (eBird S&T code) first. Then northern pintail `norpin`, green-winged teal `gnwtea`, American wigeon
`amewig`, gadwall `gadwal`, northern shoveler `norsho`, blue-winged teal `buwtea`, cinnamon teal `cintea`, canvasback
`canvas`, redhead `redhea`, lesser scaup `lessca`, common goldeneye `comgol`, bufflehead `buffle`. Verify codes via the API.

## 4. Features (priority order)
| # | Feature | Evidence | Notes |
|---|---|---|---|
| F1 | **Flight-path lines** per bird, colored by species, season segments bold, rest of year faint; arrows show direction; tap a line → species, dates, distance, where it came from and went | REAL | v4 has blue-winged teal. Add every public duck track that touches the area (see DATA_SOURCES priority list) |
| F2 | **Time spent**: stop circles sized by days (≥3 days within 5 km) + "hours per area" grid for zoomed views | DERIVED | v4 has teal stops |
| F3 | **Band → recovery lines** (mallard banded or shot in MT) | REAL | needs NABBP download |
| F4 | **Flyway corridors** learned from all tracks + recoveries + eBird week-to-week shifts + terrain/water: smooth, wide, semi-transparent "highways" with arrows; tap → confidence and evidence | MODELED | Draw visibly different from real lines; label "modeled" |
| F5 | **Hot spots** statewide and **per region** with coordinates, nearest refuge / public access | MODELED/DERIVED | v4: statewide top 10 |
| F6 | **Region chips** + "Near me" + MT + neighbors view | n/a | v4 has chips |
| F7 | **Week slider + play**, synced across all time layers (tracks animate by week) | n/a | v4 slider drives eBird only |
| F8 | **"Why here?" card**: tap a spot → habitat, water, elevation, recent weather, abundance trend | mixed | bottom sheet on phone |
| F9 | **Weather drivers**: cold fronts, freeze-up, snow, NW wind; Weather Severity Index like the USGS study | MODELED | later: live forecast "push" alerts |
| F10 | Species picker, laptop side panel, offline (PWA) | n/a | |

## 5. Knowledge base and learning loop (use Claude Code fully)
Claude Code should work like a small research team, in loops:
1. **Gather**: search for and download every public duck tracking dataset touching the area (Movebank public, USGS
   ScienceBase/data.usgs.gov releases, Dryad, Zenodo, GBIF, state agency releases). Log each in `data/catalog.csv`
   (source, species, years, area, license, citation, rows).
2. **Learn**: for each state and species, compute arrival and departure dates, stopover sites, travel speed and direction,
   corridor use, and how weather and habitat relate to moves. Write findings to `docs/kb/states/*.md` and
   `docs/kb/topics/*.md` with REAL/DERIVED/MODELED tags and sources.
3. **Model**: weekly expected-use and corridor model on a ~3 km grid over MT + neighbors (habitat, water, crops,
   elevation, weather, eBird abundance as inputs; tracks + recoveries as truth). Keep it explainable. Validate on
   held-out birds/years and report accuracy in plain words.
4. **Show**: lines first, hot spots second, heat maps on demand. Screenshot at 390×844 and 1280×800 after every change.
5. **Repeat** each session: read the KB, find the biggest gap, close it, update the KB.

## 6. Data plan
See DATA_SOURCES.md. Covariates: Daymet (weather history, US + Canada), NWS API (current/forecast), USGS 3DEP + CDEM
(elevation), NWI + Canadian wetlands, Annual NLCD, USDA Cropland Data Layer (grain), JRC Global Surface Water,
PAD-US public land, FWP WMAs, NWRs, flyway/zone boundaries.

## 7. Mobile UX rules (learned from Mitch's feedback)
- Every overlay closes with a visible ✕; the layer panel also closes on map tap. Legend starts closed on phones.
- Bottom dock: region chips (horizontal scroll) + week slider + play. Touch targets ≥ 44 px.
- Group layers: **Flight paths · Time spent · Hot spots · Abundance (heat) · Weather · Habitat · Reference**, with
  short names. No more than 3 data layers on at load.
- Topo base default; reference layers quiet; no duplicate labels.
- Use MapLibre GL + vector tiles/PMTiles when data grows, so it stays fast on LTE.

## 8. Phases
| Phase | Output | Done when |
|---|---|---|
| 0 | Environment, rebuild v4 | matches outputs/ |
| 1 | Track hunt: all public duck tracks + NABBP + catalog | catalog.csv; report shows birds/lines per state and species |
| 2 | Learning: KB per state/species, covariate stack | KB notes with numbers + sources |
| 3 | Corridor + expected-use model, validated | plain-language accuracy |
| 4 | App v5 (MapLibre), deployed to private link | Mitch approves on phone + laptop |
| 5 | In-season weekly refresh (weather, new data) | scheduled job runs |
