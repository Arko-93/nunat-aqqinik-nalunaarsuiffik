#!/usr/bin/env python3
"""Tests for NunaGIS locality import selection (including homonyms)."""

from __future__ import annotations

from import_nunagis_localities import resolve_authority_rows


def _rows() -> list[dict]:
    return [
        {
            "namespace": "oqaasileriffik",
            "record_id": "BD02FAF4-AD21-4BB8-949F-E26D4AC50963",
            "official_name": "Aappilattoq",
            "feature_type": "settlement",
            "decision_ref": "nunagis.placenames:ID=13435",
        },
        {
            "namespace": "oqaasileriffik",
            "record_id": "8C893CCB-771F-4281-9FBE-170ED43CB540",
            "official_name": "Aappilattoq",
            "feature_type": "settlement",
            "decision_ref": "nunagis.placenames:ID=31347",
        },
        {
            "namespace": "oqaasileriffik",
            "record_id": "AAAA0000-0000-4000-8000-000000000001",
            "official_name": "Qaarsut",
            "feature_type": "settlement",
            "decision_ref": "nunagis.placenames:ID=1",
        },
    ]


def test_names_rejects_homonyms() -> None:
    try:
        resolve_authority_rows(_rows(), names=["Aappilattoq"], record_ids=None)
    except SystemExit as exc:
        if "homonym" not in str(exc):
            raise AssertionError(f"expected homonym error, got: {exc}") from exc
    else:
        raise AssertionError("homonym --names must fail")


def test_record_ids_select_both_homonyms() -> None:
    selected = resolve_authority_rows(
        _rows(),
        names=None,
        record_ids=[
            "BD02FAF4-AD21-4BB8-949F-E26D4AC50963",
            "{8C893CCB-771F-4281-9FBE-170ED43CB540}",
        ],
    )
    if len(selected) != 2:
        raise AssertionError("both Aappilattoq GlobalIDs must resolve")
    if {row["record_id"] for row in selected} != {
        "BD02FAF4-AD21-4BB8-949F-E26D4AC50963",
        "8C893CCB-771F-4281-9FBE-170ED43CB540",
    }:
        raise AssertionError("unexpected GlobalIDs selected")


def test_names_requires_unique_match() -> None:
    selected = resolve_authority_rows(
        _rows(), names=["Qaarsut"], record_ids=None
    )
    if selected[0]["record_id"] != "AAAA0000-0000-4000-8000-000000000001":
        raise AssertionError("unique name must resolve one row")


def main() -> None:
    test_names_rejects_homonyms()
    test_record_ids_select_both_homonyms()
    test_names_requires_unique_match()
    print(
        "Import locality selection passed — unique names, "
        "homonym rejection, and --record-ids disambiguation verified"
    )


if __name__ == "__main__":
    main()
