#!/usr/bin/env python3
"""Mint canonical locality records from confirmed NunaGIS Type 21/23 authority rows.

Does not invent Asiaq geometry. Membership uses MunicipalityCode → adm_ mapping
from the locality snapshot attributes. Existing seed GlobalIDs are rewritten when
the authority record_id rotates but decision_ref still confirms the same place.
"""

from __future__ import annotations

import argparse
import json
import re
import uuid
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = DATA_DIR / "source"
AUTHORITY_PATH = (
    DATA_DIR / "reconciliation" / "authority" / "oqaasileriffik-nunagis.ndjson"
)
SOURCE_ID = "src_nunagis_placenames_register"

# NunaGIS MunicipalityCode → administrative-areas.ndjson (seed-verified 2026-08-01)
MUNICIPALITY_BY_CODE = {
    955: "adm_6c2a6e8c-5b66-4e6c-8a2a-e76ae69e26ae",  # Kujalleq
    956: "adm_9ffc6d1b-7e41-4d6f-9734-d69286b53888",  # Sermersooq
    957: "adm_92262221-2914-4f08-b4d3-298a45d37c99",  # Qeqqata
    959: "adm_aaffa056-d090-4ffb-a69e-502ac8ad6ef8",  # Qeqertalik
    960: "adm_6c527984-2c63-44a6-8d64-2985f94ecb27",  # Avannaata
}


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def write_ndjson(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            )


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def mint(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4()}"


def strip_global_id(value: str) -> str:
    return value.strip().strip("{}")


