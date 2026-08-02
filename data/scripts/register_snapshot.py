#!/usr/bin/env python3
"""Register an existing raw snapshot under data/snapshots/."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from release_lib import (
    DATA_DIR,
    SNAPSHOTS_DIR,
    load_json,
    sha256_prefixed,
    validate_record,
    write_json,
)


RAW_ROOT = DATA_DIR / "raw"
SOURCE_DATASET_ID = "dsd_nunagis_placenames_register"
SNAPSHOT_ID = "snp_nunagis_placenames_2026_08_01"


def register_nunagis_snapshot(
    *,
    raw_dir: Path,
    source_slug: str = "nunagis_placenames",
    snapshot_id: str = SNAPSHOT_ID,
    source_dataset_id: str = SOURCE_DATASET_ID,
) -> Path:
    raw_manifest_path = raw_dir / "manifest.json"
    payload_path = raw_dir / "seed-name-query.json"
    if not raw_manifest_path.exists() or not payload_path.exists():
        raise SystemExit(f"missing raw snapshot files under {raw_dir}")

    raw_manifest = load_json(raw_manifest_path)
    timestamp = raw_dir.name
    storage_path = f"snapshots/{source_slug}/{timestamp}"
    target_dir = DATA_DIR / storage_path
    target_dir.mkdir(parents=True, exist_ok=True)

    for name in ("seed-name-query.json",):
        shutil.copy2(raw_dir / name, target_dir / name)

    checksum = sha256_prefixed(target_dir / "seed-name-query.json")
    if raw_manifest.get("checksum") and raw_manifest["checksum"] != checksum:
        raise SystemExit(
            f"checksum mismatch for {payload_path.name}: "
            f"raw manifest {raw_manifest['checksum']} != recomputed {checksum}"
        )

    retrieved_at = raw_manifest.get("retrieved_at", timestamp)
    if "T" not in retrieved_at:
        retrieved_at = f"{retrieved_at}T00:00:00Z"

    licence_status = "unknown"
    if raw_manifest.get("licence"):
        licence_status = "verified"

    snapshot_manifest = {
        "id": snapshot_id,
        "source_dataset_id": source_dataset_id,
        "url": raw_manifest["url"],
        "retrieved_at": retrieved_at,
        "checksum": checksum,
        "media_type": raw_manifest.get("media_type") or "application/json",
        "schema_fingerprint": None,
        "licence_status": licence_status,
        "storage_path": storage_path,
        "byte_size": (target_dir / "seed-name-query.json").stat().st_size,
        "record_count": raw_manifest.get("record_count", 0),
        "notes": raw_manifest.get("notes"),
    }
    validate_record(snapshot_manifest, "source-snapshot.schema.json", "snapshot manifest")
    write_json(target_dir / "manifest.json", snapshot_manifest)
    return target_dir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=RAW_ROOT / "nunagis_placenames" / "2026-08-01",
    )
    args = parser.parse_args()
    target = register_nunagis_snapshot(raw_dir=args.raw_dir)
    print(f"Registered immutable snapshot at {target}")


if __name__ == "__main__":
    main()
