#!/usr/bin/env python3
"""Fetch seed-name hits from the public NunaGIS PlacenamesRegister."""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent
LAYER_URL = (
    "https://kort.nunagis.gl/refserver/rest/services/"
    "PlacenamesRegister/PlacenamesRegisterPublic/MapServer/0"
)
OUT_FIELDS = (
    "OBJECTID,GlobalID,PlacenameOfficial,PlacenameOfficialOld,"
    "PlacenameVariant,PlacenameDanish,PlacenameInternational,"
    "PlacenameAlternative,Category,SubCategory,Type,LokalityCode,"
    "MunicipalityCode,ID,Creator,CreationDate,Editor,EditDate"
)
PAGE_SIZE = 200


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def seed_official_names(source_dir: Path) -> list[str]:
    names = []
    seen: set[str] = set()
    for row in read_ndjson(source_dir / "place-names.ndjson"):
        if (
            row.get("language") == "kl"
            and row.get("kind") == "official"
            and row.get("valid_to") is None
        ):
            value = row["value"]
            if value not in seen:
                seen.add(value)
                names.append(value)
    if not names:
        raise SystemExit(f"no current official Kalaallisut names in {source_dir}")
    return names


def escape_sql_string(value: str) -> str:
    return value.replace("'", "''")


def build_where(names: list[str]) -> str:
    clauses = [
        f"PlacenameOfficial = '{escape_sql_string(name)}'" for name in names
    ]
    return " OR ".join(clauses)


def query_page(where: str, offset: int) -> dict:
    params = {
        "f": "json",
        "where": where,
        "outFields": OUT_FIELDS,
        "returnGeometry": "false",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "orderByFields": "OBJECTID",
    }
    url = f"{LAYER_URL}/query?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(f"NunaGIS query error: {payload['error']}")
    return payload


def fetch_features(where: str) -> list[dict]:
    features: list[dict] = []
    offset = 0
    while True:
        payload = query_page(where, offset)
        batch = payload.get("features") or []
        features.extend(batch)
        if not payload.get("exceededTransferLimit") and len(batch) < PAGE_SIZE:
            break
        if not batch:
            break
        offset += len(batch)
    return features


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def read_json(path: Path) -> object:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


TYPE_21_23_WHERE = "Type IN (21,23)"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DATA_DIR / "source",
        help="Canonical source directory used to discover seed official names",
    )
    parser.add_argument(
        "--retrieved-at",
        type=str,
        default=date.today().isoformat(),
        help="Retrieval date YYYY-MM-DD used for the raw snapshot directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Override output directory (default: data/snapshots/nunagis_placenames/<date>)",
    )
    parser.add_argument(
        "--legacy-raw-dir",
        action="store_true",
        help="Also mirror output to data/raw/nunagis_placenames/<date>",
    )
    parser.add_argument(
        "--localities",
        action="store_true",
        help="Fetch all Type 21/23 locality rows (writes type-21-23-query.json)",
    )
    args = parser.parse_args()

    names: list[str] | None = None
    if args.localities:
        where = TYPE_21_23_WHERE
        payload_name = "type-21-23-query.json"
        query_meta: dict = {
            "where": where,
            "outFields": OUT_FIELDS,
            "returnGeometry": False,
        }
    else:
        names = seed_official_names(args.source_dir)
        where = build_where(names)
        payload_name = "seed-name-query.json"
        query_meta = {
            "names": names,
            "where": where,
            "outFields": OUT_FIELDS,
            "returnGeometry": False,
        }

    features = fetch_features(where)

    output_dir = args.output_dir or (
        DATA_DIR / "snapshots" / "nunagis_placenames" / args.retrieved_at
    )
    features_path = output_dir / payload_name
    write_json(
        features_path,
        {
            "layerUrl": LAYER_URL,
            "query": query_meta,
            "featureCount": len(features),
            "features": features,
        },
    )

    checksum = sha256_file(features_path)
    query_url = (
        f"{LAYER_URL}/query?"
        + urllib.parse.urlencode(
            {
                "f": "json",
                "where": where,
                "outFields": OUT_FIELDS,
                "returnGeometry": "false",
            }
        )
    )
    retrieved_at_iso = (
        f"{args.retrieved_at}T00:00:00Z"
        if "T" not in args.retrieved_at
        else args.retrieved_at
    )
    snapshot_id = f"snp_nunagis_placenames_{args.retrieved_at.replace('-', '_')}"
    storage_path = str(output_dir.relative_to(DATA_DIR))
    scope_note = (
        "Full Type 21/23 locality extract."
        if args.localities
        else "Seed-name filter extract."
    )
    snapshot_manifest = {
        "id": snapshot_id,
        "source_dataset_id": "dsd_nunagis_placenames_register",
        "url": LAYER_URL,
        "retrieved_at": retrieved_at_iso,
        "media_type": "application/json",
        "checksum": f"sha256:{checksum}",
        "schema_fingerprint": None,
        "licence_status": "unknown",
        "storage_path": storage_path,
        "byte_size": features_path.stat().st_size,
        "record_count": len(features),
        "notes": (
            "Public ArcGIS REST extract of Stednavneregister offentlig. "
            "Oqaasileriffik (Tino Didriksen) pointed Ole to this endpoint on "
            "2026-07-30 as the official NunaGIS placenames source. "
            f"{scope_note} Attributes only; geometry omitted. "
            "Licence not stated on service metadata."
        ),
    }
    write_json(output_dir / "manifest.json", snapshot_manifest)

    if args.legacy_raw_dir:
        legacy_dir = DATA_DIR / "raw" / "nunagis_placenames" / args.retrieved_at
        if legacy_dir != output_dir:
            legacy_dir.mkdir(parents=True, exist_ok=True)
            write_json(legacy_dir / payload_name, read_json(features_path))
            legacy_manifest: dict = {
                "source_id": "src_nunagis_placenames_register",
                "title": (
                    "NunaGIS PlacenamesRegisterPublic Type 21/23 query"
                    if args.localities
                    else "NunaGIS PlacenamesRegisterPublic seed-name query"
                ),
                "publisher": "NunaGIS / Oqaasileriffik",
                "url": LAYER_URL,
                "query_url": query_url,
                "retrieved_at": args.retrieved_at,
                "media_type": "application/json",
                "checksum": f"sha256:{checksum}",
                "licence": None,
                "record_count": len(features),
                "notes": snapshot_manifest["notes"],
            }
            if names is not None:
                legacy_manifest["seed_official_names"] = names
            write_json(legacy_dir / "manifest.json", legacy_manifest)

    label = (
        f"{len(features)} Type 21/23 locality features"
        if args.localities
        else f"{len(features)} features for {len(names or [])} seed names"
    )
    print(f"Wrote {label} to {output_dir}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as exc:
        raise SystemExit(f"NunaGIS request failed: {exc}") from exc
