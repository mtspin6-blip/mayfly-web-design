# Estimated mallard flight paths (MODELED, steered by REAL data) — updated 2026-11-28

What the map shows: one set of season paths. Each path's width follows the selected week (how many birds the model
moves along it that week), so paths swell during migration pulses and fade when birds sit still.

Method (`scripts/build_app.py: corridors`):
1. **Areas:** 20 hubs = each region's strongest eBird cell, then the strongest remaining (≥ 45 km apart). Every Montana
   cell joins its nearest hub. Weekly hub totals are smoothed with a 3-week running mean (eBird weeks wobble).
2. **Who moves where:** each week, hubs that lose birds send them to hubs that gain, or out of state; gains with no
   source come in across the north border (AB/BC, SK). Solved as a minimum-cost flow (scipy linprog).
3. **Cost = distance × direction × Divide:**
   - Direction uses the **REAL compass spread of 147 GPS mallard migrations** (USGS ND/SD: SE 72, S 62, all other
     sectors ≤ 6). East of the Divide that spread is used as is; west of the Divide the same spread is turned to point
     SW, because band recoveries show Pacific-route prairie mallards winter in WA/OR (S15, S16).
   - Crossing the Continental Divide (by county) costs 2.5×.
4. **Check against real data:** model exits = south (WY) 43%, east/southeast (Dakotas) 31%, west/southwest (ID) 26%.
   Real fall headings near Montana: mallards SE/S (USGS), blue-winged teal mean 136° (SE; 64 legs, 24 birds, our
   analysis of S3). The model's out-of-state flow is mostly S/SE, consistent with both.

Beyond Montana (added 2026-11-28): each border entry/exit is extended with a dashed leg whose weekly width is the sum of
the flows through it. Sources: southern Alberta and SW Saskatchewan (band recoveries; Cox et al. 2023). Central Flyway
exits are projected 838 km at 158° (REAL median first-migration distance and mean heading, USGS ND/SD) and land in
Nebraska (Platte/Sandhills), Kansas, and Colorado (San Luis and Arkansas valleys). Pacific exits go to the Columbia
Basin, WA and Snake River Plain, ID (band-recovery wintering areas; Verheijen et al. 2024). Broad direction only.

Limits: eBird sees only net change (real traffic is higher); ducks migrate at night on broad fronts, so a path means
"birds move from this area toward that one", not a literal line; no Montana mallard tracks exist to validate it. First
real check: NABBP band recoveries.
