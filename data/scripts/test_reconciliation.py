#!/usr/bin/env python3
"""Regression checks for the non-destructive seed reconciliation workflow."""

import json
import tempfile
from pathlib import Path

from normalize_nunagis_placenames import carry_confirmations, normalize_features
from reconcile_places import build_report, read_authority_records


DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = DATA_DIR / "source"
NUNAGIS_AUTHORITY = (
    DATA_DIR / "reconciliation" / "authority" / "oqaasileriffik-nunagis.ndjson"
)


def write_rows(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def test_normalize_keeps_only_locality_types() -> None:
    features = [
        {
            "attributes": {
                "GlobalID": "{AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}",
                "ID": 1,
                "PlacenameOfficial": "Nuuk",
                "Type": 21,
            }
        },
        {
            "attributes": {
                "GlobalID": "{BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB}",
                "ID": 2,
                "PlacenameOfficial": "Nuuk",
                "Type": 118,
            }
        },
        {
            "attributes": {
                "GlobalID": "{CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC}",
                "ID": 3,
                "PlacenameOfficial": "Kulusuk",
                "Type": 23,
            }
        },
    ]
    rows = normalize_features(features)
    if len(rows) != 2:
        raise AssertionError("normalize must keep only Type 21 and Type 23")
    by_name = {row["official_name"]: row for row in rows}
    if by_name["Nuuk"]["feature_type"] != "town":
        raise AssertionError("Type 21 must map to town")
    if by_name["Kulusuk"]["feature_type"] != "settlement":
        raise AssertionError("Type 23 must map to settlement")
    if by_name["Nuuk"]["record_id"] != "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA":
        raise AssertionError("GlobalID braces must be stripped")
    if "longitude" in by_name["Nuuk"] or "latitude" in by_name["Nuuk"]:
        raise AssertionError("Oqaasileriffik authority rows must omit geometry")


def test_nunagis_authority_produces_candidates() -> None:
    if not NUNAGIS_AUTHORITY.exists():
        raise AssertionError(f"missing authority file: {NUNAGIS_AUTHORITY}")
    report = build_report(
        SOURCE_DIR, read_authority_records([NUNAGIS_AUTHORITY])
    )
    if len(report) != 15:
        raise AssertionError("expected 15 seed reconciliation rows")
    if any(row["status"] != "unresolved" for row in report):
        raise AssertionError(
            "Asiaq still waiting must leave overall seed status unresolved"
        )
    confirmed = [
        row
        for row in report
        if row["authority_matches"]["oqaasileriffik"]["status"] == "confirmed"
    ]
    candidates = [
        row
        for row in report
        if row["authority_matches"]["oqaasileriffik"]["status"]
        == "candidate_exact_name"
    ]
    if len(confirmed) != 1 or len(candidates) != 14:
        raise AssertionError(
            "expected 1 confirmed + 14 candidate Oqaasileriffik rows, got "
            f"{len(confirmed)} + {len(candidates)}"
        )
    if confirmed[0]["place_id"] != "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80":
        raise AssertionError("expected Nuuk to be the confirmed Oqaasileriffik side")
    for row in report:
        asiaq = row["authority_matches"]["asiaq"]
        if asiaq["status"] != "waiting_for_export":
            raise AssertionError(
                f"{row['current_official_name']}: Asiaq should still wait "
                f"for export, got {asiaq['status']}"
            )


def test_normalize_preserves_confirmations() -> None:
    previous = [
        {
            "namespace": "oqaasileriffik",
            "record_id": "C9EE223C-C726-4335-80F8-E401E5480001",
            "official_name": "Nuuk",
            "feature_type": "town",
            "confirmed_place_id": "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80",
        }
    ]
    fresh = [
        {
            "namespace": "oqaasileriffik",
            "record_id": "C9EE223C-C726-4335-80F8-E401E5480001",
            "official_name": "Nuuk",
            "feature_type": "town",
        }
    ]
    carried = carry_confirmations(fresh, previous)
    if carried[0].get("confirmed_place_id") != previous[0]["confirmed_place_id"]:
        raise AssertionError(
            "confirmed_place_id must survive re-normalize by record_id"
        )


def main() -> None:
    waiting = build_report(SOURCE_DIR, [])
    if len(waiting) != 15 or any(row["status"] != "unresolved" for row in waiting):
        raise AssertionError("empty authority input must leave all 15 seeds unresolved")

    test_normalize_keeps_only_locality_types()
    test_normalize_preserves_confirmations()
    test_nunagis_authority_produces_candidates()

    target = waiting[0]
    place_id = target["place_id"]
    name = target["current_official_name"]
    feature_type = target["current_feature_type"]
    longitude, latitude = target["current_geometry"]

    with tempfile.TemporaryDirectory() as temp_dir:
        authority_path = Path(temp_dir) / "authority.ndjson"
        write_rows(
            authority_path,
            [
                {
                    "namespace": "oqaasileriffik",
                    "record_id": "name-1",
                    "official_name": name,
                    "feature_type": feature_type,
                    "confirmed_place_id": place_id,
                },
                {
                    "namespace": "asiaq",
                    "record_id": "geometry-1",
                    "official_name": name,
                    "longitude": longitude,
                    "latitude": latitude,
                    "confirmed_place_id": place_id,
                },
            ],
        )
        matched = build_report(
            SOURCE_DIR, read_authority_records([authority_path])
        )
        selected = next(row for row in matched if row["place_id"] == place_id)
        if selected["status"] != "matched":
            raise AssertionError("two explicit confirmations should match a seed")

        rows = read_authority_records([authority_path])
        rows[1]["longitude"] += 0.1
        write_rows(authority_path, rows)
        conflicting = build_report(
            SOURCE_DIR, read_authority_records([authority_path])
        )
        selected = next(
            row for row in conflicting if row["place_id"] == place_id
        )
        if selected["status"] != "conflicting":
            raise AssertionError("confirmed geometry disagreement must remain visible")

    print(
        "Reconciliation integration passed — 15-place waiting queue, "
        "NunaGIS Type 21/23 normalize, candidate_exact_name path, "
        "explicit match, and conflict preservation verified"
    )


if __name__ == "__main__":
    main()
