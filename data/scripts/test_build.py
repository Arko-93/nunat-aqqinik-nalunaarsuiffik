#!/usr/bin/env python3
"""Integration and reproducibility checks for generated distributions."""

import csv
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent
SCRIPT_DIR = DATA_DIR / "scripts"
SOURCE_DIR = DATA_DIR / "source"
DIST_DIR = DATA_DIR / "dist"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def line_count(path: Path) -> int:
    with path.open(encoding="utf-8") as file:
        return sum(1 for line in file if line.strip())


def build() -> None:
    subprocess.run([sys.executable, str(SCRIPT_DIR / "build.py")], check=True)
    subprocess.run([sys.executable, str(SCRIPT_DIR / "ndjson2db.py")], check=True)


def output_hashes() -> dict[str, str]:
    return {
        path.name: sha256(path)
        for path in sorted(DIST_DIR.iterdir())
        if path.is_file()
    }


def verify_manifest() -> None:
    manifest_path = DIST_DIR / "manifest.json"
    with manifest_path.open(encoding="utf-8") as file:
        manifest = json.load(file)

    for relative_path, expected in manifest["sha256"].items():
        path = DATA_DIR / relative_path
        actual = sha256(path)
        if actual != expected:
            raise AssertionError(
                f"manifest checksum mismatch for {relative_path}: "
                f"expected {expected}, got {actual}"
            )

    places = manifest["distributions"]["nunat-aqqinik-nalunaarsuiffik.ndjson"]
    reachability = manifest["distributions"]["reachability.ndjson"]

    if line_count(DIST_DIR / "nunat-aqqinik-nalunaarsuiffik.ndjson") != places:
        raise AssertionError("place NDJSON count does not match manifest")
    if line_count(DIST_DIR / "reachability.ndjson") != reachability:
        raise AssertionError("reachability NDJSON count does not match manifest")

    with (DIST_DIR / "nunat-aqqinik-nalunaarsuiffik.json").open(
        encoding="utf-8"
    ) as file:
        if len(json.load(file)) != places:
            raise AssertionError("place JSON count does not match manifest")
    with (DIST_DIR / "reachability.json").open(encoding="utf-8") as file:
        if len(json.load(file)) != reachability:
            raise AssertionError("reachability JSON count does not match manifest")
    with (DIST_DIR / "nunat-aqqinik-nalunaarsuiffik.geojson").open(
        encoding="utf-8"
    ) as file:
        if len(json.load(file)["features"]) != places:
            raise AssertionError("GeoJSON count does not match manifest")

    for name, expected in (
        ("nunat-aqqinik-nalunaarsuiffik.csv", places),
        ("reachability.csv", reachability),
    ):
        with (DIST_DIR / name).open(encoding="utf-8", newline="") as file:
            rows = list(csv.reader(file))
        if len(rows) - 1 != expected:
            raise AssertionError(f"{name} count does not match manifest")


def verify_database() -> None:
    db_path = DIST_DIR / "decision-geography.db"
    with sqlite3.connect(db_path) as db:
        fk_errors = list(db.execute("PRAGMA foreign_key_check"))
        if fk_errors:
            raise AssertionError(f"SQLite foreign-key errors: {fk_errors}")

        place_count = db.execute("SELECT count(*) FROM places").fetchone()[0]
        source_place_count = line_count(SOURCE_DIR / "places.ndjson")
        if place_count != source_place_count:
            raise AssertionError(
                f"SQLite place count {place_count} != source {source_place_count}"
            )

        db.execute("SELECT * FROM current_places LIMIT 1").fetchall()
        db.execute("SELECT * FROM current_connections LIMIT 1").fetchall()


def verify_concurrent_service_projection() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        source_dir = root / "source"
        dist_dir = root / "dist"
        shutil.copytree(SOURCE_DIR, source_dir)

        service_path = source_dir / "connection-services.ndjson"
        with service_path.open(encoding="utf-8") as file:
            services = [json.loads(line) for line in file if line.strip()]
        second = dict(services[0])
        second["id"] = "svc_00000000-0000-4000-8000-000000000099"
        second["operator"] = "Concurrent test operator"
        with service_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(second) + "\n")

        environment = dict(os.environ)
        environment["DECISION_GEOGRAPHY_SOURCE_DIR"] = str(source_dir)
        environment["DECISION_GEOGRAPHY_DIST_DIR"] = str(dist_dir)
        subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "build.py")],
            check=True,
            env=environment,
        )

        with (dist_dir / "reachability.json").open(encoding="utf-8") as file:
            reachability = json.load(file)
        matching = [
            connection
            for connection in reachability
            if connection["id"] == services[0]["connection_id"]
        ]
        if len(matching) != 1 or len(matching[0]["services"]) != 2:
            raise AssertionError(
                "concurrent services were not preserved in reachability output"
            )
        print(
            "Concurrent-service projection passed — one structural connection "
            "preserved two current service assertions"
        )


def main() -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)

    build()
    verify_manifest()
    verify_database()
    verify_concurrent_service_projection()
    first = output_hashes()

    build()
    verify_manifest()
    verify_database()
    second = output_hashes()

    if first != second:
        changed = sorted(
            name
            for name in set(first) | set(second)
            if first.get(name) != second.get(name)
        )
        raise AssertionError(
            "clean-source rebuild is not reproducible; changed outputs: "
            + ", ".join(changed)
        )

    print(
        f"Build integration passed — {len(second)} reproducible outputs, "
        "manifest checksums and SQLite foreign keys verified"
    )


if __name__ == "__main__":
    main()
