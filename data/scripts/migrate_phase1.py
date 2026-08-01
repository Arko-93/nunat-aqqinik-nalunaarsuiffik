#!/usr/bin/env python3
"""One-time Phase 1 migration from the retired flat source model."""
import json
import os
import sys
import uuid
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "source"
os.makedirs(SRC, exist_ok=True)

def r(name):
    with open(os.path.join(SRC, name)) as f:
        return [json.loads(l) for l in f if l.strip()]

def w(name, rows):
    with open(os.path.join(SRC, name), "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} rows to {name}")

places = r("places.ndjson")  # old flat records
if places and "canonical_name" not in places[0]:
    sys.exit("Phase 1 migration already applied; canonical sources were not modified.")

# --- places.ndjson: durable identity only ---
new_places = []
for p in places:
    new_places.append({
        "id": p["id"],
        "status": p["status"],
        "created_at": p["updated_at"],
        "retired_at": None,
        "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}]
    })
w("places.ndjson", new_places)

# --- place-classifications.ndjson ---
classifications = []
for p in places:
    classifications.append({
        "id": "cls_" + str(uuid.uuid4()),
        "place_id": p["id"],
        "feature_type": p["feature_type"],
        "valid_from": None,
        "valid_to": None,
        "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}],
        "observed_at": p["updated_at"]
    })
w("place-classifications.ndjson", classifications)

# --- place-names.ndjson ---
names = []
for p in places:
    cn = p["canonical_name"]
    names.append({
        "id": "nam_" + str(uuid.uuid4()),
        "place_id": p["id"],
        "value": cn["value"],
        "language": cn["language"],
        "kind": "official",
        "valid_from": None,
        "valid_to": None,
        "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}],
        "observed_at": p["updated_at"]
    })
    for an in p.get("alternate_names", []):
        names.append({
            "id": "nam_" + str(uuid.uuid4()),
            "place_id": p["id"],
            "value": an["value"],
            "language": an["language"],
            "kind": an.get("kind", "exonym"),
            "valid_from": None,
            "valid_to": None,
            "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}],
            "observed_at": p["updated_at"]
        })
w("place-names.ndjson", names)

# --- place-geometries.ndjson ---
geoms = []
for p in places:
    geoms.append({
        "id": "geo_" + str(uuid.uuid4()),
        "place_id": p["id"],
        "geometry": {
            "type": "Point",
            "coordinates": [p["coordinates"]["longitude"], p["coordinates"]["latitude"]]
        },
        "valid_from": None,
        "valid_to": None,
        "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}],
        "observed_at": p["updated_at"]
    })
w("place-geometries.ndjson", geoms)

# --- administrative-areas.ndjson ---
municipalities = {}
for p in places:
    for m in p.get("administrative_memberships", []):
        if m["level"] == "municipality":
            municipalities[m["name"]] = m["level"]
adm_ids = {}
areas = []
for name, level in sorted(municipalities.items()):
    aid = "adm_" + str(uuid.uuid4())
    adm_ids[name] = aid
    areas.append({
        "id": aid,
        "name": name,
        "level": level,
        "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}]
    })
w("administrative-areas.ndjson", areas)

# --- administrative-memberships.ndjson ---
memberships = []
for p in places:
    for m in p.get("administrative_memberships", []):
        if m["level"] == "municipality":
            memberships.append({
                "id": "mem_" + str(uuid.uuid4()),
                "place_id": p["id"],
                "administrative_area_id": adm_ids[m["name"]],
                "valid_from": m.get("valid_from"),
                "valid_to": m.get("valid_to"),
                "source_refs": [{"source_id": "src_legacy_seed", "record_id": None}],
                "observed_at": p["updated_at"]
            })
w("administrative-memberships.ndjson", memberships)

# --- external-identifiers.ndjson (empty for now) ---
w("external-identifiers.ndjson", [])

# --- connection-services.ndjson (empty for now) ---
w("connection-services.ndjson", [])

# --- update sources.ndjson ---
src = r("sources.ndjson")[0]
src.update({
    "effective_from": None,
    "effective_to": None,
    "media_type": None,
    "checksum": None,
    "licence": None,
    "notes": src.get("notes") or "Migrated from the original seed. Replace with traceable record-level references before treating these assertions as verified."
})
w("sources.ndjson", [src])

print("Migration complete.")
