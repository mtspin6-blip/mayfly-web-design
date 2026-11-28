"""Build the data files for the v5 map app (mallard-map/app/).

Run from mallard-map/:   python scripts/build_app.py
Inputs:  data/ (see DATA_SOURCES.md)      Outputs: app/data/*  and  outputs/v5_summary.md

Evidence labels (CLAUDE.md rule 1): REAL = measured birds, DERIVED = computed from REAL, MODELED = statistical estimate.
"""
import json, math, glob, base64, datetime as dt
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA, OUT = ROOT / "data", ROOT.parent / "public" / "duck-map" / "data"
OUT.mkdir(parents=True, exist_ok=True)

SEASON = ("09-26", "01-19")        # 2026-27 MT duck season envelope (youth days -> latest zone close). Verify at fwp.mt.gov.
MAX_SPEED_KMH = 150.0
STOP_RADIUS_KM, STOP_MIN_H = 5.0, 72.0
GAP_BREAK_DAYS = 10                # don't draw a line across a gap in fixes longer than this
DISPLAY_STEP_H = 6

REGIONS = [  # name, [west, south, east, north]
    ("Statewide", [-116.1, 44.3, -104.0, 49.05]), ("Bitterroot", [-114.55, 45.65, -113.75, 46.95]),
    ("Great Falls", [-112.55, 47.15, -110.85, 47.95]), ("Flathead", [-114.65, 47.25, -113.75, 48.55]),
    ("Helena–Bozeman", [-112.4, 45.4, -110.6, 46.9]), ("Hi-Line", [-110.6, 48.0, -105.8, 49.0]),
    ("Fort Peck–NE", [-107.6, 47.4, -104.0, 49.0]), ("Billings–Yellowstone", [-109.3, 45.0, -107.2, 46.5]),
    ("SW Montana", [-113.4, 44.4, -111.2, 45.9]), ("MT + neighbors", [-117.5, 42.0, -96.5, 54.5]),
    ("Whole flyway", [-115, 15, -75, 56])]
# Approximate center points, not boundaries. Freezeout, Canyon Ferry, Warm Springs are state WMAs.
REFUGES = [
    ("Freezeout Lake WMA", 47.67, -112.02), ("Benton Lake NWR", 47.67, -111.33), ("Bowdoin NWR", 48.40, -107.66),
    ("Medicine Lake NWR", 48.47, -104.40), ("Red Rock Lakes NWR", 44.62, -111.75), ("Lee Metcalf NWR", 46.56, -114.08),
    ("Ninepipe NWR", 47.43, -114.10), ("Pablo NWR", 47.62, -114.10), ("Charles M. Russell NWR", 47.63, -107.20),
    ("UL Bend NWR", 47.58, -107.85), ("Lake Mason NWR", 46.57, -108.62), ("Hailstone NWR", 45.93, -109.20),
    ("Swan River NWR", 47.93, -113.88), ("Lost Trail NWR", 48.03, -114.58), ("Canyon Ferry WMA", 46.45, -111.55),
    ("Warm Springs Ponds WMA", 46.18, -112.78)]
TOWNS = [("Billings", 45.783, -108.500), ("Missoula", 46.872, -113.994), ("Great Falls", 47.506, -111.300),
         ("Bozeman", 45.677, -111.043), ("Butte", 46.004, -112.535), ("Helena", 46.589, -112.039),
         ("Kalispell", 48.196, -114.313), ("Havre", 48.550, -109.684), ("Miles City", 46.408, -105.840),
         ("Lewistown", 47.062, -109.428), ("Glasgow", 48.197, -106.637), ("Sidney", 47.717, -104.156),
         ("Glendive", 47.105, -104.712), ("Malta", 48.360, -107.872), ("Wolf Point", 48.091, -105.641),
         ("Choteau", 47.813, -112.184), ("Shelby", 48.505, -111.857), ("Dillon", 45.216, -112.638),
         ("Livingston", 45.662, -110.561), ("Hamilton", 46.247, -114.160), ("Polson", 47.693, -114.163),
         ("Cut Bank", 48.633, -112.326), ("Plentywood", 48.775, -104.563), ("Hardin", 45.732, -107.612),
         ("Roundup", 46.445, -108.542), ("Conrad", 48.170, -111.946), ("Fort Benton", 47.818, -110.668)]
