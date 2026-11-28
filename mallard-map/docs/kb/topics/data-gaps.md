# Data gaps (ranked) — 2026-11-28

1. Mallard band → recovery lines (NABBP 1960–2026). Needs Mitch's browser download from ScienceBase; loader ready
   (`scripts/get_bbl_mallard.py`). App has an empty "Mallard band → recovery lines" layer waiting for it.
2. USGS western waterfowl GPS 2019–20 (doi:10.5066/P13E7PCP): mallard + 5 other ducks. Browser download.
3. eBird 3 km, more species, MT + neighbors (needs `EBIRDST_KEY`, run on Mitch's laptop: cloud sessions can't reach
   st-download.ebird.org).
4. Covariates for "why here?" (NWI, CDL grain, elevation, Daymet weather).

Note: Claude Code cloud sessions only reach package registries, so data gathering (Movebank, eBird, ScienceBase) must run
on Mitch's laptop (KICKOFF.md) or after the network allowlist is widened.
