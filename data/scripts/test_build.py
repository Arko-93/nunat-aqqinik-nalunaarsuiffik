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


def verify_isolation_report() -> None:
    report_path = DIST_DIR / "isolation-report.json"
    with report_path.open(encoding="utf-8") as file:
        report = json.load(file)

    if report.get("capability") != "passenger":
        raise AssertionError("isolation-report capability must be passenger")

    nuuk = "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80"
    qaqortoq = "plc_ebf06a92-e8e1-42e8-b45b-eedbc7843722"
    if nuuk not in report.get("isolated_place_ids", []):
        raise AssertionError("Nuuk must be passenger-isolated in current graph")
    if qaqortoq not in report.get("connected_place_ids", []):
        raise AssertionError("Qaqortoq must be passenger-connected in current graph")

    counts = report.get("counts") or {}
    if counts.get("places") != counts.get("connected", -1) + counts.get("isolated", -1):
        raise AssertionError("isolation-report counts do not add up")


def verify_single_dependency_report() -> None:
    report_path = DIST_DIR / "single-dependency-report.json"
    with report_path.open(encoding="utf-8") as file:
        report = json.load(file)

    if report.get("capability") != "passenger":
        raise AssertionError("single-dependency capability must be passenger")

    qaqortoq = "plc_ebf06a92-e8e1-42e8-b45b-eedbc7843722"
    nanortalik = "plc_8bfd9c7b-25f3-4363-9c8c-27f1ce551864"
    single_connection_ids = {
        row["place_id"] for row in report.get("single_connection", [])
    }
    if nanortalik not in single_connection_ids:
        raise AssertionError("Nanortalik must be single-connection dependent")
    if qaqortoq in single_connection_ids:
        raise AssertionError("Qaqortoq must not be single-connection dependent")

    single_mode_ids = {row["place_id"] for row in report.get("single_mode", [])}
    if qaqortoq not in single_mode_ids:
        raise AssertionError("Qaqortoq must be single-mode dependent")


def verify_seasonal_loss_report() -> None:
    report_path = DIST_DIR / "seasonal-loss-report.json"
    with report_path.open(encoding="utf-8") as file:
        report = json.load(file)

    if report.get("capability") != "passenger":
        raise AssertionError("seasonal-loss capability must be passenger")

    qaqortoq = "plc_ebf06a92-e8e1-42e8-b45b-eedbc7843722"
    losses = {row["place_id"]: row for row in report.get("losses", [])}
    if qaqortoq not in losses:
        raise AssertionError("Qaqortoq must appear in seasonal-loss (valid_from gap)")
    if losses[qaqortoq].get("isolated_months") != [1, 2, 3, 4]:
        raise AssertionError("Qaqortoq isolated months must be Jan–Apr for 2026")
    counts = report.get("counts") or {}
    if counts.get("places_with_seasonal_loss") != len(report.get("losses", [])):
        raise AssertionError("seasonal-loss counts do not match losses length")


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

        fts_name = db.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'place_names_fts'"
        ).fetchone()
        if not fts_name:
            raise AssertionError("place_names_fts FTS5 table missing")

        fts_count = db.execute("SELECT count(*) FROM place_names_fts").fetchone()[0]
        if fts_count < 1:
            raise AssertionError("place_names_fts is empty")

        prefix_hits = db.execute(
            "SELECT place_id FROM place_names_fts WHERE place_names_fts MATCH '\"Nuuk\"*' LIMIT 1"
        ).fetchall()
        if not prefix_hits:
            raise AssertionError("place_names_fts prefix MATCH failed for Nuuk")


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
    verify_isolation_report()
    verify_single_dependency_report()
    verify_seasonal_loss_report()
    verify_concurrent_service_projection()
    first = output_hashes()

    build()
    verify_manifest()
    verify_database()
    verify_isolation_report()
    verify_single_dependency_report()
    verify_seasonal_loss_report()
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