US_ABBR = {"Montana": "MT", "North Dakota": "ND", "South Dakota": "SD", "Wyoming": "WY", "Idaho": "ID",
           "Nebraska": "NE", "Kansas": "KS", "Oklahoma": "OK", "Texas": "TX", "Louisiana": "LA", "Arkansas": "AR",
           "Missouri": "MO", "Iowa": "IA", "Minnesota": "MN", "Colorado": "CO", "New Mexico": "NM", "Mississippi": "MS",
           "Alabama": "AL", "Florida": "FL", "Georgia": "GA", "Tennessee": "TN", "Kentucky": "KY", "Illinois": "IL",
           "Wisconsin": "WI", "Indiana": "IN", "Ohio": "OH", "Michigan": "MI", "South Carolina": "SC",
           "North Carolina": "NC", "Utah": "UT", "Arizona": "AZ", "Nevada": "NV", "California": "CA",
           "Oregon": "OR", "Washington": "WA"}
LOG = []


def log(m):
    print(m); LOG.append(m)


def hav(la1, lo1, la2, lo2):
    la1, lo1, la2, lo2 = map(np.radians, (la1, lo1, la2, lo2))
    a = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))


def in_season(ts):
    md = ts.strftime("%m-%d")
    return (md >= SEASON[0]) | (md <= SEASON[1])


def week_idx(ts):  # nearest eBird S&T week (weeks centred on Jan 4, 11, ...)
    return np.clip(np.round((ts.dt.dayofyear - 4) / 7), 0, 51).astype(int)


def nearest_refuge(lat, lon):
    d = [(float(hav(lat, lon, la, lo)), n) for n, la, lo in REFUGES]
    km, n = min(d)
    return n, round(km)


# ----------------------------------------------------------------------------- regions (state / province labels)
def region_lookup():
    import geopandas as gpd
    st = gpd.read_file(DATA / "reference" / "us_states.geojson")
    ct = gpd.read_file(DATA / "reference" / "countries.geojson")
    mt = gpd.read_file(DATA / "reference" / "mt.geojson")

    def lookup(lat, lon):
        pts = gpd.GeoDataFrame(geometry=gpd.points_from_xy(lon, lat), crs=4326)
        out = np.array(["?"] * len(pts), dtype=object)
        s = gpd.sjoin(pts, st[["name", "geometry"]], how="left", predicate="within")
        s = s[~s.index.duplicated()]
        out[s.name.notna().values] = s.name[s.name.notna()].map(lambda n: US_ABBR.get(n, n)).values
        c = gpd.sjoin(pts, ct[["name", "geometry"]], how="left", predicate="within")
        c = c[~c.index.duplicated()]
        rest = (out == "?") & c.name.notna().values
        out[rest] = c.name.values[rest]
        can = out == "Canada"
        out[can] = np.where(lon[can] < -110, "AB", np.where(lon[can] < -101.4, "SK", np.where(lon[can] < -95, "MB", "ON")))
        # US-Canada border at 49 N: fixes just over the line that miss both polygons (coarse coastlines / lakes)
        miss = out == "?"
        out[miss] = np.where(lat[miss] >= 49, "Canada", "water/coast")
        inmt = gpd.sjoin(pts, mt, how="left", predicate="within").index_right.notna().groupby(level=0).first().values
        out[inmt] = "MT"
        return out
    return lookup


