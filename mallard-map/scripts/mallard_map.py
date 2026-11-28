#!/usr/bin/env python3
"""
Mallard (Anas platyrhynchos) movement map for Montana
=====================================================

Builds ONE self-contained HTML map (Leaflet via folium) from real data:

  Layer 1  REAL    GPS tracks (Movebank CSVs + USGS 2018-2020 release), colored by
                   season, residence points sized by time spent, weekly time slider
  Layer 2  REAL    Bird Banding Lab band -> recovery lines (species 1320, Montana)
  Layer 3  DERIVED Stopover / residency heatmap (bird stayed within 5 km for > 3 days)
  Layer 4  MODELED eBird Status & Trends weekly relative abundance, clipped to Montana
  Reference        Montana outline, major rivers, lakes/reservoirs, NWI wetlands (if
                   supplied), wildlife refuges / WMAs

Also writes  report.md  (counts inside Montana, top-10 areas, cleaning log) and
top10_areas.csv.

Folder layout expected (any file names; all optional except at least one dataset):

  data/movebank/*.csv          Movebank "Download data" CSVs (standard column names)
  data/movebank/studies.csv    optional: study_name,citation,license,url
  data/usgs/*.csv              USGS ScienceBase release doi:10.5066/P9GSUQUU tables
  data/bbl/*.csv               NABBP ScienceBase banding / encounter CSVs
  data/ebird/*.tif             ebirdst weekly abundance GeoTIFF (see get_ebird_mallard.R)
  data/ebird/citation.txt      optional: written by get_ebird_mallard.R
  data/nwi/*.gpkg|*.shp        optional: National Wetlands Inventory for Montana

Run:  python mallard_map.py --data data --out mallard_montana_map.html
Needs: pip install geopandas folium rasterio matplotlib scipy
"""
import argparse, base64, glob, io, json, math, os, sys, textwrap, urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point, LineString, mapping, box
import folium
from folium import plugins
from branca.element import Element

# ----------------------------------------------------------------------------- config
SPECIES_BBL = 1320
STOPOVER_RADIUS_KM = 5.0          # "small area"
STOPOVER_MIN_HOURS = 72.0         # "> 3 days"
MAX_GAP_HOURS = 24.0              # time-spent cap when a fix is followed by a long gap
MAX_SPEED_KMH = 150.0             # spike filter (mallard cruising flight ~60-90 km/h)
ANALYSIS_STEP_H = 1               # thin to <= 1 fix / hour for analysis
DISPLAY_STEP_H = 6                # thin to <= 1 fix / 6 h for drawn lines
GRID_DEG = 0.05                   # residence-point grid (~5 km)
MT_BBOX = (-116.1, 44.3, -104.0, 49.05)
TARGET_REGIONS = ["MT", "ND", "SD", "AB", "SK", "ID"]
# Montana duck season window used to filter time-based layers (2026-27 regs: youth days Sep 26-27; regular season
# Oct 3 - Jan 7/15/19 depending on flyway/zone). Verify each year at fwp.mt.gov.
SEASON_WINDOW = ("09-26", "01-19")
FOCUS_AREAS = [  # name, [south, west, north, east]
    ("Statewide", [44.3, -116.1, 49.05, -104.0]), ("Bitterroot", [45.65, -114.55, 46.95, -113.75]),
    ("Great Falls", [47.15, -112.55, 47.95, -110.85]), ("Flathead", [47.25, -114.65, 48.55, -113.75]),
    ("Helena–Bozeman", [45.4, -112.4, 46.9, -110.6]), ("Hi-Line", [48.0, -110.6, 49.0, -105.8]),
    ("Fort Peck–NE", [47.4, -107.6, 49.0, -104.0]), ("Billings–Yellowstone", [45.0, -109.3, 46.5, -107.2]),
    ("SW Montana", [44.4, -113.4, 45.9, -111.2]), ("MT + neighbors", [42.0, -117.5, 54.5, -96.5])]

SEASONS = {  # month -> season (Northern Great Plains mallard annual cycle; assumption)
    12: "Winter", 1: "Winter", 2: "Winter",
    3: "Spring migration", 4: "Spring migration",
    5: "Breeding", 6: "Breeding", 7: "Breeding",
    8: "Post-breeding / molt", 9: "Post-breeding / molt",
    10: "Fall migration", 11: "Fall migration"}
SEASON_COLORS = {"Winter": "#2b6cb0", "Spring migration": "#2f855a", "Breeding": "#d69e2e",
                 "Post-breeding / molt": "#9c4221", "Fall migration": "#c53030"}
BAND_COLOR, RECOV_COLOR, PAIR_COLOR = "#1f4e9c", "#e07b00", "#6b46c1"

# Approximate center points (not boundaries). Freezeout Lake & Canyon Ferry are state WMAs.
REFUGES = [
    ("Freezeout Lake WMA (state)", 47.67, -112.02), ("Benton Lake NWR", 47.67, -111.33),
    ("Bowdoin NWR", 48.40, -107.66), ("Medicine Lake NWR", 48.47, -104.40),
    ("Red Rock Lakes NWR", 44.62, -111.75), ("Lee Metcalf NWR", 46.56, -114.08),
    ("Ninepipe NWR", 47.43, -114.10), ("Pablo NWR", 47.62, -114.10),
    ("Charles M. Russell NWR", 47.63, -107.20), ("UL Bend NWR", 47.58, -107.85),
    ("Lake Mason NWR", 46.57, -108.62), ("Hailstone NWR", 45.93, -109.20),
    ("Swan River NWR", 47.93, -113.88), ("Lost Trail NWR", 48.03, -114.58),
    ("Canyon Ferry WMA (state)", 46.45, -111.55), ("Warm Springs Ponds WMA (state)", 46.18, -112.78)]
TOWNS = [  # reference only
    ("Billings", 45.783, -108.500), ("Missoula", 46.872, -113.994), ("Great Falls", 47.506, -111.300),
    ("Bozeman", 45.677, -111.043), ("Butte", 46.004, -112.535), ("Helena", 46.589, -112.039),
    ("Kalispell", 48.196, -114.313), ("Havre", 48.550, -109.684), ("Miles City", 46.408, -105.840),
    ("Lewistown", 47.062, -109.428), ("Glasgow", 48.197, -106.637), ("Sidney", 47.717, -104.156),
    ("Glendive", 47.105, -104.712), ("Malta", 48.360, -107.872), ("Wolf Point", 48.091, -105.641),
    ("Choteau", 47.813, -112.184), ("Shelby", 48.505, -111.857), ("Dillon", 45.216, -112.638),
    ("Livingston", 45.662, -110.561), ("Hamilton", 46.247, -114.160), ("Polson", 47.693, -114.163),
    ("Cut Bank", 48.633, -112.326), ("Plentywood", 48.775, -104.563), ("Hardin", 45.732, -107.612),
    ("Roundup", 46.445, -108.542), ("Conrad", 48.170, -111.946), ("Fort Benton", 47.818, -110.668)]
MAJOR_RIVERS = {"Missouri", "Yellowstone", "Milk", "Marias", "Clark Fork", "Flathead", "Bighorn",
                "Musselshell", "Sun", "Teton", "Jefferson", "Madison", "Gallatin", "Bitterroot",
                "Kootenai", "Powder", "Tongue", "Big Hole", "Beaverhead", "Judith", "Poplar",
                "Blackfoot", "Smith", "Dearborn", "Red Rock", "Big Muddy", "Frenchman"}

SOURCES = {
    "usgs": ("Pearse, A.T., Szymanski, M., Anchor, C.E., Murano, R., and Stafford, J.D., 2023, "
             "Mallard migration and regional movement timing, distance, and direction data, "
             "2018-2020: U.S. Geological Survey data release, https://doi.org/10.5066/P9GSUQUU.",
             "Public domain (CC0 1.0)"),
    "bbl": ("Nakash, E., Malorodova, M., Howes, L., and Celis-Murillo, A., 2026, North American Bird Banding Program "
            "Dataset 1960-2026 retrieved 2026-07-15: U.S. Geological Survey data release, https://doi.org/10.5066/P1CCONUX "
            "(files used: {version}). Gamebird banding locations are released as 1-degree blocks.",
            "Public domain (CC0 1.0)"),
    "ebird": ("eBird Status and Trends, Cornell Lab of Ornithology (ebirdst R package). "
              "{citation}", "eBird Status & Trends terms of use (non-commercial, attribution)"),
    "ne": ("Natural Earth (naturalearthdata.com): admin-1 boundaries, rivers, lakes.", "Public domain"),
    "nwi": ("U.S. Fish & Wildlife Service, National Wetlands Inventory.", "Public domain"),
}
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
NE_FILES = ["ne_50m_admin_1_states_provinces", "ne_10m_rivers_lake_centerlines",
            "ne_10m_rivers_north_america", "ne_10m_lakes", "ne_10m_lakes_north_america"]

LOG = []   # cleaning / assumption log -> report.md


def log(msg):
    LOG.append(msg)
    print("  -", msg)


# ----------------------------------------------------------------------------- helpers
def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def norm_cols(df):
    df.columns = [c.strip().lower().replace("-", "_").replace(" ", "_").replace(".", "_") for c in df.columns]
    return df


def pick(df, candidates, contains=None):
    for c in candidates:
        if c in df.columns:
            return c
    if contains:
        for c in df.columns:
            if all(k in c for k in contains):
                return c
    return None


def read_csvs(pattern):
    out = []
    for f in sorted(glob.glob(pattern)):
        if os.path.basename(f).lower() == "studies.csv":
            continue
        try:
            d = pd.read_csv(f, low_memory=False)
        except UnicodeDecodeError:
            d = pd.read_csv(f, low_memory=False, encoding="latin-1")
        d["_file"] = os.path.basename(f)
        out.append(norm_cols(d))
    return out


def thin(df, hours, by="bird"):
    key = df["t"].dt.floor(f"{hours}h")
    return df.loc[~pd.DataFrame({"b": df[by], "k": key}).duplicated()]


