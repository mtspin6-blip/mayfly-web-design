# v5 app build summary

Built 2026-11-28 by `scripts/build_app.py`.

| Layer | Evidence | Total | In Montana |
|---|---|---|---|
| Mallard GPS tracks | REAL | 0 birds | 0 (no public data yet) |
| Mallard band → recovery lines | REAL | 0 (NABBP not downloaded yet) | 0 |
| Blue-winged teal Argos tracks (NOT mallard) | REAL | 42 birds, 33,532 fixes | 3 birds, 59 fixes |
| Teal stopovers ≥3 days | DERIVED | 470 | 1 |
| Mallard hot spots | MODELED (eBird) | 50 (10 statewide + 5 per region) | all |
| USGS ND/SD mallard movements | REAL summary | 97 birds / 562 moves | 0 (no coordinates) |

## Processing log

- Teal (REAL, Argos): 33,583 fixes -> 33,532 after removing invalid/duplicate fixes and speed spikes (>150 km/h in and out); 42 birds.
- Teal display lines: 1,109 bird-week segments from 7,476 fixes (<= 1 per 6 h). Lines are broken across gaps > 10 days.
- Teal stopovers (DERIVED): 470 stays of >= 3 days within 5 km. Argos error can be 0.25 to >10 km, so these are approximate.
- eBird S&T mallard (MODELED): 52 weeks, ~9 km cells, reprojected to Web Mercator (162x60), clipped to Montana; values stored log-scaled to 1 byte (max 53.3 = 99.5th percentile).
- Hot spots (MODELED): 50 cells (top 10 statewide, top 5 per region), ranked by mean eBird relative abundance 09-26 to 01-19, >= 20 km apart. This is a proxy for where birds are, not time spent.
- Estimated mallard flight paths (MODELED): 16 areas + 11 border points, 18 week-to-week steps, 140 weekly paths, 29 season paths. Method: eBird weekly abundance change routed by least distance with a 158 deg (SSE) heading preference from USGS tracked mallards. Not observed flights.
- USGS mallards (REAL, summary only, ND/SD juveniles): 97 birds, 562 moves; first migration median 838 km heading ~158 deg.