# ----------------------------------------------------------------------------- REAL tracks: blue-winged teal (Argos)
def load_teal(lookup):
    p = DATA / "movebank_other" / "blueWingedTeal_USGS_ASC_argos.csv"
    d = pd.read_csv(p)
    d = d.rename(columns={"individual_local_identifier": "bird", "location_lat": "lat", "location_long": "lon"})
    d["t"] = pd.to_datetime(d.timestamp, utc=True)
    n0 = len(d)
    d = d.dropna(subset=["t", "lat", "lon"]).drop_duplicates(["bird", "t"]).sort_values(["bird", "t"]).reset_index(drop=True)
    keep = np.ones(len(d), bool)
    for _, idx in d.groupby("bird").indices.items():
        if len(idx) < 3:
            continue
        la, lo = d.lat.values[idx], d.lon.values[idx]
        th = d.t.values[idx].astype("datetime64[s]").astype(float) / 3600
        v = hav(la[:-1], lo[:-1], la[1:], lo[1:]) / np.maximum(np.diff(th), 1 / 60)
        spike = np.zeros(len(idx), bool)
        spike[1:-1] = (v[:-1] > MAX_SPEED_KMH) & (v[1:] > MAX_SPEED_KMH)
        keep[idx[spike]] = False
    d = d[keep].reset_index(drop=True)
    d["region"] = lookup(d.lat.values, d.lon.values)
    log(f"Teal (REAL, Argos): {n0:,} fixes -> {len(d):,} after removing invalid/duplicate fixes and speed spikes "
        f"(>{MAX_SPEED_KMH:.0f} km/h in and out); {d.bird.nunique()} birds.")
    return d


def tag_site(g):  # where the first fix is (tagging site), from the data itself
    r = g.region.iat[0]
    return f"{r} ({g.t.iat[0].strftime('%b %Y')})"


def tracks(d):
    full = d
    # display: <= 1 fix per 6 h per bird
    d = d.copy()
    d["slot"] = d.t.dt.floor(f"{DISPLAY_STEP_H}h")
    v = d.drop_duplicates(["bird", "slot"]).reset_index(drop=True)
    v["wk"] = week_idx(v.t)
    v["s"] = in_season(v.t.dt).astype(int)
    feats, birds = [], []
    for bird, g in v.groupby("bird"):
        g = g.sort_values("t").reset_index(drop=True)
        la, lo = g.lat.values, g.lon.values
        step = np.r_[0, hav(la[:-1], lo[:-1], la[1:], lo[1:])]
        gap = np.r_[0, np.diff(g.t.values).astype("timedelta64[h]").astype(float) / 24] > GAP_BREAK_DAYS
        step[gap] = 0
        # segment = one bird, one calendar week (+ the first fix of the next week so lines join)
        key = (g.t.dt.isocalendar().year.astype(str) + "-" + g.t.dt.isocalendar().week.astype(str)).values
        brk = np.r_[True, key[1:] != key[:-1]] | gap
        sid = np.cumsum(brk)
        for s_ in np.unique(sid):
            ix = np.where(sid == s_)[0]
            nxt = ix[-1] + 1
            if nxt < len(g) and not gap[nxt]:
                ix = np.r_[ix, nxt]
            if len(ix) < 2:
                continue
            km = float(step[ix[1:]].sum())
            if km < 0.5:
                continue
            feats.append({"type": "Feature", "geometry": {"type": "LineString",
                          "coordinates": [[round(float(lo[i]), 4), round(float(la[i]), 4)] for i in ix]},
                          "properties": {"b": bird, "wk": int(g.wk.iat[ix[0]]), "s": int(g.s.iat[ix[0]]),
                                         "d0": g.t.iat[ix[0]].strftime("%Y-%m-%d"), "d1": g.t.iat[ix[-1]].strftime("%Y-%m-%d"),
                                         "km": round(km), "r": g.region.iat[ix[-1]]}})
        regs = list(dict.fromkeys(g.region))
        south = g.loc[g.lat.idxmin()]
        birds.append({"id": bird, "sp": "Blue-winged teal", "tag": tag_site(g),
                      "first": g.t.iat[0].strftime("%Y-%m-%d"), "last": g.t.iat[-1].strftime("%Y-%m-%d"),
                      "km": int(step.sum()), "fixes": int(len(g)), "regions": regs,
                      "south": f"{south.region} ({south.lat:.1f}°N)", "mtFixes": int((full.region[full.bird == bird] == "MT").sum()),
                      "start": [round(float(lo[0]), 3), round(float(la[0]), 3)],
                      "end": [round(float(lo[-1]), 3), round(float(la[-1]), 3)]})
    log(f"Teal display lines: {len(feats):,} bird-week segments from {len(v):,} fixes (<= 1 per {DISPLAY_STEP_H} h). "
        f"Lines are broken across gaps > {GAP_BREAK_DAYS} days.")
    return feats, birds


