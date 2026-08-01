#!/usr/bin/env python3
"""Generate all Decision Geography JSON Schema files (no $ref, inline defs)."""
import json
import os
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "schema"

UUID4 = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
PLC = "^plc_" + UUID4[1:]
CLS = "^cls_" + UUID4[1:]
CON = "^con_" + UUID4[1:]
NAM = "^nam_" + UUID4[1:]
GEO = "^geo_" + UUID4[1:]
ADM = "^adm_" + UUID4[1:]
MEM = "^mem_" + UUID4[1:]
XID = "^xid_" + UUID4[1:]
SVC = "^svc_" + UUID4[1:]
SRC = "^src_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^src_[a-z]+(_[a-z]+)*$"

SR = {
    "type": "object", "additionalProperties": False,
    "required": ["source_id", "record_id"],
    "properties": {
        "source_id": {"type": "string"},
        "record_id": {"type": ["string", "null"]}
    }
}

DATE = {"type": ["string", "null"], "format": "date", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"}
SREF = {"type": "array", "minItems": 1, "items": SR}

def schema(uid, title, props, required):
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": uid,
        "title": title,
        "type": "object",
        "additionalProperties": False,
        "required": required,
        "properties": props
    }

def w(name, content):
    with open(os.path.join(D, name), "w") as f:
        json.dump(content, f, indent=2)
    print(f"Wrote {name}")

w("place.schema.json", schema(
    "urn:decision-geography:schema:place",
    "Decision Geography place identity",
    {
        "id": {"type": "string", "pattern": PLC},
        "status": {"enum": ["active", "historical", "retired"]},
        "created_at": {"type": "string", "format": "date"},
        "retired_at": DATE,
        "source_refs": SREF
    },
    ["id", "status", "created_at", "source_refs"]
))

w("place-name.schema.json", schema(
    "urn:decision-geography:schema:place-name",
    "Decision Geography place name assertion",
    {
        "id": {"type": "string", "pattern": NAM},
        "place_id": {"type": "string", "pattern": PLC},
        "value": {"type": "string", "minLength": 1},
        "language": {"type": "string", "minLength": 2},
        "kind": {"enum": ["official", "exonym", "historical", "alias"]},
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF,
        "observed_at": {"type": "string", "format": "date"}
    },
    ["id", "place_id", "value", "language", "kind", "source_refs", "observed_at"]
))

w("place-classification.schema.json", schema(
    "urn:decision-geography:schema:place-classification",
    "Decision Geography place classification assertion",
    {
        "id": {"type": "string", "pattern": CLS},
        "place_id": {"type": "string", "pattern": PLC},
        "feature_type": {"type": "string", "minLength": 1},
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF,
        "observed_at": {"type": "string", "format": "date"}
    },
    ["id", "place_id", "feature_type", "source_refs", "observed_at"]
))

w("place-geometry.schema.json", schema(
    "urn:decision-geography:schema:place-geometry",
    "Decision Geography place geometry assertion",
    {
        "id": {"type": "string", "pattern": GEO},
        "place_id": {"type": "string", "pattern": PLC},
        "geometry": {
            "type": "object", "additionalProperties": False,
            "required": ["type", "coordinates"],
            "properties": {
                "type": {"enum": ["Point"]},
                "coordinates": {
                    "type": "array", "minItems": 2, "maxItems": 2,
                    "prefixItems": [
                        {"type": "number", "minimum": -180, "maximum": 180},
                        {"type": "number", "minimum": -90, "maximum": 90}
                    ]
                }
            }
        },
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF,
        "observed_at": {"type": "string", "format": "date"}
    },
    ["id", "place_id", "geometry", "source_refs", "observed_at"]
))

w("administrative-area.schema.json", schema(
    "urn:decision-geography:schema:administrative-area",
    "Decision Geography administrative area",
    {
        "id": {"type": "string", "pattern": ADM},
        "name": {"type": "string", "minLength": 1},
        "level": {"type": "string"},
        "source_refs": SREF
    },
    ["id", "name", "level", "source_refs"]
))