# ----------------------------------------------------------------------------- reference
def load_reference(ref_dir, data_dir):
    ref_dir.mkdir(parents=True, exist_ok=True)
    for f in NE_FILES:
        p = ref_dir / f"{f}.geojson"
        if not p.exists():
            print(f"  downloading {f} ...")
            urllib.request.urlretrieve(NE_BASE + f + ".geojson", p)
    adm = gpd.read_file(ref_dir / "ne_50m_admin_1_states_provinces.geojson")
    adm = adm[adm["admin"].isin(["United States of America", "Canada"])][["name", "postal", "admin", "geometry"]]
    adm = adm.to_crs(4326)
    mt = adm[adm["postal"] == "MT"].dissolve()
    mt_geom = mt.geometry.iloc[0]
    clip = box(*MT_BBOX)

    rivers = pd.concat([gpd.read_file(ref_dir / f"{f}.geojson")[["name", "geometry"]]
                        for f in ("ne_10m_rivers_lake_centerlines", "ne_10m_rivers_north_america")])
    rivers = gpd.clip(rivers.set_crs(4326, allow_override=True), mt_geom)
    rivers = rivers[rivers["name"].fillna("").isin(MAJOR_RIVERS)].dissolve(by="name").reset_index()
    lakes = pd.concat([gpd.read_file(ref_dir / f"{f}.geojson")[["name", "geometry"]]
                       for f in ("ne_10m_lakes", "ne_10m_lakes_north_america")])
    lakes = gpd.clip(lakes.set_crs(4326, allow_override=True), mt_geom)

    nwi = None
    nwi_files = glob.glob(str(data_dir / "nwi" / "*.gpkg")) + glob.glob(str(data_dir / "nwi" / "*.shp"))
    if nwi_files:
        nwi = gpd.read_file(nwi_files[0], bbox=MT_BBOX).to_crs(4326)
        nwi = gpd.clip(nwi, mt_geom)
        nwi["geometry"] = nwi.geometry.simplify(0.002)
        log(f"NWI wetlands loaded from {os.path.basename(nwi_files[0])}: {len(nwi):,} polygons (simplified ~200 m).")
    else:
        log("NWI wetlands shown as a live USFWS map service (no 1.5 GB download needed); it draws only when zoomed in to roughly county scale (USFWS limit 1:236,000).")
    adm_s = adm.copy()
    adm_s["geometry"] = adm_s.geometry.simplify(0.02)
    return adm_s, mt_geom, rivers, lakes, nwi


def assign_region(gdf, adm):
    j = gpd.sjoin(gdf, adm[["postal", "name", "geometry"]], how="left", predicate="within")
    j = j[~j.index.duplicated()]
    gdf["region"] = j["postal"].fillna("Outside US/Canada").values
    return gdf


# ----------------------------------------------------------------------------- loaders
def load_movebank(data_dir, sub="movebank", taxon="Anas platyrhynchos"):
    frames = read_csvs(str(data_dir / sub / "*.csv"))
    if not frames:
        return pd.DataFrame(), {}
    studies, out = {}, []
    meta_p = data_dir / sub / "studies.csv"
    meta = norm_cols(pd.read_csv(meta_p)).set_index("study_name").to_dict("index") if meta_p.exists() else {}
    for d in frames:
        f = d["_file"].iloc[0]
        ts, lon, lat = pick(d, ["timestamp"]), pick(d, ["location_long", "longitude", "lon"]), pick(d, ["location_lat", "latitude", "lat"])
        bid = pick(d, ["individual_local_identifier", "tag_local_identifier", "individual_id", "tag_id"])
        if not all([ts, lon, lat, bid]):
            log(f"Movebank {f}: skipped, missing timestamp/lat/long/individual columns.")
            continue
        n0 = len(d)
        tax = pick(d, ["individual_taxon_canonical_name"])
        if tax and taxon:
            d = d[d[tax].fillna("").str.contains(taxon, case=False)]
        for flag in ["visible"]:
            if flag in d.columns:
                d = d[d[flag].astype(str).str.lower().isin(["true", "1", "nan"])]
        for flag in ["manually_marked_outlier", "algorithm_marked_outlier", "import_marked_outlier"]:
            if flag in d.columns:
                d = d[~d[flag].astype(str).str.lower().isin(["true", "1"])]
        study = d[pick(d, ["study_name"])].iloc[0] if pick(d, ["study_name"]) and len(d) else Path(f).stem
        g = pd.DataFrame({"t": pd.to_datetime(d[ts], utc=True, errors="coerce"),
                          "lon": pd.to_numeric(d[lon], errors="coerce"),
                          "lat": pd.to_numeric(d[lat], errors="coerce"),
                          "bird": "MB:" + str(study)[:40] + ":" + d[bid].astype(str),
                          "source": f"Movebank: {study}"})
        log(f"Movebank '{study}' ({f}): {n0:,} rows -> {len(g):,} after species/visible/outlier flags"
            + ("" if taxon else " (other waterfowl, NOT mallard; kept in a separate layer)") + ".")
        studies[study] = meta.get(study, {})
        out.append(g)
    return (pd.concat(out) if out else pd.DataFrame()), studies


def load_usgs(data_dir):
    """Auto-detects whether each USGS table holds per-fix locations or movement events."""
    fixes, events, nonspatial = [], [], []
    for d in read_csvs(str(data_dir / "usgs" / "*.csv")):
        f = d["_file"].iloc[0]
        latc = [c for c in d.columns if "lat" in c]
        lonc = [c for c in d.columns if "lon" in c]
        idc = pick(d, ["bird_id", "id", "band", "tag_id", "individual", "transmitter", "ptt"], contains=["id"])
        datec = [c for c in d.columns if "date" in c or "time" in c]
        if len(latc) >= 2 and len(lonc) >= 2:
            def order(cols):
                s = sorted(cols, key=lambda c: (0 if any(k in c for k in ["start", "dep", "begin", "orig", "from", "1"]) else 1))
                return s[0], s[1]
            la0, la1 = order(latc); lo0, lo1 = order(lonc)
            e = pd.DataFrame({"lat0": pd.to_numeric(d[la0], errors="coerce"), "lon0": pd.to_numeric(d[lo0], errors="coerce"),
                              "lat1": pd.to_numeric(d[la1], errors="coerce"), "lon1": pd.to_numeric(d[lo1], errors="coerce"),
                              "bird": d[idc].astype(str) if idc else d.index.astype(str),
                              "t": pd.to_datetime(d[datec[0]], errors="coerce", utc=True) if datec else pd.NaT})
            e = e.dropna(subset=["lat0", "lon0", "lat1", "lon1"])
            log(f"USGS {f}: movement-event table ({la0},{lo0}) -> ({la1},{lo1}); {len(e):,} events.")
            events.append(e)
        elif latc and lonc and datec:
            g = pd.DataFrame({"t": pd.to_datetime(d[datec[0]], utc=True, errors="coerce"),
                              "lat": pd.to_numeric(d[latc[0]], errors="coerce"), "lon": pd.to_numeric(d[lonc[0]], errors="coerce"),
                              "bird": "USGS:" + (d[idc].astype(str) if idc else "unknown"),
                              "source": "USGS 2018-2020 (doi:10.5066/P9GSUQUU)"})
            log(f"USGS {f}: per-location table; {len(g):,} rows.")
            fixes.append(g)
        else:
            log(f"USGS {f}: no coordinate columns found ({len(d):,} rows) - summarized in report only.")
            nonspatial.append(d)
    return (pd.concat(fixes) if fixes else pd.DataFrame()), (pd.concat(events) if events else pd.DataFrame()), nonspatial


def usgs_summary(nonspatial, data_dir):
    """Summarize the USGS 2018-2020 tables (MALL_dist_dir.csv / MALL_timing.csv): no coordinates are released."""
    import re
    dd = next((d for d in nonspatial if {"move_d", "bearing"} <= set(d.columns)), None)
    tm = next((d for d in nonspatial if "exposure" in d.columns), None)
    if dd is None and tm is None:
        return None
    S = {}
    xml = glob.glob(str(data_dir / "usgs" / "*.xml"))
    if xml:
        x = Path(xml[0]).read_text()
        S["bbox"] = {k: float(re.search(f"<{k}>([-0-9.]+)</{k}>", x).group(1)) for k in ("westbc", "eastbc", "northbc", "southbc")}
    if dd is not None:
        S.update(birds=dd.device_id.nunique(), moves=len(dd), by_type=dd.move_type.value_counts().to_dict(),
                 birds_by_year=dd.drop_duplicates("device_id").capture_yr.value_counts().sort_index().to_dict(),
                 sex=dd.drop_duplicates("device_id").sex.value_counts().to_dict(),
                 dist=dd.groupby("move_type").move_d.describe()[["count", "50%", "min", "max"]].round(1).to_dict("index"))
        fm = dd[(dd.move_type == "M") & (dd.first_m == 1)]
        b = np.radians(fm.bearing)
        S["first_mig"] = dict(n=len(fm), median_km=float(fm.move_d.median()),
                              mean_bearing=float(np.degrees(np.arctan2(np.sin(b).mean(), np.cos(b).mean())) % 360))
        sect = ((dd.bearing % 360) / 22.5 + 0.5).astype(int) % 16
        S["rose"] = {t: np.bincount(sect[dd.move_type == t], minlength=16).tolist() for t in ("M", "R")}
    if tm is not None:
        S.update(t_birds=tm.device_id.nunique(), t_rows=len(tm), use_areas=tm.area_id.nunique(), exposure_days=int(tm.exposure.sum()))
    w = S.get("bbox", {}).get("westbc")
    msg = (f"USGS 2018-2020: {S.get('birds', S.get('t_birds'))} birds, {S.get('moves', 0)} movements; release has distance & bearing "
           "but NO coordinates, so it cannot be drawn as tracks.")
    if w is not None:
        msg += f" Metadata extent starts at {abs(w)}° W, east of Montana's border (~104.05° W): 0 locations in Montana."
    log(msg)
    return S


