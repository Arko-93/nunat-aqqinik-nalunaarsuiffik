#!/usr/bin/env python3
"""Build a map-ready reachability graph from canonical NDJSON sources."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "source"
OUT = ROOT / "web" / "public" / "data" / "reachability-graph.json"


def load_ndjson(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def service_payload(row: dict) -> dict:
    return {
        "serviceId": row["id"],
        "operator": row.get("operator"),
        "capabilities": row.get("capabilities") or [],
        "frequencyBand": row.get("frequency_band"),
        "frequencyBasis": row.get("frequency_basis"),
        "seasonality": row.get("seasonality") or {"kind": "unknown", "months": []},
        "status": row.get("status"),
        "validFrom": row.get("valid_from"),
        "validTo": row.get("valid_to"),
        "sourceRefs": row.get("source_refs") or [],
    }


def main() -> None:
    places = {row["id"]: row for row in load_ndjson(SOURCE / "places.ndjson")}
    names = load_ndjson(SOURCE / "place-names.ndjson")
    geoms = load_ndjson(SOURCE / "place-geometries.ndjson")
    connections = load_ndjson(SOURCE / "connections.ndjson")
    services = load_ndjson(SOURCE / "connection-services.ndjson")

    official: dict[str, str] = {}
    danish: dict[str, str] = {}
    historical: dict[str, str] = {}
    for row in names:
        place_id = row["place_id"]
        kind = row.get("kind")
        lang = row.get("language")
        value = row["value"]
        if kind == "official" and lang == "kl":
            official[place_id] = value
        elif kind == "exonym" and lang == "da":
            danish[place_id] = value
        elif kind in {"historical", "former", "old"}:
            historical[place_id] = value
        elif kind == "official" and place_id not in official:
            official[place_id] = value

    coords: dict[str, tuple[float, float]] = {}
    for row in geoms:
        geometry = row.get("geometry") or {}
        if geometry.get("type") != "Point":
            continue
        lon, lat = geometry["coordinates"][:2]
        coords[row["place_id"]] = (float(lon), float(lat))

    services_by_connection: dict[str, list[dict]] = {}
    for row in services:
        services_by_connection.setdefault(row["connection_id"], []).append(row)

    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    for connection in connections:
        if connection.get("retired_at"):
            continue
        origin = connection["origin_place_id"]
        destination = connection["destination_place_id"]
        for place_id in (origin, destination):
            if place_id not in places or place_id not in official or place_id not in coords:
                continue
            lon, lat = coords[place_id]
            nodes[place_id] = {
                "placeId": place_id,
                "officialName": official[place_id],
                "danishName": danish.get(place_id),
                "historicalName": historical.get(place_id),
                "longitude": lon,
                "latitude": lat,
            }

        if origin not in nodes or destination not in nodes:
            continue

        active = [
            svc
            for svc in services_by_connection.get(connection["id"], [])
            if svc.get("status") == "active" and svc.get("valid_to") is None
        ]
        # Preserve every applicable service; do not collapse to the first only.
        service_rows = [service_payload(svc) for svc in active]
        primary = service_rows[0] if service_rows else None
        edges.append(
            {
                "id": connection["id"],
                "fromPlaceId": origin,
                "toPlaceId": destination,
                "fromName": official[origin],
                "toName": official[destination],
                "direction": connection.get("direction", "bidirectional"),
                "mode": connection["mode"],
                "services": service_rows,
                # Convenience fields from the first active service (UI summary).
                "operator": primary["operator"] if primary else None,
                "frequencyBand": primary["frequencyBand"] if primary else None,
                "seasonality": (
                    primary["seasonality"]
                    if primary
                    else {"kind": "unknown", "months": []}
                ),
            }
        )

    payload = {
        "generatedFrom": "data/source",
        "nodes": list(nodes.values()),
        "edges": edges,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(nodes)} nodes, {len(edges)} edges → {OUT}")


if __name__ == "__main__":
    main()
