#!/usr/bin/env python3
"""Build feature→place crosswalk for the web product.

Sources (priority):
1. Confirmed external-identifiers with namespace nunagis.global_id → canonical
2. place-seeds oqaasileriffik candidate_exact_name → candidate

Exact-name candidates are not verified merges; they carry identityStatus=candidate
so the UI can join seed reachability without claiming authority confirmation.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "source"
SEEDS = ROOT / "data" / "reconciliation" / "place-seeds.ndjson"
OUT = ROOT / "web" / "public" / "data" / "identity-crosswalk.json"


def load_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def main() -> None:
    by_global: dict[str, dict] = {}

    for row in load_ndjson(SOURCE / "external-identifiers.ndjson"):
        if row.get("entity_type") != "place":
            continue
        if row.get("namespace") != "nunagis.global_id":
            continue
        global_id = str(row["value"]).strip().strip("{}").upper()
        place_id = row["entity_id"]
        by_global[global_id] = {
            "featureId": f"nunagis:{global_id}",
            "placeId": place_id,
            "identityStatus": "canonical",
            "globalId": global_id,
        }

    for seed in load_ndjson(SEEDS):
        match = (seed.get("authority_matches") or {}).get("oqaasileriffik") or {}
        status = match.get("status")
        record_id = match.get("record_id")
        if status not in {"candidate_exact_name", "matched"} or not record_id:
            continue
        global_id = str(record_id).strip().strip("{}").upper()
        if global_id in by_global:
            continue
        identity_status = "canonical" if status == "matched" else "candidate"
        by_global[global_id] = {
            "featureId": f"nunagis:{global_id}",
            "placeId": seed["place_id"],
            "identityStatus": identity_status,
            "globalId": global_id,
            "officialName": seed.get("current_official_name"),
        }

    entries = sorted(by_global.values(), key=lambda e: e["placeId"])
    payload = {
        "generatedFrom": "data/source/external-identifiers.ndjson + data/reconciliation/place-seeds.ndjson",
        "note": (
            "candidate entries come from exact-name reconciliation candidates; "
            "they are not confirmed identity merges. Promote via external-identifiers."
        ),
        "entries": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    canonical = sum(1 for e in entries if e["identityStatus"] == "canonical")
    candidate = sum(1 for e in entries if e["identityStatus"] == "candidate")
    print(
        f"Wrote {len(entries)} crosswalk entries "
        f"({canonical} canonical, {candidate} candidate) → {OUT}"
    )


if __name__ == "__main__":
    main()