def stopovers(d):
    rows = []
    for bird, g in d.sort_values("t").groupby("bird"):
        la, lo = g.lat.values, g.lon.values
        th = g.t.values.astype("datetime64[s]").astype(float) / 3600
        i, n = 0, len(g)
        while i < n:
            j = i
            while j + 1 < n and hav(la[i], lo[i], la[j + 1], lo[j + 1]) <= STOP_RADIUS_KM:
                j += 1
            if th[j] - th[i] >= STOP_MIN_H:
                lat, lon = float(la[i:j + 1].mean()), float(lo[i:j + 1].mean())
                t0, t1 = g.t.iat[i], g.t.iat[j]
                rows.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
                             "properties": {"b": bird, "days": round((th[j] - th[i]) / 24, 1),
                                            "d0": t0.strftime("%Y-%m-%d"), "d1": t1.strftime("%Y-%m-%d"),
                                            "wk": int(np.clip(round((t0.dayofyear - 4) / 7), 0, 51)),
                                            "wk1": int(np.clip(round((t1.dayofyear - 4) / 7), 0, 51)),
                                            "s": int(in_season(pd.Series([t0]).dt).iat[0]), "r": g.region.iat[i]}})
                i = j + 1
            else:
                i += 1
    log(f"Teal stopovers (DERIVED): {len(rows)} stays of >= {STOP_MIN_H/24:.0f} days within {STOP_RADIUS_KM:.0f} km. "
        "Argos error can be 0.25 to >10 km, so these are approximate.")
    return rows


