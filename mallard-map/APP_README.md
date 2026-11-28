# Montana Duck Map v5 (the app)

A static web page: open `index.html` through any web server. No build step, no accounts, no API keys.

- Map engine: MapLibre GL JS 4.7.1, copied into `vendor/` (BSD-3, see `vendor/LICENSE.txt`).
- Data: `public/duck-map/data/`, made by `python scripts/build_app.py` (run from `mallard-map/`).
- Base maps load from Esri tile servers; wetlands from the USFWS NWI map service. Everything else is in this folder.
- Page has `noindex, nofollow`. Host it on a private/unlisted URL (see SPEC.md §2).

Try it locally: `cd public/duck-map && python3 -m http.server 8000`, then open http://localhost:8000.

| File | What it is | Evidence |
|---|---|---|
| `data/corridors_season.geojson` | Estimated flight paths with a 52-week strength array `w` | MODELED (REAL headings) |
| `data/tracks.geojson` | Blue-winged teal tracks, one line per bird per week (`s`=1 in duck season, `wk`=eBird week) | REAL |
| `data/birds.json` | One summary per teal (tag site, dates, km, states visited, fixes in MT) | REAL |
| `data/stops.geojson` | Teal stays ≥ 3 days within 5 km | DERIVED |
| `data/spots.json` | Distinct mallard spots with weekly values (ranked per week in the app) | MODELED |
| `data/ebird.bin` + `ebird.json` | eBird S&T mallard weekly abundance, 52 weeks × 162 × 60 cells, 1 byte each (log scale) | MODELED |
| `data/timing.json` | Weekly mallards per region + season type (early / all / late) | MODELED |
| `data/weather.json` | Weather on real departure days vs stay days (scripts/analyze_weather.py) | REAL |
| `guide.html` | In-app expert guide (short version of docs/kb/EXPERT_GUIDE.md) | mixed |
| `data/usgs.json` | USGS ND/SD mallard movement summary (no coordinates) | REAL |
| `data/reference.json` | Montana outline, rivers, lakes, refuges, towns, region boxes, season window | reference |
