#!/usr/bin/env python3
"""Download eBird Status & Trends Mallard (mallar3) weekly relative abundance, 9 km, straight
from st-download.ebird.org (no R), crop to Montana + buffer, and write data/ebird/*.tif + citation.txt.

Usage: EBIRDST_KEY=xxxx python get_ebird_mallard.py [--year 2025]
"""
import argparse, json, os, sys, urllib.request
from pathlib import Path

API = "https://st-download.ebird.org/v1/"
SPECIES = "mallar3"
MT_BBOX = (-116.6, 43.8, -103.5, 49.5)   # Montana + ~0.5 deg buffer, lon/lat


def get(url):
    with urllib.request.urlopen(url, timeout=600) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default=None, help="S&T version year (default: newest available)")
    ap.add_argument("--out", default="data/ebird")
    a = ap.parse_args()
    key = os.environ.get("EBIRDST_KEY") or sys.exit("Set EBIRDST_KEY")
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); raw = out / "raw"; raw.mkdir(exist_ok=True)
    years = [a.year] if a.year else [str(y) for y in range(2030, 2021, -1)]
    for year in years:
        objs = json.loads(get(f"{API}list-obj/{year}/{SPECIES}?key={key}"))
        if objs:
            break
    else:
        sys.exit("No S&T version found for mallar3")
    want = f"{year}/{SPECIES}/weekly/{SPECIES}_abundance_median_9km_{year}.tif"
    assert want in objs, f"{want} not listed"
    for obj in (want, f"{year}/{SPECIES}/config.json"):
        p = raw / Path(obj).name
        if not p.exists():
            print("downloading", obj)
            p.write_bytes(get(f"{API}fetch?objKey={obj}&key={key}"))
    # crop to Montana window, keep week dates as band names
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    cfg = json.loads((raw / "config.json").read_text())
    src_p = raw / Path(want).name
    with rasterio.open(src_p) as src:
        b = transform_bounds("EPSG:4326", src.crs, *MT_BBOX, densify_pts=50)
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        data = src.read(window=win)
        prof = src.profile.copy()
        prof.update(height=data.shape[1], width=data.shape[2], transform=src.window_transform(win), compress="deflate")
        names = list(src.descriptions)
        if not any(names):
            # weekly band dates: 52 weeks, mid-week dates of the S&T year
            import datetime as dt
            names = [(dt.date(int(year), 1, 4) + dt.timedelta(weeks=i)).isoformat() for i in range(src.count)]
        dst = out / f"mallard_abundance_median_weekly_9km_MT_{year}.tif"
        with rasterio.open(dst, "w", **prof) as d:
            d.write(data)
            for i, n in enumerate(names, 1):
                d.set_band_description(i, n)
    cit = (f"Fink, D., T. Auer, A. Johnston, M. Strimas-Mackey, et al. eBird Status and Trends, Data Version: {year}. "
           "Cornell Lab of Ornithology, Ithaca, New York. Full author list, release year and DOI for this version: "
           "https://science.ebird.org/status-and-trends/data-access (the 2023 version is https://doi.org/10.2173/WZTW8903).")
    (out / "citation.txt").write_text(
        cit + f"\nProduct: {SPECIES} weekly abundance (median), 9 km, {len(names)} weeks; cropped to Montana bbox {MT_BBOX}."
        f"\nDownloaded via st-download.ebird.org API. Model run: {cfg.get('run_name', cfg.get('RUN_NAME', 'n/a'))}."
        "\nTerms: eBird Status & Trends data products — non-commercial use, attribution required.\n")
    print("wrote", dst, "bands:", len(names), names[:3], "...")


if __name__ == "__main__":
    main()