# ----------------------------------------------------------------------------- MODELED: eBird S&T mallard
def ebird():
    import rasterio, geopandas as gpd
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.features import geometry_mask
    tifs = sorted(glob.glob(str(DATA / "ebird" / "*.tif")))
    if not tifs:
        log("eBird raster missing (data/ebird/*.tif is not in git; run scripts/get_ebird_mallard.py). Keeping existing app/data/ebird.*")
        return None
    with rasterio.open(tifs[0]) as src:
        data = src.read().astype("float32")
        names = [s or f"w{i}" for i, s in enumerate(src.descriptions)]
        dst = "EPSG:3857"
        tr, w, h = calculate_default_transform(src.crs, dst, src.width, src.height, *src.bounds)
        out = np.full((data.shape[0], h, w), np.nan, "float32")
        for i in range(data.shape[0]):
            reproject(data[i], out[i], src_transform=src.transform, src_crs=src.crs, dst_transform=tr, dst_crs=dst,
                      resampling=Resampling.nearest, src_nodata=np.nan, dst_nodata=np.nan)
    mt = gpd.read_file(DATA / "reference" / "mt.geojson").to_crs(3857).geometry.iloc[0]
    out[:, geometry_mask([mt], out_shape=(h, w), transform=tr)] = np.nan
    left, bottom, right, top = rasterio.transform.array_bounds(h, w, tr)
    ll = gpd.GeoSeries(gpd.points_from_xy([left, right], [bottom, top]), crs=3857).to_crs(4326)
    bounds = [round(ll.iloc[0].x, 5), round(ll.iloc[0].y, 5), round(ll.iloc[1].x, 5), round(ll.iloc[1].y, 5)]
    vmax = float(np.nanpercentile(out[out > 0], 99.5))
    # quantize: 0 = no data / outside MT, 1 = zero, 2..255 = log scale up to vmax
    q = np.zeros(out.shape, np.uint8)
    fin = np.isfinite(out)
    q[fin] = 1
    pos = fin & (out > 0)
    q[pos] = (2 + np.clip(np.log1p(out[pos]) / np.log1p(vmax), 0, 1) * 253).round().astype(np.uint8)
    (OUT / "ebird.bin").write_bytes(q.tobytes())
    season_ix = [i for i, n in enumerate(names) if n[5:] >= SEASON[0] or n[5:] <= SEASON[1]]
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore", RuntimeWarning)
        mean_season = np.nanmean(out[season_ix], axis=0)
    meta = {"w": w, "h": h, "weeks": names, "bounds": bounds, "vmax": vmax, "seasonWeeks": season_ix,
            "citation": (DATA / "ebird" / "citation.txt").read_text().strip()}
    (OUT / "ebird.json").write_text(json.dumps(meta))
    log(f"eBird S&T mallard (MODELED): {len(names)} weeks, ~9 km cells, reprojected to Web Mercator ({w}x{h}), clipped to "
        f"Montana; values stored log-scaled to 1 byte (max {vmax:.3g} = 99.5th percentile).")

    # hot spots: greedy distinct cells (>= 20 km apart) by duck-season mean
    rows, cols = np.where(np.isfinite(mean_season) & (mean_season > 0))
    xs, ys = rasterio.transform.xy(tr, rows, cols)
    pts = gpd.GeoSeries(gpd.points_from_xy(xs, ys), crs=3857).to_crs(4326)
    cells = pd.DataFrame({"lat": pts.y.values, "lon": pts.x.values, "v": mean_season[rows, cols], "r": rows, "c": cols})
    cells = cells.sort_values("v", ascending=False).reset_index(drop=True)
    spots = []
    for reg, (w_, s_, e_, n_) in REGIONS[:9]:
        sub = cells[cells.lon.between(w_, e_) & cells.lat.between(s_, n_)]
        picked = []
        for _, r in sub.iterrows():
            if all(hav(r.lat, r.lon, p.lat, p.lon) > 20 for p in picked):
                picked.append(r)
            if len(picked) == (10 if reg == "Statewide" else 5):
                break
        for rank, r in enumerate(picked, 1):
            ref, km = nearest_refuge(r.lat, r.lon)
            curve = out[:, int(r.r), int(r.c)]
            peak = int(np.nanargmax(curve))
            spots.append({"region": reg, "rank": rank, "lat": round(r.lat, 4), "lon": round(r.lon, 4),
                          "v": round(float(r.v), 2), "peakWeek": names[peak], "refuge": ref, "refugeKm": km})
    (OUT / "hotspots.json").write_text(json.dumps(spots))
    log(f"Hot spots (MODELED): {len(spots)} cells (top 10 statewide, top 5 per region), ranked by mean eBird relative "
        f"abundance {SEASON[0]} to {SEASON[1]}, >= 20 km apart. This is a proxy for where birds are, not time spent.")
    corridors(out, tr, names)
    return spots


# ----------------------------------------------------------------------------- MODELED: estimated mallard flight paths
FALL_BEARING = 158.0   # REAL prior: mean heading of first fall migration, USGS ND/SD mallards (usgs.json)
BORDER = [  # name, lat, lon, kind  (entry = birds arriving from outside MT, exit = leaving MT)
    ("Alberta (north)", 49.0, -113.5, "entry"), ("Alberta (north)", 49.0, -111.0, "entry"),
    ("Saskatchewan (north)", 49.0, -108.0, "entry"), ("Saskatchewan (north)", 49.0, -105.0, "entry"),
    ("Idaho (west)", 47.3, -115.6, "exit"), ("Idaho (southwest)", 44.6, -112.6, "exit"),
    ("Wyoming (south)", 45.0, -110.0, "exit"), ("Wyoming (south)", 45.0, -107.0, "exit"),
    ("South Dakota (southeast)", 45.4, -104.05, "exit"), ("North Dakota (east)", 47.3, -104.05, "exit"),
    ("North Dakota (east)", 48.6, -104.05, "exit")]


