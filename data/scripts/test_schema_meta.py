#!/usr/bin/env python3
"""Schema validation tests for Phase 2 metadata contracts."""

from __future__ import annotations

import sys

from release_lib import META_SCHEMAS, validate_record


def main() -> None:
    validate_record(
        {
            "id": "dsd_nunagis_placenames_register",
            "title": "NunaGIS PlacenamesRegisterPublic",
            "publisher": "NunaGIS / Oqaasileriffik",
            "authority_scope": "official_place_names",
            "access_method": "rest_api",
            "terms_url": None,
            "licence": None,
            "expected_cadence": "unknown",
            "notes": "Attributes-only ArcGIS REST layer.",
        },
        META_SCHEMAS["source-dataset"],
        "source-dataset fixture",
    )

    validate_record(
        {
            "id": "snp_nunagis_placenames_2026_08_01",
            "source_dataset_id": "dsd_nunagis_placenames_register",
            "url": "https://kort.nunagis.gl/refserver/rest/services/PlacenamesRegister/PlacenamesRegisterPublic/MapServer/0",
            "retrieved_at": "2026-08-01T00:00:00Z",
            "checksum": "sha256:" + "0" * 64,
            "media_type": "application/json",
            "schema_fingerprint": None,
            "licence_status": "unknown",
            "storage_path": "snapshots/nunagis_placenames/2026-08-01",
            "byte_size": 1,
            "record_count": 160,
            "notes": None,
        },
        META_SCHEMAS["source-snapshot"],
        "source-snapshot fixture",
    )

    validate_record(
        {
            "id": "imp_00000000-0000-4000-8000-000000000001",
            "source_snapshot_id": "snp_nunagis_placenames_2026_08_01",
            "previous_snapshot_id": None,
            "adapter_name": "normalize_nunagis_placenames",
            "adapter_version": "1.0.0",
            "started_at": "2026-08-01T12:00:00Z",
            "completed_at": "2026-08-01T12:00:01Z",
            "status": "completed",
            "record_counts": {"authority_rows": 15},
            "warnings": [],
            "errors": [],
        },
        META_SCHEMAS["import-run"],
        "import-run fixture",
    )

    validate_record(
        {
            "id": "chg_00000000-0000-4000-8000-000000000001",
            "import_run_id": "imp_00000000-0000-4000-8000-000000000001",
            "release_id": "2026.08.01.1",
            "kind": "added",
            "entity_type": "authority_row",
            "entity_id": None,
            "upstream_record_id": "example-global-id",
            "summary": "Example change event fixture.",
            "observed_at": "2026-08-01",
        },
        META_SCHEMAS["change-event"],
        "change-event fixture",
    )

    validate_record(
        {
            "release_id": "2026.08.01.1",
            "created_at": "2026-08-01T22:00:00Z",
            "data_as_of": "2026-08-01",
            "schema_versions": {"canonical_source": "1.0"},
            "record_counts": {"places": 15},
            "source_snapshot_ids": ["snp_nunagis_placenames_2026_08_01"],
            "checksums": {"manifest.json": "sha256:" + "0" * 64},
            "publication_blockers": [
                {
                    "code": "pending_provenance",
                    "message": "Example blocker fixture.",
                    "severity": "blocker",
                    "source_id": "src_legacy_seed",
                    "snapshot_id": None,
                }
            ],
        },
        META_SCHEMAS["release-manifest"],
        "release-manifest fixture",
    )

    print("Meta-schema validation passed — 5 Phase 2 contracts verified")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Meta-schema validation failed: {exc}")
        sys.exit(1)
