"""Fetch locations for openly-downloadable Movebank studies via the public JSON service."""
import json, sys, time, urllib.parse, urllib.request
import pandas as pd
B = "https://www.movebank.org/movebank/service/public/json?"
def get(params):
    with urllib.request.urlopen(B + urllib.parse.urlencode(params, doseq=True), timeout=300) as r:
        return json.loads(r.read())
sid, sensor, out = sys.argv[1], sys.argv[2], sys.argv[3]
inds = [i["local_identifier"] for i in get({"entity_type": "individual", "study_id": sid})]
rows = []
for k in range(0, len(inds), 20):
    j = get({"study_id": sid, "individual_local_identifiers": inds[k:k+20], "sensor_type": sensor, "max_events_per_individual": 100000})
    for ind in j.get("individuals", []):
        for e in ind.get("locations", []):
            rows.append({"individual_local_identifier": ind["individual_local_identifier"], "timestamp": pd.to_datetime(e["timestamp"], unit="ms", utc=True),
                         "location_long": e["location_long"], "location_lat": e["location_lat"],
                         "individual_taxon_canonical_name": ind.get("individual_taxon_canonical_name"), "study_name": ind.get("study_name", sid)})
    time.sleep(0.5)
d = pd.DataFrame(rows); d.to_csv(out, index=False)
reg = d[d.location_long.between(-120, -96) & d.location_lat.between(42, 60)]
print(sid, len(inds), "individuals", len(d), "fixes; taxa", d.individual_taxon_canonical_name.unique()[:3],
      "| in MT/ND/SD/AB/SK/ID box:", len(reg), "fixes,", reg.individual_local_identifier.nunique(), "birds")