def bearing(la1, lo1, la2, lo2):
    la1, lo1, la2, lo2 = map(math.radians, (la1, lo1, la2, lo2))
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def arc(a, b, n=18, bend=0.18):
    """Gentle curve from a to b (lon, lat) so two-way flows don't overlap."""
    (x0, y0), (x1, y1) = a, b
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    cx, cy = mx - (y1 - y0) * bend, my + (x1 - x0) * bend
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append([round((1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, 4),
                    round((1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1, 4)])
    return pts


def place_name(lat, lon):
    cands = [(float(hav(lat, lon, la, lo)), n) for n, la, lo in TOWNS + REFUGES]
    km, n = min(cands)
    return n if km < 15 else f"{round(km * 0.621)} mi from {n}"


def corridors(out, tr, names):
    """Week-to-week mallard movement between areas, estimated from eBird abundance change (MODELED).

    1. Hubs: the 16 highest duck-season cells, >= 45 km apart; every Montana cell joins its nearest hub.
    2. For each pair of weeks, a hub that loses birds sends them to hubs that gain birds, or out of the state;
       hubs that gain more than others lose get birds from the north border.
    3. Routing = cheapest total distance, with moves against the real mallard fall heading (SSE, from USGS
       tracked birds) made up to 3x more expensive. Only net change is visible, so real traffic is higher.
    """
    import rasterio
    from scipy.optimize import linprog
    import geopandas as gpd
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore", RuntimeWarning)
        season_ix = [i for i, n in enumerate(names) if n[5:] >= SEASON[0] or n[5:] <= SEASON[1]]
        mean = np.nanmean(out[season_ix], axis=0)
    rows, cols = np.where(np.isfinite(mean))
    xs, ys = rasterio.transform.xy(tr, rows, cols)
    pts = gpd.GeoSeries(gpd.points_from_xy(xs, ys), crs=3857).to_crs(4326)
    lat, lon = pts.y.values, pts.x.values
    order = np.argsort(-np.nan_to_num(mean[rows, cols]))
    hubs = []
    for k in order:
        if all(hav(lat[k], lon[k], h[0], h[1]) > 45 for h in hubs):
            hubs.append((float(lat[k]), float(lon[k])))
        if len(hubs) == 16:
            break
    H = np.array(hubs)
    member = np.argmin(np.stack([hav(lat, lon, h[0], h[1]) for h in hubs]), axis=0)
    # sequence of weeks: two weeks before the season through the end of the season
    first = season_ix.index(min(i for i in season_ix if names[i][5:] >= SEASON[0]))
    seq = season_ix[first:] + season_ix[:first]
    seq = [(seq[0] - 2) % 52, (seq[0] - 1) % 52] + seq
    totals = {w: np.array([np.nansum(out[w][rows[member == h], cols[member == h]]) for h in range(len(hubs))]) for w in seq}
    hub_names = [place_name(a, b) for a, b in hubs]
    nodes = [(n, a, b, "hub") for n, (a, b) in zip(hub_names, hubs)] + list(BORDER)

    def cost(i, j):
        _, la1, lo1, _ = nodes[i]; _, la2, lo2, _ = nodes[j]
        d = float(hav(la1, lo1, la2, lo2))
        off = math.cos(math.radians(bearing(la1, lo1, la2, lo2) - FALL_BEARING))
        return d * (1 + max(0.0, -off) * 2) + 1.0

    feats, season = [], {}
    nh = len(hubs)
    for w0, w1 in zip(seq[:-1], seq[1:]):
        delta = totals[w1] - totals[w0]
        losers = [i for i in range(nh) if delta[i] < 0]
        gainers = [j for j in range(nh) if delta[j] > 0]
        src = losers + [k for k in range(nh, len(nodes)) if nodes[k][3] == "entry"]
        dst = gainers + [k for k in range(nh, len(nodes)) if nodes[k][3] == "exit"]
        var = [(i, j) for i in src for j in dst if not (i >= nh and j >= nh)]
        c = [cost(i, j) for i, j in var]
        A, b_ = [], []
        for i in losers:
            A.append([1.0 if v[0] == i else 0.0 for v in var]); b_.append(-delta[i])
        for j in gainers:
            A.append([1.0 if v[1] == j else 0.0 for v in var]); b_.append(delta[j])
        r = linprog(c, A_eq=A, b_eq=b_, bounds=(0, None), method="highs")
        if not r.success:
            log(f"corridor LP failed for week {names[w1]}: {r.message}")
            continue
        tot = r.x.sum()
        for (i, j), f in zip(var, r.x):
            if f <= 0 or f / tot < 0.04:
                continue
            ni, nj = nodes[i], nodes[j]
            kind = "entry" if i >= nh else "exit" if j >= nh else "move"
            feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": arc((ni[2], ni[1]), (nj[2], nj[1]))},
                          "properties": {"wk": int(w1), "from": ni[0], "to": nj[0], "kind": kind,
                                         "share": round(float(f / tot), 3), "f": float(f),
                                         "km": round(float(hav(ni[1], ni[2], nj[1], nj[2])))}})
            key = (i, j)
            season[key] = season.get(key, 0) + float(f)
    fmax = max(x["properties"]["f"] for x in feats)
    for x in feats:
        x["properties"]["rel"] = round(x["properties"].pop("f") / fmax, 3)
    smax, stot = max(season.values()), sum(season.values())
    sfeats = []
    for (i, j), f in sorted(season.items(), key=lambda kv: kv[1]):
        if f / stot < 0.008:
            continue
        ni, nj = nodes[i], nodes[j]
        sfeats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": arc((ni[2], ni[1]), (nj[2], nj[1]))},
                       "properties": {"from": ni[0], "to": nj[0], "kind": "entry" if i >= nh else "exit" if j >= nh else "move",
                                      "share": round(f / stot, 3), "rel": round(f / smax, 3),
                                      "km": round(float(hav(ni[1], ni[2], nj[1], nj[2])))}})
    (OUT / "corridors_week.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    (OUT / "corridors_season.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": sfeats}, separators=(",", ":")))
    (OUT / "corridor_hubs.json").write_text(json.dumps([{"name": n, "lat": round(a, 4), "lon": round(b, 4)} for n, (a, b) in zip(hub_names, hubs)]))
    log(f"Estimated mallard flight paths (MODELED): {len(hubs)} areas + {len(BORDER)} border points, {len(seq) - 1} week-to-week "
        f"steps, {len(feats)} weekly paths, {len(sfeats)} season paths. Method: eBird weekly abundance change routed by "
        f"least distance with a {FALL_BEARING:.0f} deg (SSE) heading preference from USGS tracked mallards. Not observed flights.")


# ----------------------------------------------------------------------------- REAL summary: USGS 2018-2020 mallards
def usgs():
    d = pd.read_csv(DATA / "usgs" / "MALL_dist_dir.csv")
    mig, reg = d[d.Move_type == "M"], d[d.Move_type == "R"]
    first = mig[mig.First_M == 1]
    b = first.Bearing.values
    rose = np.histogram((b + 22.5) % 360, bins=8, range=(0, 360))[0].tolist()
    mean_b = (math.degrees(math.atan2(np.sin(np.radians(b)).mean(), np.cos(np.radians(b)).mean())) + 360) % 360
    info = {"birds": int(d.Device_id.nunique()), "moves": int(len(d)), "mig": int(len(mig)), "reg": int(len(reg)),
            "migMedKm": round(float(mig.Move_d.median())), "regMedKm": round(float(reg.Move_d.median())),
            "firstMedKm": round(float(first.Move_d.median())), "firstN": int(len(first)),
            "firstBearing": round(mean_b), "rose": rose,
            "citation": "Pearse, A.T., Szymanski, M., Anchor, C.E., Murano, R., and Stafford, J.D., 2023, Mallard migration "
                        "and regional movement timing, distance, and direction data, 2018-2020: U.S. Geological Survey data "
                        "release, https://doi.org/10.5066/P9GSUQUU. CC0."}
    (OUT / "usgs.json").write_text(json.dumps(info))
    log(f"USGS mallards (REAL, summary only, ND/SD juveniles): {info['birds']} birds, {info['moves']} moves; "
        f"first migration median {info['firstMedKm']} km heading ~{info['firstBearing']} deg.")
    return info


def reference():
    def pts(rows, kind):
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lo, la]}, "properties": {"name": n, "k": kind}}
            for n, la, lo in rows]}
    ref = DATA / "reference"
    bundle = {"mt": json.loads((ref / "mt.geojson").read_text()), "rivers": json.loads((ref / "rivers.geojson").read_text()),
              "lakes": json.loads((ref / "lakes.geojson").read_text()), "refuges": pts(REFUGES, "refuge"),
              "towns": pts(TOWNS, "town"), "regions": [{"name": n, "bbox": b} for n, b in REGIONS], "season": SEASON}
    (OUT / "reference.json").write_text(json.dumps(bundle, separators=(",", ":")))


