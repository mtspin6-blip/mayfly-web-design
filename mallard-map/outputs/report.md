# Mallard movement map — data report

## Inside Montana

| Data | Type | Total | In Montana |
|---|---|---|---|
| Mallard GPS birds | REAL | 0 | 0 |
| Mallard GPS tracks (bird × season trips) | REAL | 0 | 0 |
| Mallard GPS locations (cleaned, ≤1/h) | REAL | 0 | 0 |
| USGS 2018–2020 birds / movements | REAL (summarized, no coordinates) | 97 / 562 | 0 (extent starts 103.4° W) |
| BBL band→recovery pairs | REAL (1° blocks) | 0 | 0 banded in MT · 0 recovered in MT |
| Mallard stopovers (>3 d within 5 km) | DERIVED | 0 | 0 |
| eBird weekly relative abundance | MODELED | 52 weeks, 9 km cells | clipped to MT |
| Other waterfowl satellite (Argos) birds / fixes (Blue-winged teal, NOT mallard) | REAL | 42 / 22,727 | 3 / 39 |
| Other waterfowl stopovers (approx.) | DERIVED | 444 | 1 |

**No mallard GPS crosses Montana.** No public mallard GPS study covering MT/ND/SD/AB/SK/ID was found on Movebank or in the Movebank Data Repository, and the USGS 2018–2020 release has no coordinates. Mallard GPS layers are empty; the only REAL tracks shown are blue-winged teal (a different species, Argos satellite fixes), labeled by region.

## Top 10 time-spent areas — REAL mallard GPS (stopover bird-days)

_None — no mallard GPS available (see above)._

## Top 10 duck-season hot spots in Montana — MODELED eBird mean weekly relative abundance, 09-26 to 01-19 (a proxy, not time spent)

| # | Lat | Lon | mean rel. abundance | Birds | Region | Nearest reference site |
|---|---|---|---|---|---|---|
| 1 | 47.936 | -114.145 | 165.91 | – | MT | Swan River NWR (20 km) |
| 2 | 45.330 | -107.958 | 95.26 | – | MT | Hailstone NWR (117 km) |
| 3 | 47.700 | -106.270 | 68.05 | – | MT | Charles M. Russell NWR (70 km) |
| 4 | 47.936 | -106.551 | 59.27 | – | MT | Charles M. Russell NWR (59 km) |
| 5 | 48.218 | -114.286 | 39.29 | – | MT | Lost Trail NWR (30 km) |
| 6 | 48.405 | -104.302 | 39.15 | – | MT | Medicine Lake NWR (10 km) |
| 7 | 45.822 | -111.192 | 38.24 | – | MT | Canyon Ferry WMA (state) (75 km) |
| 8 | 48.498 | -107.536 | 38.12 | – | MT | Bowdoin NWR (14 km) |
| 9 | 47.700 | -106.833 | 36.19 | – | MT | Charles M. Russell NWR (29 km) |
| 10 | 47.653 | -107.676 | 35.84 | – | MT | UL Bend NWR (15 km) |

## Top 10 time-spent areas in MT/ND/SD/AB/SK/ID — REAL blue-winged teal Argos, NOT mallard (stopover bird-days, by region)

| # | Lat | Lon | bird-days | Birds | Region | Nearest reference site |
|---|---|---|---|---|---|---|
| 1 | 48.473 | -102.005 | 127.31 | 1 | ND | — (no MT refuge within 150 km) |
| 2 | 52.229 | -109.626 | 122.57 | 1 | SK | — (no MT refuge within 150 km) |
| 3 | 51.959 | -106.276 | 91.98 | 2 | SK | — (no MT refuge within 150 km) |
| 4 | 51.403 | -103.900 | 91.44 | 1 | SK | — (no MT refuge within 150 km) |
| 5 | 46.354 | -99.415 | 83.64 | 1 | ND | — (no MT refuge within 150 km) |
| 6 | 50.889 | -105.491 | 66.41 | 1 | SK | — (no MT refuge within 150 km) |
| 7 | 50.958 | -102.910 | 65.66 | 1 | SK | — (no MT refuge within 150 km) |
| 8 | 51.704 | -108.866 | 64.73 | 1 | SK | — (no MT refuge within 150 km) |
| 9 | 50.474 | -107.821 | 58.95 | 1 | SK | — (no MT refuge within 150 km) |
| 10 | 51.427 | -105.207 | 58.46 | 1 | SK | — (no MT refuge within 150 km) |

## USGS 2018–2020 movement summary (REAL, no coordinates)

- 97 juvenile birds tagged in ND/SD (2018: 30, 2019: 67; 44 F / 53 M); 562 movements (147 migration, 415 regional).
- Migration: n=147, median 683.6 km, range 311.0–1779.4 km.
- Regional: n=415, median 56.4 km, range 25.0–306.3 km.
- First migration: n=95, median 838 km, mean bearing 158°.
- Timing table: 6098 exposure records, 6625 bird-days.

## USGS tables without coordinates