def danish_name(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    return value


def latest_type_21_23_snapshot() -> Path:
    root = DATA_DIR / "snapshots" / "nunagis_placenames"
    candidates = sorted(
        path
        for path in root.iterdir()
        if path.is_dir() and (path / "type-21-23-query.json").exists()
    )
    if not candidates:
        raise SystemExit("no type-21-23-query.json snapshot; run fetch --localities")
    return candidates[-1] / "type-21-23-query.json"


def attributes_by_global_id(snapshot_path: Path) -> dict[str, dict]:
    payload = read_json(snapshot_path)
    by_gid: dict[str, dict] = {}
    for feature in payload.get("features") or []:
        attributes = feature.get("attributes") or feature
        gid = strip_global_id(attributes["GlobalID"])
        by_gid[gid] = attributes
    return by_gid


def rewrite_source_record_ids(
    rows: list[dict], old_gid: str, new_gid: str
) -> int:
    changed = 0
    for row in rows:
        for ref in row.get("source_refs") or []:
            if (
                ref.get("source_id") == SOURCE_ID
                and ref.get("record_id") == old_gid
            ):
                ref["record_id"] = new_gid
                changed += 1
    return changed


def sync_seed_global_ids(
    authority: list[dict], observed_at: str
) -> dict[str, int]:
    """Rewrite seed xid_/nam_/cls_ record_ids when GlobalID drifts."""
    places = {row["id"] for row in read_ndjson(SOURCE_DIR / "places.ndjson")}
    xids = read_ndjson(SOURCE_DIR / "external-identifiers.ndjson")
    names = read_ndjson(SOURCE_DIR / "place-names.ndjson")
    classifications = read_ndjson(SOURCE_DIR / "place-classifications.ndjson")

    xid_by_place = {
        row["entity_id"]: row
        for row in xids
        if row.get("namespace") == "nunagis.global_id"
        and row.get("entity_type") == "place"
        and row.get("valid_to") is None
    }

    updated = 0
    for row in authority:
        place_id = row.get("confirmed_place_id")
        new_gid = row.get("record_id")
        if not place_id or place_id not in places or not new_gid:
            continue
        xid = xid_by_place.get(place_id)
        if xid is None:
            continue
        old_gid = xid.get("value")
        if old_gid == new_gid:
            continue
        xid["value"] = new_gid
        for ref in xid.get("source_refs") or []:
            if ref.get("source_id") == SOURCE_ID:
                ref["record_id"] = new_gid
        rewrite_source_record_ids(names, old_gid, new_gid)
        rewrite_source_record_ids(classifications, old_gid, new_gid)
        updated += 1

    write_ndjson(SOURCE_DIR / "external-identifiers.ndjson", xids)
    write_ndjson(SOURCE_DIR / "place-names.ndjson", names)
    write_ndjson(SOURCE_DIR / "place-classifications.ndjson", classifications)
    return {"global_id_rewrites": updated, "observed_at": observed_at}


def import_names(
    names: list[str],
    authority: list[dict],
    attrs_by_gid: dict[str, dict],
    observed_at: str,
    created_at: str,
) -> list[str]:
    wanted = set(names)
    by_official = {
        row["official_name"]: row
        for row in authority
        if row.get("official_name") in wanted
    }
    missing = sorted(wanted - set(by_official))
    if missing:
        raise SystemExit(f"authority missing official names: {', '.join(missing)}")

    existing_names = {
        row["value"]
        for row in read_ndjson(SOURCE_DIR / "place-names.ndjson")
        if row.get("kind") == "official"
        and row.get("language") == "kl"
        and row.get("valid_to") is None
    }
    already = sorted(wanted & existing_names)
    if already:
        raise SystemExit(
            "official KL names already in source (no auto-merge): "
            + ", ".join(already)
        )

    places = read_ndjson(SOURCE_DIR / "places.ndjson")
    classifications = read_ndjson(SOURCE_DIR / "place-classifications.ndjson")
    place_names = read_ndjson(SOURCE_DIR / "place-names.ndjson")
    xids = read_ndjson(SOURCE_DIR / "external-identifiers.ndjson")
    memberships = read_ndjson(SOURCE_DIR / "administrative-memberships.ndjson")

    minted: list[str] = []
    for official_name in sorted(wanted):
        auth = by_official[official_name]
        gid = auth["record_id"]
        attrs = attrs_by_gid.get(gid)
        if attrs is None:
            raise SystemExit(f"snapshot missing attributes for GlobalID {gid}")
        muni_code = attrs.get("MunicipalityCode")
        area_id = MUNICIPALITY_BY_CODE.get(muni_code)
        if area_id is None:
            raise SystemExit(
                f"{official_name}: unknown MunicipalityCode {muni_code!r}"
            )

        place_id = mint("plc_")
        places.append(
            {
                "id": place_id,
                "status": "active",
                "created_at": created_at,
                "retired_at": None,
                "source_refs": [
                    {"source_id": SOURCE_ID, "record_id": gid}
                ],
            }
        )
        classifications.append(
            {
                "id": mint("cls_"),
                "place_id": place_id,
                "feature_type": auth["feature_type"],
                "valid_from": None,
                "valid_to": None,
                "source_refs": [
                    {"source_id": SOURCE_ID, "record_id": gid}
                ],
                "observed_at": observed_at,
            }
        )
        place_names.append(
            {
                "id": mint("nam_"),
                "place_id": place_id,
                "value": official_name,
                "language": "kl",
                "kind": "official",
                "valid_from": None,
                "valid_to": None,
                "source_refs": [
                    {"source_id": SOURCE_ID, "record_id": gid}
                ],
                "observed_at": observed_at,
            }
        )
        da = danish_name(attrs.get("PlacenameDanish"))
        if da:
            place_names.append(
                {
                    "id": mint("nam_"),
                    "place_id": place_id,
                    "value": da,
                    "language": "da",
                    "kind": "exonym",
                    "valid_from": None,
                    "valid_to": None,
                    "source_refs": [
                        {"source_id": SOURCE_ID, "record_id": gid}
                    ],
                    "observed_at": observed_at,
                }
            )
        xids.append(
            {
                "id": mint("xid_"),
                "entity_type": "place",
                "entity_id": place_id,
                "valid_from": None,
                "valid_to": None,
                "namespace": "nunagis.global_id",
                "value": gid,
                "source_refs": [
                    {"source_id": SOURCE_ID, "record_id": gid}
                ],
            }
        )
        memberships.append(
            {
                "id": mint("mem_"),
                "place_id": place_id,
                "administrative_area_id": area_id,
                "valid_from": None,
                "valid_to": None,
                "source_refs": [
                    {"source_id": SOURCE_ID, "record_id": gid}
                ],
                "observed_at": observed_at,
            }
        )
        auth["confirmed_place_id"] = place_id
        minted.append(f"{official_name} → {place_id} ({gid})")

    write_ndjson(SOURCE_DIR / "places.ndjson", places)
    write_ndjson(SOURCE_DIR / "place-classifications.ndjson", classifications)
    write_ndjson(SOURCE_DIR / "place-names.ndjson", place_names)
    write_ndjson(SOURCE_DIR / "external-identifiers.ndjson", xids)
    write_ndjson(SOURCE_DIR / "administrative-memberships.ndjson", memberships)
    write_ndjson(AUTHORITY_PATH, authority)
    return minted


def update_source_registry(checksum: str, retrieved_at: str, storage_note: str) -> None:
    sources = read_ndjson(SOURCE_DIR / "sources.ndjson")
    for row in sources:
        if row.get("id") != SOURCE_ID:
            continue
        row["retrieved_at"] = retrieved_at
        row["checksum"] = checksum
        notes = row.get("notes") or ""
        # Keep the pointer sentence; refresh snapshot path if present.
        row["notes"] = re.sub(
            r"Raw snapshot:.*$",
            f"Raw snapshot: {storage_note}",
            notes,
            count=1,
        )
        if "Raw snapshot:" not in row["notes"]:
            row["notes"] = f"{notes.rstrip()} Raw snapshot: {storage_note}"
        break
    write_ndjson(SOURCE_DIR / "sources.ndjson", sources)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--names",
        required=True,
        help="Comma-separated PlacenameOfficial values to mint",
    )
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=None,
        help="Path to type-21-23-query.json (default: latest)",
    )
    parser.add_argument(
        "--observed-at",
        default=None,
        help="Observation date YYYY-MM-DD (default: snapshot retrieved date)",
    )
    parser.add_argument(
        "--sync-global-ids",
        action="store_true",
        help="Rewrite existing seed nunagis.global_id values to current GlobalIDs",
    )
    args = parser.parse_args()

    snapshot_path = args.snapshot or latest_type_21_23_snapshot()
    manifest_path = snapshot_path.parent / "manifest.json"
    manifest = read_json(manifest_path) if manifest_path.exists() else {}
    retrieved_at = (manifest.get("retrieved_at") or "")[:10] or "2026-08-07"
    observed_at = args.observed_at or retrieved_at
    checksum = manifest.get("checksum")
    storage = manifest.get("storage_path") or str(
        snapshot_path.parent.relative_to(DATA_DIR)
    )

    authority = read_ndjson(AUTHORITY_PATH)
    if not authority:
        raise SystemExit(f"empty authority file: {AUTHORITY_PATH}")

    if args.sync_global_ids:
        stats = sync_seed_global_ids(authority, observed_at)
        print(f"Synced GlobalIDs: {stats['global_id_rewrites']} place xid_ rows")

    names = [part.strip() for part in args.names.split(",") if part.strip()]
    attrs = attributes_by_global_id(snapshot_path)
    minted = import_names(
        names,
        authority,
        attrs,
        observed_at=observed_at,
        created_at=observed_at,
    )
    if checksum:
        update_source_registry(
            checksum=checksum,
            retrieved_at=retrieved_at,
            storage_note=f"{storage}/.",
        )
    print(f"Minted {len(minted)} localities:")
    for line in minted:
        print(f"  {line}")


if __name__ == "__main__":
    main()
