#!/usr/bin/env python3
"""Build a non-destructive reconciliation queue for the 15 seed places."""

import argparse
import json
import unicodedata
from collections import defaultdict
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent
EXPECTED_AUTHORITIES = ("oqaasileriffik", "asiaq")


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def normalized_name(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value)
    return " ".join(normalized.casefold().split())


def require_authority_record(record: dict, path: Path, line_number: int) -> None:
    required = {"namespace", "record_id", "official_name"}
    missing = sorted(required - record.keys())
    if missing:
        raise ValueError(
            f"{path}:{line_number}: missing required fields: {', '.join(missing)}"
        )
    if record["namespace"] not in EXPECTED_AUTHORITIES:
        raise ValueError(
            f"{path}:{line_number}: unsupported namespace "
            f"{record['namespace']!r}; expected {EXPECTED_AUTHORITIES}"
        )
    if not all(
        isinstance(record[field], str) and record[field].strip()
        for field in required
    ):
        raise ValueError(
            f"{path}:{line_number}: namespace, record_id, and official_name "
            "must be non-empty strings"
        )
    allowed = {
        "namespace",
        "record_id",
        "official_name",
        "feature_type",
        "longitude",
        "latitude",
        "decision_ref",
        "confirmed_place_id",
    }
    unknown = sorted(record.keys() - allowed)
    if unknown:
        raise ValueError(
            f"{path}:{line_number}: unknown fields: {', '.join(unknown)}"
        )
    if ("longitude" in record) != ("latitude" in record):
        raise ValueError(
            f"{path}:{line_number}: longitude and latitude must be supplied together"
        )
    if "longitude" in record:
        longitude = record["longitude"]
        latitude = record["latitude"]
        if (
            not isinstance(longitude, (int, float))
            or isinstance(longitude, bool)
            or not -180 <= longitude <= 180
            or not isinstance(latitude, (int, float))
            or isinstance(latitude, bool)
            or not -90 <= latitude <= 90
        ):
            raise ValueError(f"{path}:{line_number}: invalid WGS84 coordinates")


def read_authority_records(paths: list[Path]) -> list[dict]:
    records = []
    seen = set()
    for path in paths:
        with path.open(encoding="utf-8") as file:
            for line_number, line in enumerate(file, 1):
                if not line.strip():
                    continue
                record = json.loads(line)
                require_authority_record(record, path, line_number)
                key = (record["namespace"], record["record_id"])
                if key in seen:
                    raise ValueError(
                        f"{path}:{line_number}: duplicate authority key {key}"
                    )
                seen.add(key)
                records.append(record)
    return records


def current_by_place(rows: list[dict]) -> dict[str, dict]:
    return {row["place_id"]: row for row in rows if row.get("valid_to") is None}


def field_differences(
    authority: dict,
    name: dict,
    classification: dict | None,
    geometry: dict | None,
) -> list[dict]:
    differences = []
    if authority["official_name"] != name["value"]:
        differences.append(
            {
                "field": "official_name",
                "seed": name["value"],
                "authority": authority["official_name"],
            }
        )
    if (
        authority.get("feature_type") is not None
        and classification is not None
        and authority["feature_type"] != classification["feature_type"]
    ):
        differences.append(
            {
                "field": "feature_type",
                "seed": classification["feature_type"],
                "authority": authority["feature_type"],
            }
        )
    if (
        "longitude" in authority
        and geometry is not None
        and [
            authority["longitude"],
            authority["latitude"],
        ]
        != geometry["geometry"]["coordinates"]
    ):
        differences.append(
            {
                "field": "geometry",
                "seed": geometry["geometry"]["coordinates"],
                "authority": [
                    authority["longitude"],
                    authority["latitude"],
                ],
            }
        )
    return differences


