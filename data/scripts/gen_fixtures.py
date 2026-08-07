#!/usr/bin/env python3
"""Generate all test fixtures for Phase 1."""

import json
import os
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "tests"

def w(dirpath, fname, rows):
    os.makedirs(dirpath, exist_ok=True)
    with open(os.path.join(dirpath, fname), "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

fixture_id = 0


def u4():
    global fixture_id
    fixture_id += 1
    return f"00000000-0000-4000-8000-{fixture_id:012x}"

PLC1 = "plc_" + u4()
PLC2 = "plc_" + u4()
PLC3 = "plc_" + u4()
ADM1 = "adm_" + u4()
CON1 = "con_" + u4()
SRC1 = "src_" + u4()
SRC_LEGACY = "src_legacy_seed"

def place(pid, **kw):
    r = {"id": pid, "status": "active", "created_at": "2024-01-01", "retired_at": None, "source_refs": [{"source_id": SRC1, "record_id": None}]}
    r.update(kw); return r

def classification(cid, pid, **kw):
    r = {"id": cid, "place_id": pid, "feature_type": "town", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
    r.update(kw); return r

def name(nid, pid, **kw):
    r = {"id": nid, "place_id": pid, "value": "Test", "language": "kl", "kind": "official", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
    r.update(kw); return r

def source(sid, **kw):
    r = {"id": sid, "title": "Test", "publisher": None, "url": None, "retrieved_at": None, "effective_from": None, "effective_to": None, "media_type": None, "checksum": None, "licence": None, "verification_status": "verified", "notes": None}
    r.update(kw); return r

def connection(cid, o, d, **kw):
    r = {"id": cid, "origin_place_id": o, "destination_place_id": d, "direction": "bidirectional", "mode": "air", "created_at": "2024-01-01", "retired_at": None}
    r.update(kw); return r

def geometry(gid, pid, **kw):
    r = {"id": gid, "place_id": pid, "geometry": {"type": "Point", "coordinates": [-51.733, 64.175]}, "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
    r.update(kw); return r

def adm(aid, **kw):
    r = {"id": aid, "name": "Test Municipality", "level": "municipality", "source_refs": [{"source_id": SRC1, "record_id": None}]}
    r.update(kw); return r

def membership(mid, pid, aid, **kw):
    r = {"id": mid, "place_id": pid, "administrative_area_id": aid, "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
    r.update(kw); return r

def min_base(dp):
    w(dp, "places.ndjson", [place(PLC1), place(PLC2), place(PLC3)])
    w(dp, "place-classifications.ndjson", [
        classification("cls_"+u4(), PLC1),
        classification("cls_"+u4(), PLC2),
        classification("cls_"+u4(), PLC3),
    ])
    w(dp, "place-names.ndjson", [name("nam_"+u4(), PLC1)])
    w(dp, "place-geometries.ndjson", [])
    w(dp, "administrative-areas.ndjson", [adm(ADM1)])
    w(dp, "administrative-memberships.ndjson", [])
    w(dp, "external-identifiers.ndjson", [])
    w(dp, "connections.ndjson", [])
    w(dp, "connection-services.ndjson", [])
    w(dp, "sources.ndjson", [source(SRC1, verification_status="verified")])

# ===== VALID FIXTURES =====
vd = os.path.join(D, "valid")
w(vd, "places.ndjson", [place(PLC1)])
w(vd, "place-classifications.ndjson", [classification("cls_"+u4(), PLC1)])
w(vd, "place-names.ndjson", [name("nam_"+u4(), PLC1)])
w(vd, "place-geometries.ndjson", [geometry("geo_"+u4(), PLC1)])
w(vd, "administrative-areas.ndjson", [adm(ADM1)])
w(vd, "administrative-memberships.ndjson", [
    membership("mem_"+u4(), PLC1, ADM1, valid_from="2020-01-01", valid_to=None)
])
w(vd, "connections.ndjson", [connection(CON1, PLC1, PLC2)])
w(vd, "connection-services.ndjson", [
    {"id": "svc_"+u4(), "connection_id": CON1, "operator": "Test Air", "capabilities": ["passenger"], "seasonality": {"kind": "year_round", "months": []}, "frequency_band": "daily", "frequency_basis": "typical", "status": "active", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
])
w(vd, "external-identifiers.ndjson", [
    {"id": "xid_"+u4(), "entity_type": "place", "entity_id": PLC1, "namespace": "test", "value": "ABC123", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}]}
])
w(vd, "sources.ndjson", [source(SRC1)])

# ===== SCHEMA-LEVEL INVALID FIXTURES =====
inv = os.path.join(D, "invalid")

def invw(scenario, fname, rows):
    dp = os.path.join(inv, scenario)
    os.makedirs(dp, exist_ok=True)
    w(dp, fname, rows)

invw("malformed-id", "places.ndjson", [place("plc_not-a-uuid")])

invw("unknown-property", "places.ndjson", [place(PLC1, extra_field="should not exist")])

invw("invalid-date", "places.ndjson", [place(PLC1, created_at="2026-02-31")])

invw("bad-coordinates-lat", "place-geometries.ndjson", [
    geometry("geo_"+u4(), PLC1, geometry={"type": "Point", "coordinates": [-51.733, 91.0]})
])

invw("bad-coordinates-lon", "place-geometries.ndjson", [
    geometry("geo_"+u4(), PLC1, geometry={"type": "Point", "coordinates": [181.0, 64.0]})
])

invw("bad-geometry-type", "place-geometries.ndjson", [
    geometry("geo_"+u4(), PLC1, geometry={"type": "Polygon", "coordinates": [[[-51,64],[-51,65],[-52,65],[-52,64],[-51,64]]]})
])

invw("invalid-seasonality-month", "connection-services.ndjson", [
    {"id": "svc_"+u4(), "connection_id": CON1, "operator": None, "capabilities": ["passenger"], "seasonality": {"kind": "seasonal", "months": [13]}, "frequency_band": "weekly", "frequency_basis": "typical", "status": "active", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
])

# ===== CROSS-RECORD INVALID FIXTURES =====
cd = os.path.join(D, "cross")

def crossw(scenario, overrides):
    dp = os.path.join(cd, scenario)
    os.makedirs(dp, exist_ok=True)
    min_base(dp)
    for fname, rows in overrides.items():
        w(dp, fname, rows)

crossw("broken-fk", {"place-names.ndjson": [name("nam_"+u4(), "plc_00000000-0000-4000-8000-000000000000")]})

crossw("unknown-source", {"place-names.ndjson": [name("nam_"+u4(), PLC1, source_refs=[{"source_id": "src_nonexistent", "record_id": None}])]})

crossw("reversed-validity", {"place-names.ndjson": [name("nam_"+u4(), PLC1, valid_from="2024-06-01", valid_to="2024-01-01")]})

crossw("multiple-canonical", {"place-names.ndjson": [
    name("nam_"+u4(), PLC1, value="Nuuk"),
    name("nam_"+u4(), PLC1, value="Nuuks"),
]})

crossw("self-connection", {"connections.ndjson": [connection(CON1, PLC1, PLC1)]})

crossw("duplicate-edge", {"connections.ndjson": [
    connection(CON1, PLC1, PLC2),
    connection("con_"+u4(), PLC1, PLC2),
]})

crossw("duplicate-edge-reversed", {"connections.ndjson": [
    connection(CON1, PLC1, PLC2),
    connection("con_"+u4(), PLC2, PLC1),
]})

crossw("current-with-valid-to", {"place-names.ndjson": [name("nam_"+u4(), PLC1, valid_to="2024-12-31")]})

crossw("retired-no-date", {"places.ndjson": [place(PLC1), place(PLC2), place(PLC3), place("plc_"+u4(), status="retired", retired_at=None)]})

crossw("duplicate-id", {"places.ndjson": [place(PLC1), place(PLC2), place(PLC1)]})

crossw("pending-source", {"sources.ndjson": [source(SRC1, verification_status="verified"), source("src_"+u4(), verification_status="pending")]})

crossw("year-round-with-months", {
    "connections.ndjson": [connection(CON1, PLC1, PLC2)],
    "connection-services.ndjson": [
        {"id": "svc_"+u4(), "connection_id": CON1, "operator": None, "capabilities": ["passenger"], "seasonality": {"kind": "year_round", "months": [1]}, "frequency_band": "weekly", "frequency_basis": "typical", "status": "active", "valid_from": None, "valid_to": None, "source_refs": [{"source_id": SRC1, "record_id": None}], "observed_at": "2024-01-01"}
    ]
})

# duplicate-slug: two places may share an official KL name (Greenland homonyms).
# Validation must PASS; denormalized build suffixes the second slug (-2).
crossw("duplicate-slug", {"place-names.ndjson": [
    name("nam_"+u4(), PLC1, value="SamePlace"),
    name("nam_"+u4(), PLC2, value="SamePlace"),
    name("nam_"+u4(), PLC3, value="OtherPlace"),
]})

# retired-entity-active: retired place with current (valid_to=null) assertions
crossw("retired-entity-active", {
    "places.ndjson": [place(PLC1, status="retired", retired_at="2024-06-01"), place(PLC2), place(PLC3)],
    "place-names.ndjson": [name("nam_"+u4(), PLC1)],  # active name on retired place
    "place-geometries.ndjson": [geometry("geo_"+u4(), PLC1)],  # active geom on retired place
})

# assertion-pending-source: current assertion referencing pending source (publish-check)
crossw("assertion-pending-source", {
    "sources.ndjson": [
        source(SRC1, verification_status="verified"),
        source("src_pending_test", verification_status="pending"),
    ],
    "place-names.ndjson": [name("nam_"+u4(), PLC1, source_refs=[{"source_id": "src_pending_test", "record_id": None}])],
})

print("All test fixtures regenerated.")
