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
        {
            "attributes": {
                "GlobalID": "{3761D484-EEC4-43BE-B694-F35AF509201B}",
                "ID": 13434,
                "PlacenameOfficial": "Grise Fiord :100:",
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
    if any(row.get("decision_ref") == "nunagis.placenames:ID=13434" for row in rows):
        raise AssertionError("Grise Fiord (ID=13434) must stay excluded from authority")


def active_place_count() -> int:
    with (SOURCE_DIR / "places.ndjson").open(encoding="utf-8") as file:
        return sum(
            1
            for line in file
            if line.strip() and json.loads(line).get("status") == "active"
        )


def test_nunagis_authority_produces_candidates() -> None:
    if not NUNAGIS_AUTHORITY.exists():
        raise AssertionError(f"missing authority file: {NUNAGIS_AUTHORITY}")
    expected_places = active_place_count()
    report = build_report(
        SOURCE_DIR, read_authority_records([NUNAGIS_AUTHORITY])
    )
    if len(report) != expected_places:
        raise AssertionError(
            f"expected {expected_places} reconciliation rows, got {len(report)}"
        )
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
    if len(confirmed) != expected_places or len(candidates) != 0:
        raise AssertionError(
            f"expected {expected_places} confirmed + 0 candidate "
            f"Oqaasileriffik rows, got {len(confirmed)} + {len(candidates)}"
        )
    nuuk = [
        row for row in report if row["current_official_name"] == "Nuuk"
    ]
    if not nuuk or nuuk[0]["authority_matches"]["oqaasileriffik"]["status"] != "confirmed":
        raise AssertionError("expected Nuuk to remain a confirmed Oqaasileriffik side")
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
            "decision_ref": "nunagis.placenames:ID=13493",
            "confirmed_place_id": "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80",
        }
    ]
    fresh = [
        {
            "namespace": "oqaasileriffik",
            "record_id": "C9EE223C-C726-4335-80F8-E401E5480001",
            "official_name": "Nuuk",
            "feature_type": "town",
            "decision_ref": "nunagis.placenames:ID=13493",
        }
    ]
    carried = carry_confirmations(fresh, previous)
    if carried[0].get("confirmed_place_id") != previous[0]["confirmed_place_id"]:
        raise AssertionError(
            "confirmed_place_id must survive re-normalize by record_id"
        )


def test_normalize_preserves_confirmations_after_global_id_drift() -> None:
    previous = [
        {
            "namespace": "oqaasileriffik",
            "record_id": "C9EE223C-C726-4335-80F8-E401E5480001",
            "official_name": "Nuuk",
            "feature_type": "town",
            "decision_ref": "nunagis.placenames:ID=13493",
            "confirmed_place_id": "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80",
        }
    ]
    fresh = [
        {
            "namespace": "oqaasileriffik",
            "record_id": "1AB00601-6698-492D-9C16-5E3C655259FA",
            "official_name": "Nuuk",
            "feature_type": "town",
            "decision_ref": "nunagis.placenames:ID=13493",
        }
    ]
    carried = carry_confirmations(fresh, previous)
    if carried[0].get("confirmed_place_id") != previous[0]["confirmed_place_id"]:
        raise AssertionError(
            "confirmed_place_id must survive GlobalID drift via decision_ref"
        )


def main() -> None:
    place_count = active_place_count()
    waiting = build_report(SOURCE_DIR, [])
    if len(waiting) != place_count or any(
        row["status"] != "unresolved" for row in waiting
    ):
        raise AssertionError(
            f"empty authority input must leave all {place_count} places unresolved"
        )

    test_normalize_keeps_only_locality_types()
    test_normalize_preserves_confirmations()
    test_normalize_preserves_confirmations_after_global_id_drift()
    test_nunagis_authority_produces_candidates()

    # Prefer a seed that still has provisional geometry for the match/conflict path.
    target = next(
        (row for row in waiting if row.get("current_geometry") is not None),
        waiting[0],
    )
    place_id = target["place_id"]
    name = target["current_official_name"]
    feature_type = target["current_feature_type"]
    geometry = target["current_geometry"]
    if geometry is None:
        raise AssertionError(
            "need at least one place with geometry for match/conflict fixture"
        )
    longitude, latitude = geometry

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
        f"Reconciliation integration passed — {place_count}-place waiting queue, "
        "NunaGIS Type 21/23 normalize, confirmed Oqaasileriffik side, "
        "GlobalID-drift carry, explicit match, and conflict preservation verified"
    )


if __name__ == "__main__":
    main()