def rose_svg(rose, size=220):
    """Simple wind-rose SVG: migration (>310 km) vs regional (25-310 km) movement bearings."""
    c, r0 = size / 2, size / 2 - 22
    mx = max(max(rose["M"]), max(rose["R"])) or 1
    parts = [f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" font-family="sans-serif" font-size="10">']
    for f in (.33, .66, 1):
        parts.append(f'<circle cx="{c}" cy="{c}" r="{r0*f:.1f}" fill="none" stroke="#ddd"/>')
    for lab, a in (("N", 0), ("E", 90), ("S", 180), ("W", 270)):
        x, y = c + (r0 + 12) * math.sin(math.radians(a)), c - (r0 + 12) * math.cos(math.radians(a)) + 4
        parts.append(f'<text x="{x:.0f}" y="{y:.0f}" text-anchor="middle">{lab}</text>')
    for key, col, off in (("R", "#3182ce", -4), ("M", "#c53030", 4)):
        for i, n in enumerate(rose[key]):
            a = math.radians(i * 22.5 + off); rr = r0 * n / mx
            x, y = c + rr * math.sin(a), c - rr * math.cos(a)
            parts.append(f'<line x1="{c}" y1="{c}" x2="{x:.1f}" y2="{y:.1f}" stroke="{col}" stroke-width="5" stroke-linecap="round" opacity=".8"/>')
    parts.append("</svg>")
    return "".join(parts)


def clean_gps(g, adm, label="GPS"):
    if g.empty:
        return g
    n0 = len(g)
    g = g.dropna(subset=["t", "lat", "lon"])
    g = g[(g.lat.between(-90, 90)) & (g.lon.between(-180, 180)) & ~((g.lat == 0) & (g.lon == 0))]
    g = g.drop_duplicates(["bird", "t"]).sort_values(["bird", "t"]).reset_index(drop=True)
    n1 = len(g)
    # spike filter: drop a fix only if speed INTO and OUT OF it both exceed MAX_SPEED_KMH
    keep = np.ones(len(g), bool)
    for _, idx in g.groupby("bird").indices.items():
        if len(idx) < 3:
            continue
        la, lo, t = g.lat.values[idx], g.lon.values[idx], g.t.values[idx].astype("datetime64[s]").astype(float) / 3600
        d = haversine_km(la[:-1], lo[:-1], la[1:], lo[1:])
        v = d / np.maximum(np.diff(t), 1 / 60)
        spike = np.zeros(len(idx), bool)
        spike[1:-1] = (v[:-1] > MAX_SPEED_KMH) & (v[1:] > MAX_SPEED_KMH)
        keep[idx[spike]] = False
    g = g[keep].reset_index(drop=True)
    log(f"{label} cleaning: {n0:,} fixes -> {n1:,} after removing missing/invalid/duplicate -> "
        f"{len(g):,} after speed-spike filter (>{MAX_SPEED_KMH:.0f} km/h in and out).")
    g = thin(g, ANALYSIS_STEP_H)
    log(f"{label} thinned to <= 1 fix/{ANALYSIS_STEP_H} h per bird for analysis: {len(g):,} fixes.")
    g["season"] = g.t.dt.month.map(SEASONS)
    gg = gpd.GeoDataFrame(g, geometry=gpd.points_from_xy(g.lon, g.lat), crs=4326)
    return assign_region(gg, adm)


def load_bbl(data_dir, adm, mt_geom):
    frames = read_csvs(str(data_dir / "bbl" / "*.csv"))
    if not frames:
        return pd.DataFrame(), ""
    d = pd.concat(frames, ignore_index=True)
    version = ", ".join(sorted(d["_file"].unique()))[:200]
    sp = pick(d, ["species_id", "b_species_id", "species", "spec", "aou"])
    if sp:
        d = d[pd.to_numeric(d[sp], errors="coerce") == SPECIES_BBL]
    log(f"BBL: {len(d):,} records with species code {SPECIES_BBL} (Mallard).")
    b_lat = pick(d, ["b_lat_dd", "b_lat_decimal_degrees", "lat_dd_b"], contains=["b_", "lat"])
    e_lat = pick(d, ["e_lat_dd", "r_lat_dd", "e_lat_decimal_degrees"], contains=["e_", "lat"])
    if b_lat and e_lat:  # wide format: one row = banding + encounter
        p = pd.DataFrame({"band": d[pick(d, ["band", "original_band", "band_num"], contains=["band"])].astype(str),
                          "blat": d[b_lat], "blon": d[b_lat.replace("lat", "lon")],
                          "elat": d[e_lat], "elon": d[e_lat.replace("lat", "lon")],
                          "byear": d.get(pick(d, ["b_year", "banding_year"], contains=["b_", "year"]) or "x"),
                          "eyear": d.get(pick(d, ["e_year", "encounter_year"], contains=["e_", "year"]) or "x"),
                          "bsub": d.get(pick(d, ["b_iso_subdivision"]) or "x"), "esub": d.get(pick(d, ["e_iso_subdivision"]) or "x")})
        log("BBL format: wide (banding and encounter fields on the same row).")
    else:  # long format: banding rows (B) and encounter rows (E) linked by band number
        ev = pick(d, ["event_type", "record_type"])
        band = pick(d, ["original_band", "band"], contains=["band"])
        lat, lon = pick(d, ["lat_dd", "latitude"], contains=["lat"]), pick(d, ["lon_dd", "longitude"], contains=["lon"])
        yr, sub = pick(d, ["event_year", "year"], contains=["year"]), pick(d, ["iso_subdivision"])
        if not all([ev, band, lat, lon]):
            log("BBL: could not find event_type/band/lat/lon columns - layer skipped. Columns: " + ", ".join(d.columns[:40]))
            return pd.DataFrame(), version
        cols = [band, lat, lon] + [c for c in (yr, sub) if c]
        B = d[d[ev].astype(str).str.upper().str.startswith("B")][cols].drop_duplicates(band)
        E = d[d[ev].astype(str).str.upper().str.startswith("E")]
        rs = pick(d, ["record_source"])
        if rs:  # NABBP: EVENT_TYPE E covers encounters AND recaptures; RECORD_SOURCE R = recapture by a bander
            E = E[E[rs].astype(str).str.upper() != "R"]
        E = E[cols]
        p = E.merge(B, on=band, suffixes=("_e", "_b"))
        p = pd.DataFrame({"band": p[band].astype(str), "blat": p[lat + "_b"], "blon": p[lon + "_b"],
                          "elat": p[lat + "_e"], "elon": p[lon + "_e"],
                          "byear": p[yr + "_b"] if yr else np.nan, "eyear": p[yr + "_e"] if yr else np.nan,
                          "bsub": p[sub + "_b"] if sub else np.nan, "esub": p[sub + "_e"] if sub else np.nan})
        log(f"BBL format: long ({len(B):,} banding rows, {len(E):,} encounter rows; joined on '{band}'). Live recaptures (RECORD_SOURCE = R) excluded; hunter/finder encounters kept.")
    for c in ["blat", "blon", "elat", "elon"]:
        p[c] = pd.to_numeric(p[c], errors="coerce")
    p = p.dropna(subset=["blat", "blon", "elat", "elon"])
    p = p[(p.blat != 0) & (p.elat != 0)]
    # Montana membership: ISO subdivision code if present, else point-in-polygon
    if p["bsub"].astype(str).str.startswith("US-").any():
        p["b_mt"] = p["bsub"].astype(str).eq("US-MT"); p["e_mt"] = p["esub"].astype(str).eq("US-MT")
        log("BBL Montana test: ISO subdivision code = US-MT.")
    else:
        from shapely import prepared
        pm = prepared.prep(mt_geom)
        p["b_mt"] = [pm.contains(Point(x, y)) for x, y in zip(p.blon, p.blat)]
        p["e_mt"] = [pm.contains(Point(x, y)) for x, y in zip(p.elon, p.elat)]
        log("BBL Montana test: point-in-polygon (1-degree block centers can fall across the state line).")
    p = p[p.b_mt | p.e_mt].copy()
    for pre in ("b", "e"):
        r = assign_region(gpd.GeoDataFrame(p[[]], geometry=gpd.points_from_xy(p[pre + "lon"], p[pre + "lat"]), crs=4326), adm)
        p[pre + "region"] = r["region"].values
    log(f"BBL: {len(p):,} band->recovery pairs with banding OR recovery in Montana.")
    return p, version


def load_ebird(data_dir, mt_geom):
    import rasterio
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.features import geometry_mask
    import matplotlib
    tifs = sorted(glob.glob(str(data_dir / "ebird" / "*.tif")))
    if not tifs:
        return None
    src_p = next((t for t in tifs if "abundance" in t.lower() and "median" in t.lower()), tifs[0])
    with rasterio.open(src_p) as src:
        dst_crs = "EPSG:3857"
        mt_3857 = gpd.GeoSeries([mt_geom], crs=4326).to_crs(dst_crs).iloc[0]
        mt_src = gpd.GeoSeries([mt_geom], crs=4326).to_crs(src.crs).iloc[0]
        win = rasterio.windows.from_bounds(*mt_src.buffer(20000).bounds, transform=src.transform).round_offsets().round_lengths()
        data = src.read(window=win).astype("float32")
        if src.nodata is not None:
            data[data == src.nodata] = np.nan
        wt = src.window_transform(win)
        names = [s or f"Week {i+1}" for i, s in enumerate(src.descriptions)]
        a_, b_ = SEASON_WINDOW
        fall = [i for i, n in enumerate(names) if n[:4].isdigit() and n[5:] >= a_]
        winter = [i for i, n in enumerate(names) if n[:4].isdigit() and n[5:] <= b_]
        keep = fall + winter if (fall or winter) else list(range(len(names)))
        tr, w, h = calculate_default_transform(src.crs, dst_crs, data.shape[2], data.shape[1],
                                               *rasterio.transform.array_bounds(data.shape[1], data.shape[2], wt))
        out = np.full((data.shape[0], h, w), np.nan, "float32")
        for i in range(data.shape[0]):
            reproject(data[i], out[i], src_transform=wt, src_crs=src.crs, dst_transform=tr, dst_crs=dst_crs,
                      resampling=Resampling.nearest, src_nodata=np.nan, dst_nodata=np.nan)
        outside = geometry_mask([mt_3857], out_shape=(h, w), transform=tr)
        out[:, outside] = np.nan
        out, names = out[keep], [names[i] for i in keep]
        res_km = abs(src.res[0]) / 1000
    left, bottom, right, top = rasterio.transform.array_bounds(h, w, tr)
    ll = gpd.GeoSeries([Point(left, bottom), Point(right, top)], crs=3857).to_crs(4326)
    bounds = [[ll.iloc[0].y, ll.iloc[0].x], [ll.iloc[1].y, ll.iloc[1].x]]
    vmax = float(np.nanpercentile(out[out > 0], 99)) if np.any(out > 0) else 1.0
    cmap = matplotlib.colormaps["YlGnBu"]
    from PIL import Image
    pngs = []
    for i in range(out.shape[0]):
        a = out[i]
        norm = np.clip(np.log1p(np.nan_to_num(a)) / np.log1p(vmax), 0, 1)
        rgba = (cmap(norm) * 255).astype("uint8")
        rgba[..., 3] = np.where(np.isnan(a) | (a <= 0), 0, 200)
        buf = io.BytesIO(); Image.fromarray(rgba).save(buf, "PNG", optimize=True)
        pngs.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    # top cells by mean weekly abundance (for the modeled top-10 list)
    with np.errstate(all="ignore"):
        import warnings; warnings.simplefilter("ignore", RuntimeWarning)
        mean = np.nanmean(out, axis=0)
    rows, cols = np.where(np.isfinite(mean) & (mean > 0))
    xs, ys = rasterio.transform.xy(tr, rows, cols)
    pts = gpd.GeoSeries(gpd.points_from_xy(xs, ys), crs=3857).to_crs(4326)
    cells = pd.DataFrame({"lat": pts.y.values, "lon": pts.x.values, "score": mean[rows, cols]})
    cit_p = data_dir / "ebird" / "citation.txt"
    log(f"eBird S&T: {os.path.basename(src_p)}, {out.shape[0]} duck-season weeks ({SEASON_WINDOW[0]} to {SEASON_WINDOW[1]}), ~{res_km:.1f} km cells, clipped to Montana, "
        f"reprojected to Web Mercator (nearest neighbour); colors log-scaled, fixed max = 99th pct ({vmax:.3g}).")
    return dict(pngs=pngs, names=names, bounds=bounds, vmax=vmax, cells=cells,
                citation=cit_p.read_text().strip() if cit_p.exists() else "Cite with ebirdst::citation_ebirdst().")


# ----------------------------------------------------------------------------- analysis
def residence(g):
    """Time spent per bird per ~5 km cell; dt to next fix capped at MAX_GAP_HOURS."""
    g = g.sort_values(["bird", "t"]).copy()
    dt = g.groupby("bird")["t"].shift(-1).sub(g["t"]).dt.total_seconds() / 3600
    g["hrs"] = dt.clip(upper=MAX_GAP_HOURS).fillna(0)
    g["cx"] = (g.lon / GRID_DEG).round() * GRID_DEG
    g["cy"] = (g.lat / GRID_DEG).round() * GRID_DEG
    agg = g.groupby(["cx", "cy"]).agg(hrs=("hrs", "sum"), birds=("bird", "nunique"),
                                      season=("season", lambda s: s.mode().iat[0]), region=("region", "first")).reset_index()
    return agg[agg.hrs > 0]


def stopovers(g):
    rows = []
    for bird, d in g.sort_values("t").groupby("bird"):
        la, lo = d.lat.values, d.lon.values
        t = d.t.values.astype("datetime64[s]").astype(float) / 3600
        i, n = 0, len(d)
        while i < n:
            j = i
            while j + 1 < n and haversine_km(la[i], lo[i], la[j + 1], lo[j + 1]) <= STOPOVER_RADIUS_KM:
                j += 1
            if t[j] - t[i] >= STOPOVER_MIN_HOURS:
                rows.append(dict(bird=bird, lat=la[i:j + 1].mean(), lon=lo[i:j + 1].mean(),
                                 start=d.t.iat[i], end=d.t.iat[j], days=(t[j] - t[i]) / 24,
                                 season=d.season.iloc[i:j + 1].mode().iat[0], region=d.region.iloc[i]))
                i = j + 1
            else:
                i += 1
    return pd.DataFrame(rows)


def top_areas(df, weight, n=10, sep_km=20, cell=0.1, how="sum"):
    """Greedy non-max suppression on a ~10 km grid so the top 10 are distinct areas."""
    if df.empty:
        return pd.DataFrame()
    d = df.copy()
    d["gx"] = (d.lon / cell).round() * cell; d["gy"] = (d.lat / cell).round() * cell
    agg = {"w": (weight, how), "lat": ("lat", "mean"), "lon": ("lon", "mean")}
    if "bird" in d: agg["birds"] = ("bird", "nunique")
    if "region" in d: agg["region"] = ("region", "first")
    a = d.groupby(["gx", "gy"]).agg(**agg).reset_index().sort_values("w", ascending=False)
    picked = []
    for _, r in a.iterrows():
        if all(haversine_km(r.lat, r.lon, p.lat, p.lon) > sep_km for p in picked):
            picked.append(r)
        if len(picked) == n:
            break
    out = pd.DataFrame(picked).reset_index(drop=True)
    if out.empty:
        return out
    near = []
    for _, r in out.iterrows():
        dist = [(haversine_km(r.lat, r.lon, la, lo), nm) for nm, la, lo in REFUGES]
        km, nm = min(dist)
        near.append(f"{nm} ({km:.0f} km)")
    out["nearest_reference_site"] = [n if float(n.rsplit("(", 1)[1].split(" ")[0]) <= 150 else "— (no MT refuge within 150 km)" for n in near]
    return out


# ----------------------------------------------------------------------------- map
def gj_lines(features):
    return {"type": "FeatureCollection", "features": features}


def build_map(args, adm, mt_geom, rivers, lakes, nwi, gps, events, bbl, ebd, stops, resid, studies, bbl_version, summary, usgs=None,
              other=None, other_studies=None):
    m = folium.Map(location=[47.0, -109.6], zoom_start=6, tiles=None, control_scale=True, zoom_snap=0.25, zoom_delta=0.5)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri, USGS, NOAA", name="Base: Topo (Esri) — marshes, water, terrain", control=True, show=True).add_to(m)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri, HERE, Garmin, USGS", name="Base: light gray", control=True, show=False).add_to(m)
    folium.TileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr="OpenTopoMap (CC-BY-SA), OpenStreetMap",
                     name="Base: Terrain contours (OpenTopoMap)", control=True, show=False, max_zoom=17).add_to(m)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri, Maxar", name="Base: Satellite (Esri)", control=True, show=False).add_to(m)
    folium.TileLayer("OpenStreetMap", name="Base: OpenStreetMap", control=True, show=False).add_to(m)

    # ---- reference layers
    ref = folium.FeatureGroup(name="REFERENCE · Montana outline", show=True)
    folium.GeoJson(mapping(mt_geom), style_function=lambda f: {"color": "#555", "weight": 1.5, "fill": False, "opacity": .8}).add_to(ref)
    ref.add_to(m)
    rv = folium.FeatureGroup(name="REFERENCE · Major rivers (Natural Earth)", show=True)
    folium.GeoJson(rivers.to_json(), style_function=lambda f: {"color": "#8fb3d1", "weight": 1, "opacity": .6},
                   tooltip=folium.GeoJsonTooltip(["name"], labels=False)).add_to(rv)
    rv.add_to(m)
    wl = folium.FeatureGroup(name="REFERENCE · Wetlands / lakes / reservoirs" + (" (NWI)" if nwi is not None else " (Natural Earth lakes; NWI not supplied)"), show=True)
    folium.GeoJson(lakes.to_json(), style_function=lambda f: {"color": "#8fb3d1", "weight": .3, "fillColor": "#cfe2f1", "fillOpacity": .55},
                   tooltip=folium.GeoJsonTooltip(["name"], labels=False)).add_to(wl)
    if nwi is not None:
        folium.GeoJson(nwi[["geometry"]].to_json(), style_function=lambda f: {"color": "#38a169", "weight": 0, "fillColor": "#68d391", "fillOpacity": .5}).add_to(wl)
    wl.add_to(m)
    folium.WmsTileLayer(url="https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer",
                        layers="0", fmt="image/png", transparent=True, version="1.3.0", attr="USFWS National Wetlands Inventory",
                        name="REFERENCE · NWI wetlands (live from USFWS; appears when zoomed to ~county scale)", show=True, overlay=True, opacity=0.45).add_to(m)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri, USGS", name="REFERENCE · Topo shading (Esri hillshade, faint)", overlay=True, control=True,
                     show=False, opacity=0.18).add_to(m)
    tw = folium.FeatureGroup(name="REFERENCE · Montana towns (topo already labels towns)", show=False)
    for nm, la, lo in TOWNS:
        folium.CircleMarker([la, lo], radius=2, color="#888", weight=1, fill=True, fill_color="#fff", fill_opacity=1,
                            tooltip=folium.Tooltip(nm, permanent=True, direction="right", offset=(4, 0), class_name="town-lbl")).add_to(tw)
    tw.add_to(m)
    folium.TileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
                     attr="Esri", name="REFERENCE · All place names & roads labels (Esri, zoom in for more)", overlay=True,
                     control=True, show=False, opacity=0.8).add_to(m)
    m.get_root().header.add_child(Element(
        "<style>.leaflet-tooltip.town-lbl{background:transparent!important;border:0!important;box-shadow:none!important;font:500 10px sans-serif;color:#777;"
        "text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;padding:0!important}.leaflet-tooltip.town-lbl:before{display:none}"
        "#legend{display:none;position:fixed;top:64px;right:12px;z-index:9999;background:#fff;padding:10px 12px;border-radius:12px;"
        "font:13px/1.35 sans-serif;box-shadow:0 2px 10px #0004;width:270px;max-width:calc(100vw - 24px);max-height:60vh;overflow:auto}"
        "#legend.open{display:block}#lgbtn{position:fixed;top:64px;right:12px;z-index:9998;background:#fff;border:0;border-radius:18px;"
        "padding:9px 14px;font:600 14px sans-serif;box-shadow:0 2px 8px #0003}"
        ".lg-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}"
        ".xbtn{border:0;background:#edf2f7;border-radius:16px;width:32px;height:32px;font-size:15px;cursor:pointer}"
        ".lg-sec{margin:8px 0 3px;font:700 11px sans-serif;color:#4a5568;letter-spacing:.03em}"
        ".lg-row{display:flex;gap:8px;align-items:center;margin:3px 0}.lg-row i.sw{display:inline-block;width:22px;height:4px;flex:none}"
        ".lg-row i.dot{display:inline-block;width:11px;height:11px;border-radius:6px;flex:none}"
        ".lg-row i.num{display:inline-block;width:18px;height:18px;line-height:18px;border-radius:9px;background:#1a365d;color:#fff;text-align:center;font:bold 10px sans-serif;flex:none}"
        ".leaflet-top.leaflet-right{z-index:10001}"
        ".leaflet-control-layers-expanded{max-height:60vh;overflow:auto;font-size:13px;padding:0 8px 8px!important}"
        ".lc-close{position:sticky;top:0;background:#fff;display:flex;justify-content:space-between;align-items:center;padding:6px 0;font:700 14px sans-serif;z-index:2}"
        "@media (max-width:700px){ #maptitle{font-size:12px!important;left:50px!important;right:60px;padding:4px 8px!important}"
        " .leaflet-control-scale{display:none} .leaflet-control-attribution{font-size:9px;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        "}"
        ".hide-towns .town-lbl{display:none}"
        ".dock{background:#fff;border-radius:12px;box-shadow:0 2px 10px #0003;padding:8px 10px;font:13px sans-serif;max-width:min(560px,calc(100vw - 24px))}"
        ".dock .chips{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;scrollbar-width:none}"
        ".dock .chips::-webkit-scrollbar{display:none}"
        ".dock .chip{flex:0 0 auto;border:1px solid #cbd5e0;background:#f7fafc;border-radius:16px;padding:7px 12px;font:600 13px sans-serif;color:#2d3748}"
        ".dock .chip.on{background:#2b6cb0;color:#fff;border-color:#2b6cb0}"
        ".dock .wk{display:flex;align-items:center;gap:8px}.dock input[type=range]{flex:1;min-width:120px;height:28px}"
        ".dock #ebplay{width:36px;height:36px;border-radius:18px;border:0;background:#2b6cb0;color:#fff;font-size:13px}"
        ".dock #ebl{min-width:54px;font-weight:700;text-align:right}.dock .wksub{color:#718096;font-size:11px;margin-top:2px}"
        ".leaflet-bottom.leaflet-left{right:0}.leaflet-bottom.leaflet-left .leaflet-control{margin:0 12px 22px 12px}"
        "</style>"))
    m.get_root().script.add_child(Element(f"""window.addEventListener('load',function(){{var m={m.get_name()};
      function f(){{m.getContainer().classList.toggle('hide-towns', m.getZoom()<6);}} m.on('zoomend',f); f();}});"""))
    rf = folium.FeatureGroup(name="REFERENCE · Refuges & WMAs (approx. centers)", show=True)
    for nm, la, lo in REFUGES:
        folium.Marker([la, lo], tooltip=nm, icon=folium.DivIcon(html='<div style="font-size:12px;color:#7a9a84;opacity:.8">&#9873;</div>')).add_to(rf)
    rf.add_to(m)

    # ---- Layer 1: GPS tracks (real)
    regions_txt = ", ".join(sorted(gps.region.unique())) if len(gps) else ""
    mt_flag = "" if summary.get("gps_mt_fixes", 0) else " — NO fixes in Montana; regions: " + regions_txt
    if len(gps):
        disp = thin(gps.drop(columns="geometry"), DISPLAY_STEP_H)
        groups = {s: folium.FeatureGroup(name=f"LAYER 1 · REAL · GPS tracks · {s}", show=True) for s in SEASON_COLORS if s in set(disp.season)}
        for bird, d in disp.sort_values("t").groupby("bird"):
            run = (d.season != d.season.shift()).cumsum()
            for _, seg in d.groupby(run):
                s = seg.season.iat[0]
                # include first point of the next run so segments connect
                coords = [[round(x, 4), round(y, 4)] for x, y in zip(seg.lon, seg.lat)]
                nxt = d[d.t > seg.t.iat[-1]].head(1)
                if len(nxt): coords.append([round(nxt.lon.iat[0], 4), round(nxt.lat.iat[0], 4)])
                if len(coords) < 2: continue
                folium.GeoJson({"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
                                "properties": {"b": bird}},
                               style_function=lambda f, c=SEASON_COLORS[s]: {"color": c, "weight": 2, "opacity": .75},
                               tooltip=f"{bird} · {s} · {seg.t.iat[0]:%Y-%m-%d} to {seg.t.iat[-1]:%Y-%m-%d}").add_to(groups[s])
        for g_ in groups.values():
            g_.add_to(m)
        rg = folium.FeatureGroup(name=f"LAYER 1 · REAL · GPS time-spent points (size = hours in ~5 km cell){mt_flag}", show=True)
        hmax = resid.hrs.max()
        for _, r in resid.iterrows():
            folium.CircleMarker([r.cy, r.cx], radius=2 + 14 * math.sqrt(r.hrs / hmax), color=SEASON_COLORS[r.season],
                                weight=0, fill=True, fill_opacity=.55,
                                tooltip=f"{r.hrs:,.0f} h · {r.birds} bird(s) · mostly {r.season} · {r.region}").add_to(rg)
        rg.add_to(m)
        # weekly animation: one point per bird per day, visible for 1 week
        daily = gps.drop(columns="geometry").assign(day=gps.t.dt.floor("D")).groupby(["bird", "day"]).agg(
            lat=("lat", "mean"), lon=("lon", "mean"), season=("season", "first")).reset_index()
        feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(r.lon, 4), round(r.lat, 4)]},
                  "properties": {"time": r.day.strftime("%Y-%m-%d"), "popup": f"{r.bird} {r.day:%Y-%m-%d}",
                                 "icon": "circle", "iconstyle": {"fillColor": SEASON_COLORS[r.season], "fillOpacity": .9,
                                                                 "stroke": False, "radius": 4}}} for r in daily.itertuples()]
        plugins.TimestampedGeoJson({"type": "FeatureCollection", "features": feats}, period="P1W", duration="P1W",
                                   add_last_point=False, auto_play=False, loop=False, max_speed=10,
                                   date_options="YYYY-MM-DD", time_slider_drag_update=True).add_to(m)
    if len(events):
        ev = folium.FeatureGroup(name="LAYER 1 · REAL · USGS movement events (start -> end, summarized)", show=True)
        for r in events.itertuples():
            folium.PolyLine([[r.lat0, r.lon0], [r.lat1, r.lon1]], color="#4a5568", weight=1.5, dash_array="4 4", opacity=.7,
                            tooltip=f"USGS bird {r.bird}" + (f" · {r.t:%Y-%m-%d}" if pd.notna(r.t) else "")).add_to(ev)
        ev.add_to(m)

    # ---- Other ducks (REAL, NOT mallard): flight paths split into duck season vs rest of year
    if other is not None and len(other):
        nm_sp = ", ".join(sorted({m.get("common_name", k) for k, m in (other_studies or {}).items()}))
        mt_b, mt_f = other[other.region == "MT"].bird.nunique(), int((other.region == "MT").sum())
        a_, b_ = SEASON_WINDOW
        disp = thin(other.drop(columns="geometry"), DISPLAY_STEP_H).sort_values(["bird", "t"])
        md = disp.t.dt.strftime("%m-%d")
        disp["ins"] = (md >= a_) | (md <= b_)
        g_in = folium.FeatureGroup(name=f"REAL · {nm_sp} flight paths · duck season (MT: {mt_b} birds)", show=True)
        g_out = folium.FeatureGroup(name=f"REAL · {nm_sp} flight paths · rest of year", show=False)
        for bird, d in disp.groupby("bird"):
            run = (d.ins != d.ins.shift()).cumsum()
            for _, seg in d.groupby(run):
                nxt = d[d.t > seg.t.iat[-1]].head(1)
                pts = [[round(y, 4), round(x, 4)] for x, y in zip(seg.lon, seg.lat)]
                if len(nxt): pts.append([round(nxt.lat.iat[0], 4), round(nxt.lon.iat[0], 4)])
                if len(pts) < 2: continue
                tip = f"{nm_sp} (not mallard) · bird {bird.split(':')[-1]} · {seg.t.iat[0]:%b %d %Y} → {seg.t.iat[-1]:%b %d %Y}"
                if seg.ins.iat[0]:
                    folium.PolyLine(pts, color="#c05621", weight=2.2, opacity=.85, tooltip=tip).add_to(g_in)
                else:
                    folium.PolyLine(pts, color="#718096", weight=1.2, opacity=.5, dash_array="3 4", tooltip=tip).add_to(g_out)
        g_in.add_to(m); g_out.add_to(m)
        ost = stopovers(other)
        if len(ost):
            mdd = ost.start.dt.strftime("%m-%d")
            ost = ost[(mdd >= a_) | (mdd <= b_)]
            g_st = folium.FeatureGroup(name=f"DERIVED · {nm_sp} time spent · duck-season stops ≥3 days", show=True)
            for r in ost.itertuples():
                folium.CircleMarker([r.lat, r.lon], radius=3 + 2.2 * math.sqrt(r.days), color="#7b341e", weight=1, fill=True,
                                    fill_color="#ed8936", fill_opacity=.55,
                                    tooltip=f"{nm_sp} stayed {r.days:.0f} days · {r.start:%b %d} → {r.end:%b %d %Y} · {r.region} (approx., Argos)").add_to(g_st)
            g_st.add_to(m)

    # ---- Layer 3: stopovers (derived from real GPS)
    if len(stops):
        hm = folium.FeatureGroup(name=f"LAYER 3 · DERIVED · Stopover heatmap (<= {STOPOVER_RADIUS_KM:g} km for > 3 days, weight = days)", show=True)
        plugins.HeatMap(stops[["lat", "lon", "days"]].values.tolist(), radius=22, blur=18, min_opacity=.3).add_to(hm)
        hm.add_to(m)
    if len(summary.get("top_gps", [])):
        tg = folium.FeatureGroup(name="LAYER 3 · DERIVED · Top 10 GPS time-spent areas", show=True)
        for i, r in summary["top_gps"].iterrows():
            folium.Marker([r.lat, r.lon], tooltip=f"#{i+1} · {r.w:,.0f} bird-days · {r.region}",
                          icon=folium.DivIcon(html=f'<div style="background:#000;color:#fff;border-radius:10px;width:20px;text-align:center;font:bold 11px sans-serif">{i+1}</div>')).add_to(tg)
        tg.add_to(m)

    # ---- Layer 2: banding -> recovery (real, aggregated by identical 1-degree block pairs)
    if len(bbl):
        pairs = bbl.groupby(["blat", "blon", "elat", "elon"]).size().reset_index(name="n")
        lg = folium.FeatureGroup(name="LAYER 2 · REAL · Band -> recovery lines (Montana, width = # birds)", show=False)
        nmax = pairs.n.max()
        for r in pairs.itertuples():
            folium.PolyLine([[r.blat, r.blon], [r.elat, r.elon]], color=PAIR_COLOR, opacity=.35,
                            weight=0.7 + 6 * math.sqrt(r.n / nmax), tooltip=f"{r.n} mallard(s)").add_to(lg)
        lg.add_to(m)
        for pre, nm, col in (("b", "banding sites", BAND_COLOR), ("e", "recovery sites", RECOV_COLOR)):
            s = bbl.groupby([pre + "lat", pre + "lon"]).size().reset_index(name="n")
            fg = folium.FeatureGroup(name=f"LAYER 2 · REAL · BBL {nm} (1° blocks)", show=False)
            for r in s.itertuples():
                folium.CircleMarker([getattr(r, pre + "lat"), getattr(r, pre + "lon")], radius=3 + 3 * math.log10(1 + r.n),
                                    color=col, weight=1, fill=True, fill_opacity=.6, tooltip=f"{nm}: {r.n:,} mallards").add_to(fg)
            fg.add_to(m)

    # ---- Layer 4: eBird (modeled)
    if ebd:
        folium.map.CustomPane("ebirdPane", z_index=350).add_to(m)   # draws beneath tracks and lines
        import datetime as _dt
        doy = _dt.date.today().timetuple().tm_yday
        def _dd(i):
            if not ebd["names"][i][:4].isdigit(): return 999
            d = abs(_dt.date.fromisoformat(ebd["names"][i]).timetuple().tm_yday - doy); return min(d, 365 - d)
        w0 = min(range(len(ebd["names"])), key=_dd)
        ov = folium.raster_layers.ImageOverlay(ebd["pngs"][w0], bounds=ebd["bounds"], opacity=0.75, pane="ebirdPane",
                                               name="MODELED · eBird mallard abundance (heat map)", show=False)
        ov.add_to(m)
        lbls = [_dt.date.fromisoformat(n).strftime('%b %d') if n[:4].isdigit() else n for n in ebd['names']]
        chips = "".join(f"<button class='chip' data-b='{json.dumps(b)}'>{nm}</button>" for nm, b in FOCUS_AREAS)
        js = f"""
        window.addEventListener('load', function(){{
          var map={m.get_name()}, ov={ov.get_name()}, imgs = {json.dumps(ebd['pngs'])}, names = {json.dumps(lbls)}, timer=null;
          var ctl = L.control({{position:'bottomleft'}});
          ctl.onAdd = function(){{ var d=L.DomUtil.create('div','dock');
            d.innerHTML="<div class='chips'>{chips}</div>"+
              "<div class='wk'><button id=ebplay aria-label='play'>&#9654;</button><input type=range min=0 max="+(imgs.length-1)+" value={w0} id=ebw>"+
              "<span id=ebl>"+names[{w0}]+"</span></div><div class='wksub'>Drag to show eBird mallard abundance by week (MODELED)</div>";
            L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; }};
          ctl.addTo(map);
          function setW(i){{ if(!map.hasLayer(ov)) ov.addTo(map); ov.setUrl(imgs[i]); document.getElementById('ebw').value=i; document.getElementById('ebl').innerText=names[i]; }}
          document.getElementById('ebw').addEventListener('input', function(e){{ setW(+e.target.value); }});
          document.getElementById('ebplay').addEventListener('click', function(){{
            var b=this; if(timer){{clearInterval(timer);timer=null;b.innerHTML='&#9654;';return;}}
            b.innerHTML='&#10074;&#10074;'; timer=setInterval(function(){{ var i=(+document.getElementById('ebw').value+1)%imgs.length; setW(i); }}, 900); }});
          document.querySelectorAll('.dock .chip').forEach(function(c){{ c.addEventListener('click', function(){{
            document.querySelectorAll('.dock .chip').forEach(function(x){{x.classList.remove('on')}}); c.classList.add('on');
            var b=JSON.parse(c.dataset.b); map.flyToBounds([[b[0],b[1]],[b[2],b[3]]], {{padding:[10,10], duration:0.8}}); }}); }});
          document.querySelector('.dock .chip').classList.add('on');
        }});"""
        m.get_root().script.add_child(Element(js))

    te = summary.get("top_eb")
    if te is not None and len(te):
        hs = folium.FeatureGroup(name="MODELED · Top 10 mallard hot spots (eBird, duck season)", show=True)
        for i, r in te.iterrows():
            folium.Marker([r.lat, r.lon], tooltip=f"#{i+1} season hot spot (MODELED) · {r.lat:.3f}, {r.lon:.3f} · near {r.nearest_reference_site}",
                          icon=folium.DivIcon(icon_size=(22, 22), icon_anchor=(11, 11),
                              html=f'<div style="background:#1a365d;color:#fff;border:2px solid #fff;border-radius:11px;width:22px;height:22px;line-height:18px;text-align:center;font:bold 11px sans-serif;box-shadow:0 1px 3px #0006">{i+1}</div>')).add_to(hs)
        hs.add_to(m)
    m.fit_bounds([[MT_BBOX[1], MT_BBOX[0]], [MT_BBOX[3], MT_BBOX[2]]], padding=(4, 4))
    folium.LayerControl(collapsed=True).add_to(m)
    m.get_root().script.add_child(Element(f"""window.addEventListener('load',function(){{
      var map={m.get_name()}, c=document.querySelector('.leaflet-control-layers'), list=c.querySelector('.leaflet-control-layers-list');
      var h=document.createElement('div'); h.className='lc-close'; h.innerHTML='<span>Layers</span><button class="xbtn" aria-label="close layers">&#10005;</button>';
      list.insertBefore(h, list.firstChild);
      h.querySelector('button').addEventListener('click', function(e){{ e.stopPropagation(); e.preventDefault(); c.classList.remove('leaflet-control-layers-expanded'); }});
      map.on('click', function(){{ c.classList.remove('leaflet-control-layers-expanded'); }});
      var tg=c.querySelector('.leaflet-control-layers-toggle');
      ['click','touchend'].forEach(function(ev){{ tg.addEventListener(ev, function(e){{ e.preventDefault(); e.stopPropagation();
        c.classList.add('leaflet-control-layers-expanded'); }}, true); }});
      L.DomEvent.off(c, 'mouseleave'); c.onmouseleave=null;
      if (window.innerWidth > 700) document.getElementById('legend').classList.add('open');
    }});"""))

    # ---- legend + sources panel
    sw = "".join(f'<div><span style="display:inline-block;width:18px;height:4px;background:{c};margin-right:6px;vertical-align:middle"></span>{s}</div>' for s, c in SEASON_COLORS.items())
    eb_bar = ""
    if ebd:
        eb_bar = ('<div style="margin-top:6px"><b>Layer 4 · MODELED</b> eBird relative abundance<br>'
                  '<div style="height:8px;width:160px;background:linear-gradient(to right,#ffffd9,#7fcdbb,#1d91c0,#081d58)"></div>'
                  f'<div style="display:flex;justify-content:space-between;width:160px"><span>0</span><span>{ebd["vmax"]:.2g}+ (log)</span></div></div>')
    has_o = other is not None and len(other)
    row = lambda sym, txt: f'<div class="lg-row">{sym}<span>{txt}</span></div>'
    legend_tmpl = f"""
    <div id="legend">
      <div class="lg-head"><b>Legend</b><button class="xbtn" aria-label="close legend" onclick="document.getElementById('legend').classList.remove('open')">&#10005;</button></div>
      <div class="lg-body">
      <div class="lg-sec">REAL · measured birds</div>
      {row('<i class="sw" style="background:#c05621"></i>', 'Blue-winged teal flight paths, duck season <i>(not mallard)</i>') if has_o else ''}
      {row('<i class="dot" style="background:#ed8936;border:1px solid #7b341e"></i>', 'Where teal stayed ≥3 days (size = days)') if has_o else ''}
      {row('<i class="sw" style="background:#2b6cb0"></i>', 'Mallard GPS tracks — <b style="color:#c53030">none public</b>') if not len(gps) else row('<i class="sw" style="background:#2b6cb0"></i>', 'Mallard GPS tracks')}
      {row(f'<i class="sw" style="background:{PAIR_COLOR}"></i>', 'Mallard band → recovery' + (' — <b style="color:#c53030">not loaded yet</b>' if not len(bbl) else ''))}
      <div class="lg-sec">MODELED · estimates</div>
      {row('<i class="num">1</i>', 'Top 10 mallard hot spots, duck season (eBird)')}
      {'<div class="lg-row"><i class="sw" style="background:linear-gradient(to right,#ffffd9,#7fcdbb,#1d91c0,#081d58);width:40px"></i><span>Abundance by week — drag the slider</span></div>' if ebd else ''}
      <div class="lg-sec">Reference</div>
      {row('<i style="color:#7a9a84;font-style:normal">&#9873;</i>', 'Refuge / WMA · topo shows marsh &amp; water')}
      {{usgs_link}}
      <div style="margin-top:8px"><a href="#" onclick="var s=document.getElementById('srcpanel');s.style.display=s.style.display=='none'?'block':'none';return false">Sources &amp; notes</a></div>
      </div>
    </div>
    <button id="lgbtn" onclick="document.getElementById('legend').classList.add('open')">Legend</button>"""
    usgs_link, usgs_panel = "", ""
    if usgs:
        usgs_link = ("<div style='margin-top:6px'><b>USGS 2018–2020 · REAL (summarized)</b><br>"
                     "<a href='#' onclick=\"var s=document.getElementById('usgspanel');s.style.display=s.style.display=='none'?'block':'none';return false\">"
                     "Movement summary (no map coordinates)</a></div>")
        rows = "".join(f"<tr><td>{'Migration (&gt;310 km)' if k == 'M' else 'Regional (25–310 km)'}</td><td>{int(v['count'])}</td>"
                       f"<td>{v['50%']:,.0f} km</td><td>{v['min']:,.0f}–{v['max']:,.0f} km</td></tr>" for k, v in usgs.get("dist", {}).items())
        fm = usgs.get("first_mig", {})
        bb = usgs.get("bbox")
        usgs_panel = f"""
    <div id="usgspanel" style="display:none;position:fixed;top:60px;left:60px;width:520px;max-width:90vw;max-height:80vh;overflow:auto;z-index:10000;
         background:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 2px 12px #0006;font:12px/1.45 sans-serif">
      <div style="float:right;cursor:pointer" onclick="this.parentNode.style.display='none'">&#10005;</div>
      <h3 style="margin:0 0 4px;font-size:15px">USGS mallard movements, 2018–2020 <span style="font-weight:normal;color:#666">REAL · summarized</span></h3>
      <p style="margin:0 0 6px"><b>{usgs.get('birds','?')} juvenile mallards</b> tagged in North &amp; South Dakota
        ({', '.join(f'{k}: {v}' for k, v in usgs.get('birds_by_year', {}).items())}; {usgs.get('sex', {}).get('F', 0)} F / {usgs.get('sex', {}).get('M', 0)} M),
        {usgs.get('moves','?')} movements between {usgs.get('use_areas', usgs.get('moves','?'))} local use areas, 20 Sep–28 Feb.</p>
      <p style="margin:0 0 6px;color:#9b2c2c"><b>Why it isn't on the map:</b> the public release gives each movement's distance and
        compass bearing, but no latitude/longitude. {f"Its extent begins at {abs(bb['westbc'])}° W, east of Montana (border ≈104.05° W), so <b>0 of these birds' locations are in Montana</b>." if bb else ""}</p>
      <div style="display:flex;gap:12px;align-items:center">{rose_svg(usgs['rose']) if 'rose' in usgs else ''}
        <div><span style="color:#c53030">&#9644;</span> migration bearings<br><span style="color:#3182ce">&#9644;</span> regional bearings<br>
        <span style="color:#666">(bar length = number of moves per 22.5° sector)</span><br><br>
        First migration: <b>{fm.get('n','?')}</b> birds, median <b>{fm.get('median_km',0):,.0f} km</b>, mean heading <b>{fm.get('mean_bearing',0):.0f}°</b> (SSE)</div></div>
      <table style="border-collapse:collapse;margin-top:6px" cellpadding="3"><tr style="background:#f2f2f2"><th align=left>Type</th><th>Moves</th><th>Median</th><th>Range</th></tr>{rows}</table>
      <p style="color:#666;margin-top:6px">{SOURCES['usgs'][0]}</p>
    </div>"""
    src_items = []
    for st, meta in studies.items():
        src_items.append(f"<li><b>REAL · Movebank:</b> {st}. {meta.get('citation') or 'Citation: see the study page on movebank.org.'} "
                         f"<i>License: {meta.get('license') or 'see Movebank study license terms'}</i></li>")
    for st, meta in (other_studies or {}).items():
        src_items.append(f"<li><b>REAL · Movebank (other waterfowl, not mallard):</b> {st}. {meta.get('citation','')} <i>License: {meta.get('license','')}</i></li>")
    if summary.get("has_usgs"):
        src_items.append(f"<li><b>REAL · USGS:</b> {SOURCES['usgs'][0]} <i>{SOURCES['usgs'][1]}</i></li>")
    if len(bbl):
        src_items.append(f"<li><b>REAL · Banding:</b> {SOURCES['bbl'][0].format(version=bbl_version)} <i>{SOURCES['bbl'][1]}</i></li>")
    if ebd:
        src_items.append(f"<li><b>MODELED · eBird:</b> {SOURCES['ebird'][0].format(citation=ebd['citation'])} <i>{SOURCES['ebird'][1]}</i></li>")
    src_items.append(f"<li><b>Reference:</b> {SOURCES['ne'][0]} <i>{SOURCES['ne'][1]}</i>"
                     + (f" {SOURCES['nwi'][0]}" if nwi is not None else "") + " Refuge markers are approximate centers, not boundaries.</li>")
    panel = f"""
    <div id="srcpanel" style="display:none;position:fixed;top:60px;left:60px;right:60px;max-height:70vh;overflow:auto;z-index:10000;
         background:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 2px 12px #0006;font:12px/1.45 sans-serif">
      <div style="float:right;cursor:pointer" onclick="this.parentNode.style.display='none'">&#10005;</div>
      <h3 style="margin:0 0 6px;font-size:15px">Sources, citations &amp; data types</h3>
      <p><b>REAL</b> = measured locations of individual birds (GPS, bands). <b>DERIVED</b> = computed from real GPS.
         <b>MODELED</b> = statistical estimate (eBird S&amp;T), not individual birds.</p>
      <ul>{''.join(src_items)}</ul>
      <h4 style="margin:8px 0 4px">Processing notes</h4><ul>{''.join(f'<li>{x}</li>' for x in LOG)}</ul>
    </div>"""
    title = ('<div id="maptitle" style="position:fixed;top:10px;left:55px;z-index:9999;background:#fff;padding:6px 12px;border-radius:6px;'
             'font:bold 15px sans-serif;box-shadow:0 1px 5px #0005">Montana ducks · movement &amp; hot spots</div>')
    legend = legend_tmpl.replace("{usgs_link}", usgs_link)
    m.get_root().html.add_child(Element(title + legend + panel + usgs_panel))
    m.save(args.out)


