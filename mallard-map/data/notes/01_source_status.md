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
