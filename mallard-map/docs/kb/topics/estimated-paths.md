# Estimated mallard flight paths (MODELED) — updated 2026-11-28

Method (`scripts/build_app.py: corridors`):
1. **Areas (hubs):** each region's strongest eBird cell, then the strongest remaining cells (≥ 45 km apart), 20 in all.
   Every Montana cell joins its nearest hub. Hubs are named by nearby water/public area and town.
2. **Each week to the next** (2 weeks before the season through Jan 19): hubs that lose birds send them to hubs that
   gain, or out of state; gains without a source come in across the north border. Solved as a min-cost flow (scipy).
3. **Cost** = distance × (up to 3× for flying against 158°, the REAL mallard fall heading, S2) × (2.5× for crossing
   the Continental Divide, by county). Border points: AB/BC and SK entries; exits to Idaho (west, Lolo Pass, Lost
   Trail Pass), Wyoming (south), SD and ND (east).
4. **Shown:** a path if it is ≥ 2% of the week's movement, or ≥ 25% of a small area's change (so valleys like the
   Bitterroot appear, thin). Season view sums all weeks.

Results (shares of estimated season movement): Flathead north shore → Idaho (west) ~10%; AB/BC → Flathead ~8%;
Saskatchewan → Fort Peck dredge cuts ~7%; Fort Peck → North Dakota ~6% + ~4%; Alberta → Fresno/Havre ~4%; Bitterroot:
in from the northwest, out over Lost Trail Pass (< 1%).

Limits: sees only **net** change (real traffic is higher); eBird is relative abundance; Montana-only raster, so the
out-of-state ends are fixed border points; the Divide line is by county; **not validated** (no Montana mallard tracks).
First check: NABBP band recoveries (data-gaps #1).