- MALL_dist_dir.csv: 562 rows; columns: device_id, sex, capture_yr, area_id, move_type, first_m, move_d, bearing, wsi3, wsi5, wsi7, weekend, photoperiod, temp_mean, temp_min, temp_max, precipitation, cloud_cover, wind_index, temp_mean3d, temp_mean5d, temp_mean7d, temp_min3d, temp_min5d, temp_min7d
- MALL_timing.csv: 6,098 rows; columns: device_id, sex, capture_yr, area_id, move_type, first_m, exposure, move, wsi3, wsi5, wsi7, weekend, photoperiod, temp_mean, temp_min, temp_max, precipitation, cloud_cover, wind_index, temp_mean3d, temp_mean5d, temp_mean7d, temp_min3d, temp_min5d, temp_min7d

## Data source status (searched 2026-11-27)

| Source | Result |
|---|---|
| eBird S&T (MODELED) | Downloaded via st-download.ebird.org: mallar3 weekly abundance, median, 9 km, data version 2025, 52 weeks. Cropped to Montana. |
| Bird Banding Lab (REAL) | **Not loaded.** Latest release is NABBP 1960–2026 (doi:10.5066/P1CCONUX, 57 species-group CSVs). ScienceBase returns a bot check to scripted downloads, so the files could not be fetched here. Loader is adapted to the real columns (EVENT_TYPE, ORIGINAL_BAND, SPECIES_ID, LAT_DD, LON_DD, ISO_SUBDIVISION, RECORD_SOURCE); `get_bbl_mallard.py` filters to species 1320 + Montana once the group zip is in `data/bbl/raw/`. |
| Movebank public studies (REAL) | 172 studies are open for download. None are North American mallards (only European mallard studies). One waterfowl study crosses the target states: **blueWingedTeal_USGS_ASC_argos** (42 teal, 2013–2016, 3 birds have fixes in MT) — downloaded, shown as a separate "not mallard" layer. Northern pintail (USGS ASC) downloaded and checked: 0 fixes in MT/ND/SD/AB/SK/ID, so not used. |
| Movebank Data Repository (REAL) | Mallard items found: van Toor 2013 & 2018 (Sweden/Europe), Kleyheeg 2017 (Netherlands), LifeTrack Ducks Lake Constance (Germany), domestic ducks (Asia). **None in the target region.** |

### Needs your Movebank login or a data request

Movebank's full study search and all non-public studies require a login, so studies hidden from the public list could not be listed here. Known North American mallard GPS projects for this region whose location data are not public:

| Study | Region | How to get it |
|---|---|---|
| Juvenile mallards ND & SD 2018–2020 (Pearse, Anchor, Szymanski; USGS NPWRC / SDSU / ND G&F / SD GF&P) — raw GPS behind the USGS summary tables | ND, SD → south | Data request: Aaron Pearse, USGS (apearse@usgs.gov) |
| Boreal/prairie female mallards, Alberta 2018 (Dyson, Slattery, Fedy; DU Canada IWWR / U. Waterloo) | AB, SK | Data request: DU Canada Institute for Wetland and Waterfowl Research |
| Any study on movebank.org you find with "Anas platyrhynchos" after logging in | — | Request access on the study page, then download CSV into `data/movebank/` |

## Cleaning steps & assumptions

- NWI wetlands shown as a live USFWS map service (no 1.5 GB download needed); it draws only when zoomed in to roughly county scale (USFWS limit 1:236,000).
- USGS MALL_dist_dir.csv: no coordinate columns found (562 rows) - summarized in report only.
- USGS MALL_timing.csv: no coordinate columns found (6,098 rows) - summarized in report only.
- USGS 2018-2020: 97 birds, 562 movements; release has distance & bearing but NO coordinates, so it cannot be drawn as tracks. Metadata extent starts at 103.4° W, east of Montana's border (~104.05° W): 0 locations in Montana.
- Movebank 'blueWingedTeal_USGS_ASC_argos' (blueWingedTeal_USGS_ASC_argos.csv): 33,583 rows -> 33,583 after species/visible/outlier flags (other waterfowl, NOT mallard; kept in a separate layer).
- Other-waterfowl GPS (Argos) cleaning: 33,583 fixes -> 33,533 after removing missing/invalid/duplicate -> 33,532 after speed-spike filter (>150 km/h in and out).
- Other-waterfowl GPS (Argos) thinned to <= 1 fix/1 h per bird for analysis: 22,727 fixes.
- Other waterfowl are Argos satellite fixes (error ~0.25 km to >10 km), so their stopovers are approximate; their top-10 list is limited to MT, ND, SD, AB, SK, ID.
- eBird S&T: mallard_abundance_median_weekly_9km_MT_2025.tif, 17 duck-season weeks (09-26 to 01-19), ~9.0 km cells, clipped to Montana, reprojected to Web Mercator (nearest neighbour); colors log-scaled, fixed max = 99th pct (82.9).
- Inlined 6 JS/CSS libraries into the HTML (works offline except base-map tiles).
- Seasons by calendar month: Winter: 12, 1, 2; Spring migration: 3, 4; Breeding: 5, 6, 7; Post-breeding / molt: 8, 9; Fall migration: 10, 11
- Time spent per fix = time to the bird's next fix, capped at 24 h (gaps are not counted as presence).
- Stopover = consecutive fixes all within 5 km of the first fix, lasting ≥ 3 days.
- Top-10 areas: ~10 km grid cells ranked by total weight, then picked greedily ≥ 20 km apart so each is a distinct area.
- 'Track' = one bird's continuous run within one season. 'Bird' = unique individual per study.
- Montana boundary: Natural Earth 1:50m admin-1 (±1 km at the state line).