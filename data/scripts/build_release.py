#!/usr/bin/env python3
"""Build an immutable named release from canonical source and dist outputs."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from release_lib import (
    DATA_DIR,
    DIST_DIR,
    RELEASES_DIR,
    RELEASE_ARTIFACTS,
    SOURCE_DIR,
    data_as_of_from_source,
    default_release_id,
    discover_snapshot_manifests,
    iso_datetime,
    latest_placenames_gazetteer,
    load_json,
    publication_blockers,
    read_ndjson,
    sha256_prefixed,
    validate_record,
    write_json,
)


SCRIPT_DIR = Path(__file__).resolve().parent


def ensure_dist_built(source_dir: Path, dist_dir: Path) -> None:
    dist_dir.mkdir(parents=True, exist_ok=True)
    required = [
        "nunat-aqqinik-nalunaarsuiffik.ndjson",
        "reachability.ndjson",
        "isolation-report.json",
        "freight-gap-report.json",
        "emergency-gap-report.json",
        "single-dependency-report.json",
        "seasonal-loss-report.json",
        "decision-geography.db",
    ]
    if all((dist_dir / name).exists() for name in required):
        return

    environment = {
        **dict(__import__("os").environ),
        "DECISION_GEOGRAPHY_SOURCE_DIR": str(source_dir),
        "DECISION_GEOGRAPHY_DIST_DIR": str(dist_dir),
    }
    subprocess.run([sys.executable, str(SCRIPT_DIR / "build.py")], check=True, env=environment)
    subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "ndjson2db.py")],
        check=True,
        env=environment,
    )


def canonical_record_counts(source_dir: Path) -> dict[str, int]:
    return {
        "places": len(read_ndjson(source_dir / "places.ndjson")),
        "place_classifications": len(read_ndjson(source_dir / "place-classifications.ndjson")),
        "place_names": len(read_ndjson(source_dir / "place-names.ndjson")),
        "place_geometries": len(read_ndjson(source_dir / "place-geometries.ndjson")),
        "administrative_areas": len(read_ndjson(source_dir / "administrative-areas.ndjson")),
        "administrative_memberships": len(
            read_ndjson(source_dir / "administrative-memberships.ndjson")
        ),
        "external_identifiers": len(read_ndjson(source_dir / "external-identifiers.ndjson")),
        "connections": len(read_ndjson(source_dir / "connections.ndjson")),
        "connection_services": len(read_ndjson(source_dir / "connection-services.ndjson")),
        "sources": len(read_ndjson(source_dir / "sources.ndjson")),
    }


def build_release(
    release_id: str,
    *,
    source_dir: Path = SOURCE_DIR,
    dist_dir: Path = DIST_DIR,
    releases_dir: Path = RELEASES_DIR,
    previous_release_id: str | None = None,
    update_current: bool = True,
) -> Path:
    ensure_dist_built(source_dir, dist_dir)
    release_dir = releases_dir / release_id
    if release_dir.exists():
        raise SystemExit(f"release directory already exists: {release_dir}")

    release_dir.mkdir(parents=True, exist_ok=False)

    build_manifest_src = dist_dir / "manifest.json"
    shutil.copy2(build_manifest_src, release_dir / "build-manifest.json")

    for name in RELEASE_ARTIFACTS:
        if name == "build-manifest.json":
            continue
        if name == "placenames.geojson":
            gazetteer = latest_placenames_gazetteer()
            if gazetteer is None:
                raise SystemExit(
                    "missing placenames.geojson snapshot under "
                    "data/snapshots/nunagis_placenames_midpoint/*/ — "
                    "package the full NunaGIS midpoint gazetteer first"
                )
            shutil.copy2(gazetteer, release_dir / name)
            continue
        shutil.copy2(dist_dir / name, release_dir / name)

    data_as_of = data_as_of_from_source(source_dir)
    snapshots = discover_snapshot_manifests()
    blockers = publication_blockers(source_dir)

    checksums = {
        name: sha256_prefixed(release_dir / name)
        for name in RELEASE_ARTIFACTS
        if (release_dir / name).exists()
    }

    manifest = {
        "release_id": release_id,
        "created_at": iso_datetime(),
        "data_as_of": data_as_of,
        "schema_versions": {
            "canonical_source": "1.0",
            "release_manifest": "1.0",
            "source_snapshot": "1.0",
            "source_dataset": "1.0",
        },
        "record_counts": canonical_record_counts(source_dir),
        "source_snapshot_ids": [snapshot["id"] for snapshot in snapshots],
        "checksums": checksums,
        "publication_blockers": blockers,
    }
    validate_record(manifest, "release-manifest.schema.json", "manifest")
    write_json(release_dir / "manifest.json", manifest)

    changes = {
        "release_id": release_id,
        "previous_release_id": previous_release_id,
        "generated_at": iso_datetime(),
        "events": [],
        "summary": (
            "Initial named release from current canonical source."
            if previous_release_id is None
            else f"Release diff against {previous_release_id} not yet implemented."
        ),
    }
    write_json(release_dir / "changes.json", changes)

    source_health = {
        "release_id": release_id,
        "checked_at": iso_datetime(),
        "publish_ready": not any(
            blocker["severity"] == "blocker" for blocker in blockers
        ),
        "publication_blockers": blockers,
        "source_snapshots": snapshots,
        "canonical_sources": manifest["record_counts"],
    }
    write_json(release_dir / "source-health.json", source_health)

    release_pointer = {
        "release_id": release_id,
        "selected_at": iso_datetime(),
        "data_as_of": data_as_of,
        "manifest_path": f"releases/{release_id}/manifest.json",
        "notes": (
            "Production web/API builds must mount this release directory only. "
            "Do not read live upstream or mutable dist/ directly in production."
        ),
    }
    write_json(release_dir / "release.json", release_pointer)

    if update_current:
        write_json(releases_dir / "CURRENT", {"release_id": release_id})

    return release_dir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--release-id",
        default=None,
        help="Named release id (default: derived from data_as_of)",
    )
    parser.add_argument("--source-dir", type=Path, default=SOURCE_DIR)
    parser.add_argument("--dist-dir", type=Path, default=DIST_DIR)
    parser.add_argument("--releases-dir", type=Path, default=RELEASES_DIR)
    parser.add_argument("--previous-release-id", default=None)
    parser.add_argument(
        "--no-update-current",
        action="store_true",
        help="Do not update data/releases/CURRENT",
    )
    args = parser.parse_args()

    data_as_of = data_as_of_from_source(args.source_dir)
    release_id = args.release_id or default_release_id(data_as_of)
    release_dir = build_release(
        release_id,
        source_dir=args.source_dir,
        dist_dir=args.dist_dir,
        releases_dir=args.releases_dir,
        previous_release_id=args.previous_release_id,
        update_current=not args.no_update_current,
    )
    manifest = load_json(release_dir / "manifest.json")
    blocker_count = len(manifest["publication_blockers"])
    print(
        f"Built release {release_id} -> {release_dir} "
        f"({len(manifest['checksums'])} artefacts, {blocker_count} publication blockers)"
    )


if __name__ == "__main__":
    main()
