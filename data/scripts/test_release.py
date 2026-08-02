#!/usr/bin/env python3
"""Reproducibility checks for named releases."""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

from build_release import build_release
from release_lib import RELEASE_ARTIFACTS, load_json, validate_record


DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = DATA_DIR / "source"
DIST_DIR = DATA_DIR / "dist"


def verify_release(release_dir: Path) -> None:
    manifest = load_json(release_dir / "manifest.json")
    validate_record(manifest, "release-manifest.schema.json", release_dir.name)

    for name, expected in manifest["checksums"].items():
        path = release_dir / name
        if not path.exists():
            raise AssertionError(f"missing release artefact: {name}")
        from release_lib import sha256_prefixed

        actual = sha256_prefixed(path)
        if actual != expected:
            raise AssertionError(
                f"checksum mismatch for {name}: expected {expected}, got {actual}"
            )

    for name in RELEASE_ARTIFACTS:
        if name not in manifest["checksums"]:
            raise AssertionError(f"manifest missing checksum for {name}")


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_name:
        temp_root = Path(temp_name)
        dist_a = temp_root / "dist-a"
        dist_b = temp_root / "dist-b"
        releases_a = temp_root / "releases-a"
        releases_b = temp_root / "releases-b"

        build_release(
            "2026.08.01.99",
            source_dir=SOURCE_DIR,
            dist_dir=dist_a,
            releases_dir=releases_a,
            update_current=False,
        )
        build_release(
            "2026.08.01.99",
            source_dir=SOURCE_DIR,
            dist_dir=dist_b,
            releases_dir=releases_b,
            update_current=False,
        )

        release_a = releases_a / "2026.08.01.99"
        release_b = releases_b / "2026.08.01.99"
        verify_release(release_a)
        verify_release(release_b)

        manifest_a = load_json(release_a / "manifest.json")
        manifest_b = load_json(release_b / "manifest.json")

        if manifest_a["checksums"] != manifest_b["checksums"]:
            changed = sorted(
                name
                for name in set(manifest_a["checksums"]) | set(manifest_b["checksums"])
                if manifest_a["checksums"].get(name) != manifest_b["checksums"].get(name)
            )
            raise AssertionError(
                "release rebuild is not reproducible; changed checksums: "
                + ", ".join(changed)
            )

        if manifest_a["record_counts"] != manifest_b["record_counts"]:
            raise AssertionError("release record_counts differ between rebuilds")

    print(
        "Release reproducibility passed — two clean builds produced identical "
        f"checksums for {len(manifest_a['checksums'])} artefacts"
    )


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError) as exc:
        print(f"Release reproducibility failed: {exc}")
        sys.exit(1)