def build_report(source_dir: Path, authority_records: list[dict]) -> list[dict]:
    places = read_ndjson(source_dir / "places.ndjson")
    names = current_by_place(
        [
            row
            for row in read_ndjson(source_dir / "place-names.ndjson")
            if row["language"] == "kl" and row["kind"] == "official"
        ]
    )
    classifications = current_by_place(
        read_ndjson(source_dir / "place-classifications.ndjson")
    )
    geometries = current_by_place(
        read_ndjson(source_dir / "place-geometries.ndjson")
    )

    by_namespace_name = defaultdict(list)
    confirmed = defaultdict(list)
    namespace_counts = defaultdict(int)
    place_ids = {place["id"] for place in places}
    for authority in authority_records:
        namespace_counts[authority["namespace"]] += 1
        by_namespace_name[
            authority["namespace"], normalized_name(authority["official_name"])
        ].append(authority)
        if authority.get("confirmed_place_id"):
            if authority["confirmed_place_id"] not in place_ids:
                raise ValueError(
                    "authority record "
                    f"{authority['namespace']}:{authority['record_id']} confirms "
                    f"unknown place {authority['confirmed_place_id']}"
                )
            confirmed[
                authority["confirmed_place_id"], authority["namespace"]
            ].append(authority)

    report = []
    for place in places:
        place_id = place["id"]
        name = names[place_id]
        classification = classifications.get(place_id)
        geometry = geometries.get(place_id)
        authority_matches = {}
        all_differences = []

        for namespace in EXPECTED_AUTHORITIES:
            confirmed_records = confirmed.get((place_id, namespace), [])
            candidates = by_namespace_name.get(
                (namespace, normalized_name(name["value"])), []
            )
            if len(confirmed_records) > 1:
                match_status = "ambiguous_confirmation"
                selected = None
            elif len(confirmed_records) == 1:
                match_status = "confirmed"
                selected = confirmed_records[0]
            elif not namespace_counts[namespace]:
                match_status = "waiting_for_export"
                selected = None
            elif len(candidates) == 1:
                match_status = "candidate_exact_name"
                selected = candidates[0]
            elif len(candidates) > 1:
                match_status = "ambiguous_exact_name"
                selected = None
            else:
                match_status = "missing"
                selected = None

            differences = (
                field_differences(selected, name, classification, geometry)
                if selected is not None
                else []
            )
            all_differences.extend(
                [{"namespace": namespace, **difference} for difference in differences]
            )
            authority_matches[namespace] = {
                "status": match_status,
                "record_id": selected["record_id"] if selected else None,
                "candidate_record_ids": [
                    candidate["record_id"] for candidate in candidates
                ],
                "decision_ref": selected.get("decision_ref") if selected else None,
                "differences": differences,
            }

        statuses = {
            match["status"] for match in authority_matches.values()
        }
        if statuses == {"confirmed"}:
            status = "conflicting" if all_differences else "matched"
        elif "missing" in statuses:
            status = "missing"
        elif statuses & {"ambiguous_confirmation", "ambiguous_exact_name"}:
            status = "conflicting"
        else:
            status = "unresolved"

        report.append(
            {
                "place_id": place_id,
                "current_official_name": name["value"],
                "current_feature_type": (
                    classification["feature_type"] if classification else None
                ),
                "current_geometry": (
                    geometry["geometry"]["coordinates"] if geometry else None
                ),
                "status": status,
                "authority_matches": authority_matches,
                "differences": all_differences,
            }
        )
    return report


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(
                json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir", type=Path, default=DATA_DIR / "source"
    )
    parser.add_argument(
        "--authority",
        type=Path,
        action="append",
        default=[],
        help="Normalized authority NDJSON; may be supplied more than once",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DATA_DIR / "reconciliation" / "place-seeds.ndjson",
    )
    args = parser.parse_args()

    report = build_report(
        args.source_dir, read_authority_records(args.authority)
    )
    write_ndjson(args.output, report)
    counts = {
        status: sum(row["status"] == status for row in report)
        for status in ("matched", "conflicting", "missing", "unresolved")
    }
    print(
        f"Wrote {len(report)} reconciliation rows to {args.output} — "
        + ", ".join(f"{key}={value}" for key, value in counts.items())
    )


if __name__ == "__main__":
    main()
