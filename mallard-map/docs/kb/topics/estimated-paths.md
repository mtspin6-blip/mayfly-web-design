# Estimated mallard flight paths (MODELED) — 2026-11-28

Method (`scripts/build_app.py: corridors`): 16 hub areas around top eBird S&T season cells (>= 45 km apart); each week,
net abundance loss/gain per hub is matched by a min-cost flow (scipy linprog). Cost = distance, x up to 3 for headings
against 158 deg (REAL mean first-fall-migration heading, USGS ND/SD mallards). Unmatched gains enter from the north
border (AB/SK); unmatched losses exit (ID west/SW, WY south, ND/SD east). Flows < 4% of a week are dropped.

Season result (shares of estimated movement): Flathead/Swan River -> Idaho (west) ~12%; Saskatchewan -> Glasgow / Fort
Peck ~8%; Alberta -> Flathead ~8%; Fort Peck/Glasgow -> North Dakota (east) ~7%; Alberta -> Havre ~5%; Bighorn/Hardin
-> Wyoming ~4%.

Limits: sees only net change (real traffic higher); eBird is relative abundance; MT-only raster so out-of-state ends are
fixed border points; not validated (no Montana mallard tracks). First check: NABBP band recoveries.
