# v5 app build summary

Built 2026-11-28 by `scripts/build_app.py`.

| Layer | Evidence | Total | In Montana |
|---|---|---|---|
| Mallard GPS tracks | REAL | 0 birds | 0 (no public data yet) |
| Mallard band → recovery lines | REAL | 0 (NABBP not downloaded yet) | 0 |
| Blue-winged teal Argos tracks (NOT mallard) | REAL | 42 birds, 33,532 fixes | 3 birds, 59 fixes |
| Teal stopovers ≥3 days | DERIVED | 470 | 1 |
| Mallard hot spots | MODELED (eBird) | 49 (10 statewide + 5 per region) | all |
| USGS ND/SD mallard movements | REAL summary | 97 birds / 562 moves | 0 (no coordinates) |

## Processing log

- Teal (REAL, Argos): 33,583 fixes -> 33,532 after removing invalid/duplicate fixes and speed spikes (>150 km/h in and out); 42 birds.
- Teal display lines: 1,109 bird-week segments from 7,476 fixes (<= 1 per 6 h). Lines are broken across gaps > 10 days.
- Teal stopovers (DERIVED): 470 stays of >= 3 days within 5 km. Argos error can be 0.25 to >10 km, so these are approximate.
- eBird S&T mallard (MODELED): 52 weeks, ~9 km cells, reprojected to Web Mercator (162x60), clipped to Montana; values stored log-scaled to 1 byte (max 53.3 = 99.5th percentile).
- Hot spots (MODELED): 49 cells (top 10 statewide, top 5 per region), ranked by mean eBird relative abundance 09-26 to 01-19, >= 20 km apart, cells < 1.0 dropped. Strength tier vs all MT cells: High = top 2% (>= 38.2), Medium = top 10% (>= 12.6), Low = rest. This is a proxy for where birds are, not time spent.
- Regional timing (MODELED): 8 regions classified early / all / late season from eBird weekly totals.
- Weekly spots (MODELED): 69 distinct spots >= 20 km apart, ranked per week in the app; 0 repeated labels.
- Beyond Montana: 11 flyway legs (sources AB/SK; Central destinations at the REAL median first-migration distance 838 km and heading 158 deg; Pacific destinations from band-recovery wintering areas).
- Model check, share of birds leaving Montana by direction: south (Wyoming) 43%, east/southeast (Dakotas) 31%, west/southwest (Idaho) 26%. Real fall headings near Montana: USGS mallards SE 72 / S 62 of 147; teal mean 136 deg (SE).
- Estimated mallard flight paths (MODELED): 20 areas + 14 border points, 18 week-to-week steps, 74 paths, each with a weekly strength. Method: eBird weekly abundance change (3-week smoothed) routed by least distance, weighted by the REAL compass spread of tracked mallard migrations. Not observed flights.
- USGS mallards (REAL, summary only, ND/SD juveniles): 97 birds, 562 moves; first migration median 838 km heading ~158 deg.