def inline_assets(html_path, assets_dir=None):
    """Embed the map's JS/CSS libraries so the HTML works offline (base tiles still need internet).
    Uses a local copy in assets_dir when present, else downloads from the CDN; failures stay as links."""
    import re
    html = Path(html_path).read_text()
    def get(url):
        name = url.rsplit("/", 1)[-1]
        if assets_dir and (Path(assets_dir) / name).exists():
            return (Path(assets_dir) / name).read_text()
        try:
            return urllib.request.urlopen(url, timeout=20).read().decode("utf-8")
        except Exception:
            return None
    n = 0
    for tag, url in re.findall(r'(<script src="(https?://[^"]+)"></script>)', html):
        js = get(url)
        if js: html = html.replace(tag, "<script>" + js.replace("</script>", "<\\/script>") + "</script>"); n += 1
    for tag, url in re.findall(r'(<link rel="stylesheet" href="(https?://[^"]+)"/>)', html):
        if "fontawesome" in url or "awesome" in url or "highlight" in url:  # icon fonts not used by this map
            html = html.replace(tag, ""); continue
        css = get(url)
        if css:
            def embed(mm, base=url.rsplit("/", 1)[0] + "/"):   # relative images (e.g. Leaflet's layers.png) -> data URIs
                rel = mm.group(1).strip("'\"")
                if rel.startswith(("data:", "http", "#")): return mm.group(0)
                try:
                    b = urllib.request.urlopen(base + rel, timeout=20).read()
                    return f"url(data:image/{rel.rsplit('.', 1)[-1]};base64,{base64.b64encode(b).decode()})"
                except Exception:
                    return f"url({base + rel})"
            css = re.sub(r"url\(([^)]+)\)", embed, css)
            html = html.replace(tag, "<style>" + css + "</style>"); n += 1
    Path(html_path).write_text(html)
    log(f"Inlined {n} JS/CSS libraries into the HTML (works offline except base-map tiles).")


