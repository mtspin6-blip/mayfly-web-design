# Data sources: status as of 2026-11-27

## Priority list for REAL flight-path lines (no emails needed)
| # | Dataset | Why it matters | How to get it |
|---|---|---|---|
| 1 | **USGS: GPS-marked waterfowl and harrier locations, Jan 2019 – Aug 2020, western North America** (doi:10.5066/P13E7PCP; file `BirdLocations_COVID_response_effects.csv`; columns location_lat, location_long, timestamp, individual_taxon_canonical_name, individual_local_identifier) | **Includes mallard, northern pintail, American wigeon, northern shoveler, cinnamon teal, gadwall** GPS tracks from birds marked in CA/OR; extent reaches 70.7° N, so spring/fall migrants likely cross ID/MT/AB/SK. Best lead for real duck lines over Montana. | On ScienceBase (bot check blocks scripts). Mitch clicks Download in a browser, or Claude in Chrome on his laptop does the click. Metadata (works by script): https://data.usgs.gov/datacatalog/metadata/USGS.675a0bd3d34edfeb8710a8ff.xml |
| 2 | **NABBP banding 1960–2026** (Nakash et al. 2026, doi:10.5066/P1CCONUX) | Real mallard start → end lines for birds banded or shot in MT | ScienceBase item 6aa98c981ba49b8cd545a29f, browser download: `README_before_download_2026.txt` (find Mallard 1320's group), that group zip, `NABBP_lookups_2026.zip` → `data/bbl/raw/` → `python scripts/get_bbl_mallard.py`. Columns verified; recaptures excluded via RECORD_SOURCE = R. Gamebird bandings released at 1° blocks. CC0. |
| 3 | Other USGS WERC / Alaska Science Center / NPWRC duck tracking releases | more tracks | search data.usgs.gov catalog for "GPS" + duck species; e.g., Overton & Casazza 2023 Central Valley step data (local only, low value for MT) |
| 4 | Movebank public studies | | 172 open studies today; no N. American mallards. Re-check with `scripts/get_movebank_public.py`. Movebank "request access" buttons are optional (Mitch's choice) |
| 5 | Dryad / Zenodo / GBIF duck telemetry | | search "Anas platyrhynchos GPS", "mallard telemetry", "Mareca", "Spatula" |

## Already in this package
| Source | Type | Notes |
|---|---|---|
| Blue-winged teal, USGS ASC (Ramey et al. 2019, doi:10.5066/P9Z9BA9F; Movebank 446107870) | REAL, Argos | `data/movebank_other/`: 42 birds tagged SK/AB 2013, TX/LA 2015; 3 had fixes in MT. Argos error 0.25 to >10 km. Public. |
| eBird S&T mallard v2025, weekly median 9 km, MT crop | MODELED | `scripts/get_ebird_mallard.py` + `EBIRDST_KEY`. Next: 3 km, all species, MT + neighbors. v2025 citation DOI not yet confirmed. Non-commercial, attribution. |
| USGS mallard movements 2018–2020 (Pearse et al. 2023, doi:10.5066/P9GSUQUU) | REAL, summary only | 97 ND/SD juveniles; distance and bearing only, no coordinates; extent starts 103.4° W. Raw GPS is not public (needs an email, which is out of scope). |
| Northern pintail, USGS ASC (Movebank 927024278) | REAL | checked: 0 fixes in MT/ND/SD/AB/SK/ID; not used |
| Natural Earth, NWI WMS, Esri topo/hillshade tiles | Reference | |

## Known issues
- v4 hosting: Claude artifact pages block remote map tiles, so deploy elsewhere (see SPEC §2).
- NWI WMS may draw a faint rectangle at region zoom. Download the MT NWI state GDB for a clean vector layer instead.