def main():
    lookup = region_lookup()
    teal = load_teal(lookup)
    feats, birds = tracks(teal)
    stops = stopovers(teal)
    (OUT / "tracks.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    (OUT / "stops.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": stops}, separators=(",", ":")))
    (OUT / "birds.json").write_text(json.dumps(birds, separators=(",", ":")))
    spots = ebird()
    u = usgs()
    reference()
    mt_birds = [b for b in birds if b["mtFixes"]]
    summ = {"built": dt.date.today().isoformat(), "tealBirds": len(birds), "tealFixes": int(len(teal)),
            "tealMtBirds": len(mt_birds), "tealMtFixes": int(sum(b["mtFixes"] for b in birds)),
            "tealSegments": len(feats), "tealStops": len(stops),
            "tealStopsMt": sum(1 for s in stops if s["properties"]["r"] == "MT"),
            "mallardGpsBirds": 0, "bblPairs": 0, "log": LOG}
    (OUT / "summary.json").write_text(json.dumps(summ, indent=1))
    md = ["# v5 app build summary", "", f"Built {summ['built']} by `scripts/build_app.py`.", "",
          "| Layer | Evidence | Total | In Montana |", "|---|---|---|---|",
          f"| Mallard GPS tracks | REAL | 0 birds | 0 (no public data yet) |",
          f"| Mallard band → recovery lines | REAL | 0 (NABBP not downloaded yet) | 0 |",
          f"| Blue-winged teal Argos tracks (NOT mallard) | REAL | {len(birds)} birds, {len(teal):,} fixes | {len(mt_birds)} birds, {summ['tealMtFixes']} fixes |",
          f"| Teal stopovers ≥3 days | DERIVED | {len(stops)} | {summ['tealStopsMt']} |",
          f"| Mallard hot spots | MODELED (eBird) | {len(spots or [])} (10 statewide + 5 per region) | all |",
          f"| USGS ND/SD mallard movements | REAL summary | {u['birds']} birds / {u['moves']} moves | 0 (no coordinates) |",
          "", "## Processing log", ""] + [f"- {m}" for m in LOG]
    (ROOT / "outputs" / "v5_summary.md").write_text("\n".join(md) + "\n")


if __name__ == "__main__":
    main()