w("administrative-membership.schema.json", schema(
    "urn:decision-geography:schema:administrative-membership",
    "Decision Geography administrative membership assertion",
    {
        "id": {"type": "string", "pattern": MEM},
        "place_id": {"type": "string", "pattern": PLC},
        "administrative_area_id": {"type": "string", "pattern": ADM},
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF,
        "observed_at": {"type": "string", "format": "date"}
    },
    ["id", "place_id", "administrative_area_id", "source_refs", "observed_at"]
))

w("external-identifier.schema.json", schema(
    "urn:decision-geography:schema:external-identifier",
    "Decision Geography external identifier",
    {
        "id": {"type": "string", "pattern": XID},
        "entity_type": {"enum": ["place", "connection", "area"]},
        "entity_id": {"type": "string"},
        "namespace": {"type": "string", "minLength": 1},
        "value": {"type": "string", "minLength": 1},
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF
    },
    ["id", "entity_type", "entity_id", "namespace", "value", "source_refs"]
))

w("connection.schema.json", schema(
    "urn:decision-geography:schema:connection",
    "Decision Geography structural transport connection",
    {
        "id": {"type": "string", "pattern": CON},
        "origin_place_id": {"type": "string", "pattern": PLC},
        "destination_place_id": {"type": "string", "pattern": PLC},
        "direction": {"enum": ["one_way", "bidirectional"]},
        "mode": {"enum": ["air", "helicopter", "sea", "local_boat", "road"]},
        "created_at": {"type": "string", "format": "date"},
        "retired_at": DATE
    },
    ["id", "origin_place_id", "destination_place_id", "direction", "mode", "created_at"]
))

w("connection-service.schema.json", schema(
    "urn:decision-geography:schema:connection-service",
    "Decision Geography connection service assertion",
    {
        "id": {"type": "string", "pattern": SVC},
        "connection_id": {"type": "string", "pattern": CON},
        "operator": {"type": ["string", "null"]},
        "capabilities": {
            "type": "array", "uniqueItems": True,
            "items": {"enum": ["passenger", "freight", "emergency"]}
        },
        "seasonality": {
            "type": "object", "additionalProperties": False,
            "required": ["kind", "months"],
            "properties": {
                "kind": {"enum": ["year_round", "seasonal", "irregular", "unknown"]},
                "months": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 1, "maximum": 12},
                    "uniqueItems": True
                }
            }
        },
        "frequency_band": {
            "enum": ["multiple_daily", "daily", "multiple_weekly", "weekly", "less_than_weekly", "irregular", "unknown"]
        },
        "frequency_basis": {
            "enum": ["published_maximum", "typical", "minimum_guaranteed", "unknown"]
        },
        "status": {"enum": ["active", "suspended", "retired"]},
        "valid_from": DATE,
        "valid_to": DATE,
        "source_refs": SREF,
        "observed_at": {"type": "string", "format": "date"}
    },
    ["id", "connection_id", "capabilities", "seasonality", "frequency_band", "frequency_basis", "status", "source_refs", "observed_at"]
))

w("source.schema.json", schema(
    "urn:decision-geography:schema:source",
    "Decision Geography provenance source",
    {
        "id": {"type": "string", "pattern": SRC},
        "title": {"type": "string", "minLength": 1},
        "publisher": {"type": ["string", "null"]},
        "url": {"type": ["string", "null"], "format": "uri"},
        "retrieved_at": DATE,
        "effective_from": DATE,
        "effective_to": DATE,
        "media_type": {"type": ["string", "null"]},
        "checksum": {"type": ["string", "null"]},
        "licence": {"type": ["string", "null"]},
        "verification_status": {"enum": ["verified", "pending"]},
        "notes": {"type": ["string", "null"]}
    },
    ["id", "title", "verification_status"]
))

# Remove definitions.schema.json since we inlined everything
defs_path = os.path.join(D, "definitions.schema.json")
if os.path.exists(defs_path):
    os.remove(defs_path)
    print("Removed definitions.schema.json (definitions inlined)")

print("All schemas generated.")
