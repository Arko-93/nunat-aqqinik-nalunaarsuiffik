#!/usr/bin/env python3
"""Normalize NunaGIS locality records into the Oqaasileriffik authority contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent
LOCALITY_TYPES = {
    21: "town",  # By
    23: "settlement",  # Bygd
}


def read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def strip_global_id(value: str | None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("GlobalID must be a non-empty string")
    return value.strip().strip("{}")


def normalize_features(features: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for feature in features:
        attributes = feature.get("attributes") or feature
        type_code = attributes.get("Type")
        if type_code not in LOCALITY_TYPES:
            continue
        record_id = strip_global_id(attributes.get("GlobalID"))
        if record_id in seen:
            raise ValueError(f"duplicate GlobalID after normalize: {record_id}")
        seen.add(record_id)
        numeric_id = attributes.get("ID")
        if not isinstance(numeric_id, int) or isinstance(numeric_id, bool):
            raise ValueError(f"missing numeric ID for GlobalID {record_id}")
        official_name = attributes.get("PlacenameOfficial")
        if not isinstance(official_name, str) or not official_name.strip():
            raise ValueError(f"missing PlacenameOfficial for GlobalID {record_id}")
        rows.append(
            {
                "namespace": "oqaasileriffik",
                "record_id": record_id,
                "official_name": official_name.strip(),
                "feature_type": LOCALITY_TYPES[type_code],
                "decision_ref": f"nunagis.placenames:ID={numeric_id}",
            }
        )
    rows.sort(key=lambda row: (row["official_name"], row["record_id"]))
    return rows


def carry_confirmations(
    rows: list[dict], previous_rows: list[dict]
) -> list[dict]:
    """Preserve confirmed_place_id across re-normalize.

    Prefer decision_ref (stable numeric ID) because NunaGIS GlobalIDs can
    rotate between extracts. Fall back to record_id for rows without a ref.
    """
    by_decision: dict[str, str] = {}
    by_record: dict[str, str] = {}
    for row in previous_rows:
        place_id = row.get("confirmed_place_id")
        if not place_id:
            continue
        decision_ref = row.get("decision_ref")
        if isinstance(decision_ref, str) and decision_ref:
            by_decision[decision_ref] = place_id
        record_id = row.get("record_id")
        if isinstance(record_id, str) and record_id:
            by_record[record_id] = place_id
    for row in rows:
        place_id = None
        decision_ref = row.get("decision_ref")
        if isinstance(decision_ref, str) and decision_ref:
            place_id = by_decision.get(decision_ref)
        if place_id is None:
            place_id = by_record.get(row.get("record_id"))
        if place_id:
            row["confirmed_place_id"] = place_id
    return rows


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            )


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


PAYLOAD_NAMES = ("type-21-23-query.json", "seed-name-query.json")


def latest_snapshot_payload(
    root: Path, payload_names: tuple[str, ...] = PAYLOAD_NAMES
) -> Path:
    if not root.exists():
        raise SystemExit(f"snapshot root missing: {root}")
    for payload_name in payload_names:
        candidates = sorted(
            path
            for path in root.iterdir()
            if path.is_dir() and (path / payload_name).exists()
        )
        if candidates:
            return candidates[-1] / payload_name
    raise SystemExit(
        f"no {' or '.join(payload_names)} snapshots under {root}"
    )


def latest_snapshot(root: Path, payload_name: str = "seed-name-query.json") -> Path:
    """Return the latest dated directory that contains payload_name."""
    return latest_snapshot_payload(root, (payload_name,)).parent


def latest_raw_snapshot(raw_root: Path) -> Path:
    return latest_snapshot(raw_root)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help=(
            "Path to type-21-23-query.json or seed-name-query.json "
            "(default: latest dated snapshot, preferring type-21-23)"
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DATA_DIR / "reconciliation" / "authority" / "oqaasileriffik-nunagis.ndjson",
    )
    args = parser.parse_args()

    input_path = args.input
    if input_path is None:
        snapshot_root = DATA_DIR / "snapshots" / "nunagis_placenames"
        raw_root = DATA_DIR / "raw" / "nunagis_placenames"
        if snapshot_root.exists() and list(snapshot_root.iterdir()):
            input_path = latest_snapshot_payload(snapshot_root)
        else:
            input_path = latest_snapshot_payload(raw_root)
    payload = read_json(input_path)
    features = payload.get("features")
    if not isinstance(features, list):
        raise SystemExit(f"{input_path}: expected features array")

    rows = normalize_features(features)
    previous = read_ndjson(args.output)
    rows = carry_confirmations(rows, previous)
    write_ndjson(args.output, rows)
    print(
        f"Wrote {len(rows)} Type 21/23 authority rows from {input_path} to {args.output}"
    )


if __name__ == "__main__":
    main()
