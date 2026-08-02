#!/usr/bin/env python3
"""Shared helpers for immutable snapshots and named releases."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


DATA_DIR = Path(__file__).resolve().parent.parent
SCHEMA_DIR = DATA_DIR / "schema"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
RELEASES_DIR = DATA_DIR / "releases"
SOURCE_DIR = DATA_DIR / "source"
DIST_DIR = DATA_DIR / "dist"

META_SCHEMAS = {
    "source-dataset": "source-dataset.schema.json",
    "source-snapshot": "source-snapshot.schema.json",
    "import-run": "import-run.schema.json",
    "change-event": "change-event.schema.json",
    "release-manifest": "release-manifest.schema.json",
}

RELEASE_ARTIFACTS = [
    "nunat-aqqinik-nalunaarsuiffik.ndjson",
    "nunat-aqqinik-nalunaarsuiffik.json",
    "nunat-aqqinik-nalunaarsuiffik.geojson",
    "nunat-aqqinik-nalunaarsuiffik.csv",
    "reachability.ndjson",
    "reachability.json",
    "reachability.csv",
    "decision-geography.db",
    "build-manifest.json",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_datetime(value: datetime | None = None) -> str:
    current = value or utc_now()
    return current.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_prefixed(path: Path) -> str:
    return f"sha256:{sha256_file(path)}"


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def load_schema(name: str) -> dict:
    with (SCHEMA_DIR / name).open(encoding="utf-8") as file:
        return json.load(file)


def validate_record(record: dict, schema_name: str, label: str) -> None:
    schema = load_schema(schema_name)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(record), key=lambda err: err.path)
    if errors:
        messages = "; ".join(error.message for error in errors)
        raise ValueError(f"{label}: {messages}")


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def read_source_datasets() -> list[dict]:
    return read_ndjson(SNAPSHOTS_DIR / "source-datasets.ndjson")


def discover_snapshot_manifests() -> list[dict]:
    manifests: list[dict] = []
    if not SNAPSHOTS_DIR.exists():
        return manifests
    for manifest_path in sorted(SNAPSHOTS_DIR.glob("*/*/manifest.json")):
        payload = load_json(manifest_path)
        if isinstance(payload, dict) and payload.get("id", "").startswith("snp_"):
            manifests.append(payload)
    return manifests


def latest_snapshot_dir(source_slug: str) -> Path | None:
    root = SNAPSHOTS_DIR / source_slug
    if not root.exists():
        return None
    candidates = sorted(
        path
        for path in root.iterdir()
        if path.is_dir() and (path / "manifest.json").exists()
    )
    return candidates[-1] if candidates else None


def data_as_of_from_source(source_dir: Path = SOURCE_DIR) -> str:
    date_fields = (
        "observed_at",
        "created_at",
        "retrieved_at",
        "effective_from",
        "valid_from",
    )
    dates: list[str] = []
    for name in (
        "places.ndjson",
        "place-classifications.ndjson",
        "place-names.ndjson",
        "place-geometries.ndjson",
        "administrative-areas.ndjson",
        "administrative-memberships.ndjson",
        "external-identifiers.ndjson",
        "connections.ndjson",
        "connection-services.ndjson",
        "sources.ndjson",
    ):
        for record in read_ndjson(source_dir / name):
            for field in date_fields:
                value = record.get(field)
                if value:
                    dates.append(value)
    if not dates:
        return date.today().isoformat()
    return max(dates)


def default_release_id(data_as_of: str, sequence: int = 1) -> str:
    return f"{data_as_of.replace('-', '.')}.{sequence}"


def publication_blockers(source_dir: Path = SOURCE_DIR) -> list[dict]:
    from validate import ValidationRunner

    runner = ValidationRunner(source_dir)
    runner.run_all(check_pending=True)

    blockers: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(code: str, message: str, severity: str = "blocker", **extra: str | None) -> None:
        key = (code, message)
        if key in seen:
            return
        seen.add(key)
        blockers.append({"code": code, "message": message, "severity": severity, **extra})

    for error in runner.errors:
        if "pending" in error:
            add("pending_provenance", error, source_id=_extract_quoted(error))
        elif "verified source" in error and "no URL" in error:
            add("verified_source_missing_url", error, source_id=_extract_quoted(error))
        elif "verified source" in error and "no retrieved_at" in error:
            add("verified_source_missing_retrieved_at", error, source_id=_extract_quoted(error))
        else:
            add("validation_error", error)

    for snapshot in discover_snapshot_manifests():
        if snapshot.get("licence_status") == "unknown":
            add(
                "unknown_redistribution_status",
                (
                    f"Snapshot '{snapshot['id']}' has unknown licence_status; "
                    "redistribution terms are not verified."
                ),
                severity="blocker",
                snapshot_id=snapshot["id"],
            )
        elif snapshot.get("licence_status") == "restricted":
            add(
                "restricted_redistribution",
                f"Snapshot '{snapshot['id']}' is marked restricted.",
                severity="blocker",
                snapshot_id=snapshot["id"],
            )
        elif snapshot.get("licence_status") == "pending_review":
            add(
                "licence_pending_review",
                f"Snapshot '{snapshot['id']}' licence is pending review.",
                severity="warning",
                snapshot_id=snapshot["id"],
            )

    for source in read_ndjson(source_dir / "sources.ndjson"):
        if source.get("licence") is None and source.get("verification_status") == "verified":
            add(
                "unknown_source_licence",
                (
                    f"Verified source '{source['id']}' has no licence field; "
                    "redistribution status is not recorded."
                ),
                severity="warning",
                source_id=source["id"],
            )

    return blockers


def _extract_quoted(message: str) -> str | None:
    if "'" not in message:
        return None
    parts = message.split("'")
    return parts[1] if len(parts) >= 2 else None