# ----------------------------------------------------------------------------- report
def write_report(path, summary, top_gps, top_eb, bbl, events, nonspatial, usgs=None, other_top=None, data_dir=None):
    L = ["# Mallard movement map — data report\n"]
    s = summary
    L.append("## Inside Montana\n")
    L.append("| Data | Type | Total | In Montana |\n|---|---|---|---|")
    L.append(f"| Mallard GPS birds | REAL | {s.get('gps_birds',0):,} | {s.get('gps_mt_birds',0):,} |")
    L.append(f"| Mallard GPS tracks (bird × season trips) | REAL | {s.get('gps_tracks',0):,} | {s.get('gps_mt_tracks',0):,} |")
    L.append(f"| Mallard GPS locations (cleaned, ≤1/h) | REAL | {s.get('gps_fixes',0):,} | {s.get('gps_mt_fixes',0):,} |")
    if usgs:
        L.append(f"| USGS 2018–2020 birds / movements | REAL (summarized, no coordinates) | {usgs.get('birds',0)} / {usgs.get('moves',0)} | 0 (extent starts {abs(usgs.get('bbox',{}).get('westbc',0))}° W) |")
    else:
        L.append(f"| USGS movement events | REAL (summarized) | {len(events):,} | {s.get('ev_mt',0):,} touch MT |")
    L.append(f"| BBL band→recovery pairs | REAL (1° blocks) | {len(bbl):,} | {s.get('bbl_bmt',0):,} banded in MT · {s.get('bbl_emt',0):,} recovered in MT |")
    L.append(f"| Mallard stopovers (>3 d within {STOPOVER_RADIUS_KM:g} km) | DERIVED | {s.get('stops',0):,} | {s.get('stops_mt',0):,} |")
    L.append(f"| eBird weekly relative abundance | MODELED | 52 weeks, 9 km cells | clipped to MT |")
    if s.get("o_birds"):
        L.append(f"| Other waterfowl satellite (Argos) birds / fixes ({s['o_names']}, NOT mallard) | REAL | {s['o_birds']} / {s['o_fixes']:,} | {s['o_mt_birds']} / {s['o_mt_fixes']:,} |")
        L.append(f"| Other waterfowl stopovers (approx.) | DERIVED | {s['o_stops']:,} | {s['o_stops_mt']:,} |")
    L.append("")
    if s.get("gps_fixes", 0) and not s.get("gps_mt_fixes"):
        L.append(f"**No GPS location falls inside Montana.** GPS layers are labeled by region: {s.get('gps_regions')}.\n")
    elif not s.get("gps_fixes"):
        L.append("**No mallard GPS crosses Montana.** No public mallard GPS study covering MT/ND/SD/AB/SK/ID was found on Movebank or in "
                 "the Movebank Data Repository, and the USGS 2018–2020 release has no coordinates. Mallard GPS layers are empty; "
                 "the only REAL tracks shown are blue-winged teal (a different species, Argos satellite fixes), labeled by region.\n")
    for title, t, unit in (("Top 10 time-spent areas — REAL mallard GPS (stopover bird-days)", top_gps, "bird-days"),
                           (f"Top 10 duck-season hot spots in Montana — MODELED eBird mean weekly relative abundance, {SEASON_WINDOW[0]} to {SEASON_WINDOW[1]} (a proxy, not time spent)", top_eb, "mean rel. abundance"),
                           (f"Top 10 time-spent areas in {'/'.join(TARGET_REGIONS)} — REAL blue-winged teal Argos, NOT mallard (stopover bird-days, by region)", other_top, "bird-days")):
        L.append(f"## {title}\n")
        if t is None or not len(t):
            L.append("_None — no mallard GPS available (see above)._\n" if "mallard" in title else "_Not available (input missing)._\n"); continue
        L.append(f"| # | Lat | Lon | {unit} | Birds | Region | Nearest reference site |\n|---|---|---|---|---|---|---|")
        for i, r in t.iterrows():
            L.append(f"| {i+1} | {r.lat:.3f} | {r.lon:.3f} | {r.w:,.2f} | {r.get('birds','–')} | {r.get('region','MT')} | {r.nearest_reference_site} |")
        L.append("")
    if usgs:
        fm = usgs.get("first_mig", {})
        L.append("## USGS 2018–2020 movement summary (REAL, no coordinates)\n")
        by = usgs.get('by_type', {}); sx = usgs.get('sex', {})
        L.append(f"- {usgs.get('birds')} juvenile birds tagged in ND/SD (" + ", ".join(f"{k}: {v}" for k, v in usgs.get('birds_by_year', {}).items())
                 + f"; {sx.get('F',0)} F / {sx.get('M',0)} M); {usgs.get('moves')} movements ({by.get('M',0)} migration, {by.get('R',0)} regional).")
        for k, v in usgs.get("dist", {}).items():
            L.append(f"- {'Migration' if k=='M' else 'Regional'}: n={int(v['count'])}, median {v['50%']} km, range {v['min']}–{v['max']} km.")
        L.append(f"- First migration: n={fm.get('n')}, median {fm.get('median_km',0):.0f} km, mean bearing {fm.get('mean_bearing',0):.0f}°.")
        L.append(f"- Timing table: {usgs.get('t_rows')} exposure records, {usgs.get('exposure_days')} bird-days.\n")
    if nonspatial:
        L.append("## USGS tables without coordinates\n")
        for d in nonspatial:
            L.append(f"- {d['_file'].iloc[0]}: {len(d):,} rows; columns: {', '.join(d.columns[:25])}")
        L.append("")
    for nf in sorted(glob.glob(str(Path(data_dir or "data") / "notes" / "*.md"))):
        L.append(Path(nf).read_text().strip() + "\n")
    L.append("## Cleaning steps & assumptions\n")
    L += [f"- {x}" for x in LOG]
    L += [f"- Seasons by calendar month: " + "; ".join(f"{k}: {', '.join(str(mm) for mm, v in SEASONS.items() if v == k)}" for k in SEASON_COLORS),
          f"- Time spent per fix = time to the bird's next fix, capped at {MAX_GAP_HOURS:g} h (gaps are not counted as presence).",
          f"- Stopover = consecutive fixes all within {STOPOVER_RADIUS_KM:g} km of the first fix, lasting ≥ {STOPOVER_MIN_HOURS/24:g} days.",
          "- Top-10 areas: ~10 km grid cells ranked by total weight, then picked greedily ≥ 20 km apart so each is a distinct area.",
          "- 'Track' = one bird's continuous run within one season. 'Bird' = unique individual per study.",
          "- Montana boundary: Natural Earth 1:50m admin-1 (±1 km at the state line)."]
    Path(path).write_text("\n".join(L))


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data"); ap.add_argument("--ref", default="reference")
    ap.add_argument("--out", default="mallard_montana_map.html"); ap.add_argument("--report", default="report.md")
    ap.add_argument("--assets", default=None, help="optional folder with local copies of leaflet.js etc.")
    args = ap.parse_args()
    data, ref = Path(args.data), Path(args.ref)
    print("Reference layers"); adm, mt_geom, rivers, lakes, nwi = load_reference(ref, data)

    print("GPS"); mb, studies = load_movebank(data)
    ufix, events, nonspatial = load_usgs(data)
    gps = clean_gps(pd.concat([x for x in (mb, ufix) if len(x)]) if (len(mb) or len(ufix)) else pd.DataFrame(), adm)
    summary = {"has_usgs": bool(len(ufix) or len(events) or nonspatial)}
    usgs = usgs_summary(nonspatial, data) if nonspatial else None
    stops, resid = pd.DataFrame(), pd.DataFrame()
    if len(gps):
        gps["track"] = gps["bird"] + "#" + (gps.groupby("bird")["season"].transform(lambda s: (s != s.shift()).cumsum())).astype(str)
        inmt = gps[gps.region == "MT"]
        summary.update(gps_birds=gps.bird.nunique(), gps_tracks=gps.track.nunique(), gps_fixes=len(gps),
                       gps_mt_birds=inmt.bird.nunique(), gps_mt_tracks=inmt.track.nunique(), gps_mt_fixes=len(inmt),
                       gps_regions=", ".join(f"{k} ({v:,})" for k, v in gps.region.value_counts().items()))
        resid, stops = residence(gps), stopovers(gps)
        summary.update(stops=len(stops), stops_mt=int((stops.region == "MT").sum()) if len(stops) else 0)
    if len(events):
        from shapely import prepared
        pm = prepared.prep(mt_geom)
        summary["ev_mt"] = int(sum(pm.intersects(LineString([(a, b), (c, d)])) for a, b, c, d in events[["lon0", "lat0", "lon1", "lat1"]].values))
    print("Other waterfowl"); mb_o, other_studies = load_movebank(data, "movebank_other", taxon=None)
    other, other_top = None, pd.DataFrame()
    if len(mb_o):
        other = clean_gps(mb_o, adm, label="Other-waterfowl GPS (Argos)")
        ost = stopovers(other)
        ost_r = ost[ost.region.isin(TARGET_REGIONS)] if len(ost) else ost
        other_top = top_areas(ost_r, "days") if len(ost_r) else pd.DataFrame()
        log("Other waterfowl are Argos satellite fixes (error ~0.25 km to >10 km), so their stopovers are approximate; "
            f"their top-10 list is limited to {', '.join(TARGET_REGIONS)}.")
        summary.update(o_birds=other.bird.nunique(), o_fixes=len(other), o_mt_birds=other[other.region == "MT"].bird.nunique(),
                       o_mt_fixes=int((other.region == "MT").sum()), o_stops=len(ost), o_stops_mt=int((ost.region == "MT").sum()) if len(ost) else 0,
                       o_regions=", ".join(f"{k} ({v:,})" for k, v in other.region.value_counts().items()),
                       o_names=", ".join(sorted({m.get("common_name", k) for k, m in other_studies.items()})))
    print("Banding"); bbl, bbl_version = load_bbl(data, adm, mt_geom)
    if len(bbl):
        summary.update(bbl_bmt=int(bbl.b_mt.sum()), bbl_emt=int(bbl.e_mt.sum()))
    print("eBird"); ebd = load_ebird(data, mt_geom)

    top_gps = top_areas(stops, "days") if len(stops) else pd.DataFrame()
    summary["top_gps"] = top_gps
    top_eb = top_areas(ebd["cells"], "score", how="mean", sep_km=30) if ebd else None
    summary["top_eb"] = top_eb

    print("Map"); build_map(args, adm, mt_geom, rivers, lakes, nwi, gps, events, bbl, ebd, stops, resid, studies, bbl_version, summary, usgs,
                          other, other_studies)
    inline_assets(args.out, args.assets)
    write_report(args.report, summary, top_gps, top_eb, bbl, events, nonspatial, usgs, other_top, data)
    pd.concat([t.assign(source=s) for t, s in ((top_gps, "REAL GPS mallard"), (top_eb, "MODELED eBird mallard"),
                                               (other_top, "REAL GPS blue-winged teal (not mallard)")) if t is not None and len(t)]
              or [pd.DataFrame()]).to_csv("top10_areas.csv", index=False)
    print(f"\nWrote {args.out}, {args.report}, top10_areas.csv")


if __name__ == "__main__":
    main()
