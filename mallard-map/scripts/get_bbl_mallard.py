#!/usr/bin/env python3
"""Cut the North American Bird Banding Program dataset (1960-2026, doi:10.5066/P1CCONUX) down to
Mallards (SPECIES_ID 1320) banded OR encountered in Montana, for mallard_map.py.

ScienceBase blocks scripted downloads, so get the files in a browser first:
  https://www.sciencebase.gov/catalog/item/6aa98c981ba49b8cd545a29f
  1) README_before_download_2026.txt  -> tells you which group (grp_XX) holds species 1320 (Mallard)
  2) that group's zip (and NABBP_lookups_2026.zip if you want code descriptions)
Put the zip(s) or NABBP_2026_grp_XX.csv in data/bbl/raw/ and run:
  python get_bbl_mallard.py
Writes data/bbl/NABBP_2026_mallard_MT.csv (all B and E records for every band that touches US-MT).
"""
import glob, io, zipfile
from pathlib import Path
import pandas as pd

RAW, OUT = Path("data/bbl/raw"), Path("data/bbl/NABBP_2026_mallard_MT.csv")
COLS = ["RECORD_ID", "EVENT_TYPE", "BAND", "ORIGINAL_BAND", "EVENT_DATE", "EVENT_MONTH", "EVENT_YEAR", "SPECIES_ID",
        "ISO_COUNTRY", "ISO_SUBDIVISION", "LAT_DD", "LON_DD", "COORD_PREC", "AGE_CODE", "SEX_CODE",
        "HOW_OBTAINED", "PRESENT_CONDITION", "RECORD_SOURCE"]


def sources():
    for z in sorted(RAW.glob("*.zip")):
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.lower().endswith(".csv") and "grp_" in n.lower():
                    yield n, lambda zf=zf, n=n: io.TextIOWrapper(zf.open(n), encoding="utf-8")
    for c in sorted(RAW.glob("*grp_*.csv")):
        yield c.name, lambda c=c: open(c, encoding="utf-8")


def main():
    keep = []
    for name, opener in sources():
        n = 0
        with opener() as fh:
            for ch in pd.read_csv(fh, chunksize=500_000, dtype=str, usecols=lambda c: c.upper() in COLS):
                ch.columns = [c.upper() for c in ch.columns]
                m = ch[pd.to_numeric(ch.SPECIES_ID, errors="coerce") == 1320]
                n += len(m); keep.append(m)
        print(f"{name}: {n:,} mallard records")
    d = pd.concat(keep, ignore_index=True) if keep else pd.DataFrame(columns=COLS)
    mt_bands = set(d.loc[d.ISO_SUBDIVISION == "US-MT", "ORIGINAL_BAND"])
    d = d[d.ORIGINAL_BAND.isin(mt_bands)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(OUT, index=False)
    print(f"wrote {OUT}: {len(d):,} records, {len(mt_bands):,} bands touching Montana "
          f"({(d.EVENT_TYPE == 'B').sum():,} banding, {(d.EVENT_TYPE == 'E').sum():,} encounter/recapture rows)")


if __name__ == "__main__":
    main()
