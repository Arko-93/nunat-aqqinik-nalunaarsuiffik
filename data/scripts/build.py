#!/usr/bin/env python3
"""Build denormalized consumer distributions from canonical sources."""

import csv
import hashlib
import json
import os
from collections import OrderedDict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path(os.environ.get("DECISION_GEOGRAPHY_SOURCE_DIR", DATA_DIR / "source"))
DIST_DIR = Path(os.environ.get("DECISION_GEOGRAPHY_DIST_DIR", DATA_DIR / "dist"))

SRC = "nunat-aqqinik-nalunaarsuiffik"
RCH = "reachability"


def read_ndjson(path):
    rows = []
    if path.exists():
        with path.open(encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if s:
                    rows.append(json.loads(s))
    return rows


def build():
    os.makedirs(DIST_DIR, exist_ok=True)

    places = read_ndjson(SOURCE_DIR / "places.ndjson")
    classifications = read_ndjson(SOURCE_DIR / "place-classifications.ndjson")
    names = read_ndjson(SOURCE_DIR / "place-names.ndjson")
    geoms = read_ndjson(SOURCE_DIR / "place-geometries.ndjson")
    areas = read_ndjson(SOURCE_DIR / "administrative-areas.ndjson")
    memberships = read_ndjson(SOURCE_DIR / "administrative-memberships.ndjson")
    external_ids = read_ndjson(SOURCE_DIR / "external-identifiers.ndjson")
    connections = read_ndjson(SOURCE_DIR / "connections.ndjson")
    services = read_ndjson(SOURCE_DIR / "connection-services.ndjson")
    sources = read_ndjson(SOURCE_DIR / "sources.ndjson")

    # URL-encode helper for slug
    import urllib.parse

    def slugify(s):
        return urllib.parse.quote(s.lower().replace(" ", "-").replace("/", "-"), safe="-")

    # Index: place -> current name
    names_by_place = {}
    for n in names:
        if n.get("valid_to") is None:
            names_by_place.setdefault(n["place_id"], []).append(n)

    classification_by_place = {
        classification["place_id"]: classification
        for classification in classifications
        if classification.get("valid_to") is None
    }

    # Index: place -> current geometry
    geom_by_place = {}
    for g in geoms:
        if g.get("valid_to") is None:
            geom_by_place[g["place_id"]] = g

    # Index: area id -> area
    area_map = {a["id"]: a for a in areas}

    # Index: place -> current memberships
    mems_by_place = {}
    for m in memberships:
        if m.get("valid_to") is None:
            mems_by_place.setdefault(m["place_id"], []).append(m)

    # Index: connection -> current services
    svc_by_conn = {}
    for s in services:
        if s.get("valid_to") is None:
            svc_by_conn.setdefault(s["connection_id"], []).append(s)

    # Slug dedup
    slug_counts = {}

    # Build denormalized places
    denorm_places = []
    for p in sorted(
        (place for place in places if place.get("status") != "retired"),
        key=lambda x: x["id"],
    ):
        pid = p["id"]
        pnames = names_by_place.get(pid, [])
        official = next((n for n in pnames if n.get("kind") == "official" and n.get("language") == "kl"), None)
        alt = [n for n in pnames if n != official]
        geo = geom_by_place.get(pid)
        classification = classification_by_place.get(pid)

        name_val = official["value"] if official else ""
        base_slug = slugify(name_val) if name_val else pid
        slug_counts[base_slug] = slug_counts.get(base_slug, 0) + 1
        slug = base_slug if slug_counts[base_slug] == 1 else f"{base_slug}-{slug_counts[base_slug]}"

        adm = []
        for m in mems_by_place.get(pid, []):
            area = area_map.get(m.get("administrative_area_id", ""))
            adm.append({
                "assertion_id": m["id"],
                "level": area["level"] if area else "",
                "name": area["name"] if area else "",
                "valid_from": m.get("valid_from"),
                "valid_to": m.get("valid_to"),
                "source_refs": m.get("source_refs", []),
                "observed_at": m.get("observed_at"),
            })

        row = OrderedDict()
        row["id"] = pid
        row["slug"] = slug
        row["canonical_name"] = {
            "assertion_id": official["id"] if official else None,
            "value": name_val,
            "language": "kl",
            "valid_from": official.get("valid_from") if official else None,
            "valid_to": official.get("valid_to") if official else None,
            "source_refs": official.get("source_refs", []) if official else [],
        }
        row["alternate_names"] = [
            {
                "assertion_id": n["id"],
                "value": n["value"],
                "language": n["language"],
                "kind": n.get("kind", "alias"),
                "valid_from": n.get("valid_from"),
                "valid_to": n.get("valid_to"),
                "source_refs": n.get("source_refs", []),
            }
            for n in alt
        ]
        if geo:
            row["coordinates"] = {
                "assertion_id": geo["id"],
                "latitude": geo["geometry"]["coordinates"][1],
                "longitude": geo["geometry"]["coordinates"][0],
                "valid_from": geo.get("valid_from"),
                "valid_to": geo.get("valid_to"),
                "source_refs": geo.get("source_refs", []),
            }
        else:
            row["coordinates"] = None
        row["feature_type"] = (
            classification.get("feature_type", "") if classification else ""
        )
        row["status"] = p.get("status", "active")
        row["classification_source_refs"] = (
            classification.get("source_refs", []) if classification else []
        )
        row["administrative_memberships"] = adm
        row["source_refs"] = official.get("source_refs", []) if official else []
        observed_dates = [
            assertion.get("observed_at")
            for assertion in [
                *pnames,
                *mems_by_place.get(pid, []),
                *([classification] if classification else []),
                *([geo] if geo else []),
            ]
            if assertion.get("observed_at")
        ]
        row["updated_at"] = max(observed_dates) if observed_dates else p.get("created_at", "")
        denorm_places.append(row)

    # Build denormalized reachability
    denorm_reach = []
    for c in sorted(
        (connection for connection in connections if connection.get("retired_at") is None),
        key=lambda x: x["id"],
    ):
        cid = c["id"]
        current_services = sorted(
            svc_by_conn.get(cid, []),
            key=lambda service: service["id"],
        )
        row = OrderedDict()
        row["id"] = cid
        row["origin_place_id"] = c.get("origin_place_id", "")
        row["destination_place_id"] = c.get("destination_place_id", "")
        row["direction"] = c.get("direction", "")
        row["mode"] = c.get("mode", "")
        row["services"] = [
            {
                "id": service["id"],
                "operator": service.get("operator"),
                "capabilities": service.get("capabilities", []),
                "seasonality": service.get(
                    "seasonality", {"kind": "unknown", "months": []}
                ),
                "frequency_band": service.get("frequency_band", "unknown"),
                "frequency_basis": service.get("frequency_basis", "unknown"),
                "status": service.get("status", "active"),
                "valid_from": service.get("valid_from"),
                "valid_to": service.get("valid_to"),
                "source_refs": service.get("source_refs", []),
                "observed_at": service.get("observed_at"),
            }
            for service in current_services
        ]
        service_dates = [
            service.get("observed_at")
            for service in current_services
            if service.get("observed_at")
        ]
        row["updated_at"] = (
            max(service_dates) if service_dates else c.get("created_at", "")
        )
        denorm_reach.append(row)

    # ----- Write outputs -----

    def w_ndjson(name, rows):
        path = DIST_DIR / f"{name}.ndjson"
        with path.open("w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return len(rows)

    def w_json(name, rows):
        path = DIST_DIR / f"{name}.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)

    def w_csv(name, fields, rows, mapper):
        path = DIST_DIR / f"{name}.csv"
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(fields)
            for r in rows:
                w.writerow(mapper(r))

    def w_geojson(name, features):
        path = DIST_DIR / f"{name}.geojson"
        fc = {
            "type": "FeatureCollection",
            "features": features,
        }
        with path.open("w", encoding="utf-8") as f:
            json.dump(fc, f, indent=2, ensure_ascii=False)

    p_count = w_ndjson(SRC, denorm_places)
    w_json(SRC, denorm_places)

    place_features = []
    for r in denorm_places:
        if r.get("coordinates"):
            place_features.append({
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "slug": r["slug"],
                    "name_kl": r["canonical_name"]["value"],
                    "alternate_names": r["alternate_names"],
                    "feature_type": r["feature_type"],
                    "status": r["status"],
                    "classification_source_refs": r["classification_source_refs"],
                    "administrative_memberships": r["administrative_memberships"],
                    "source_refs": r["source_refs"],
                    "geometry_source_refs": r["coordinates"]["source_refs"],
                    "updated_at": r["updated_at"],
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [r["coordinates"]["longitude"], r["coordinates"]["latitude"]],
                },
            })
        else:
            place_features.append({
                "type": "Feature",
                "properties": {
                    "id": r["id"],
                    "slug": r["slug"],
                    "name_kl": r["canonical_name"]["value"],
                    "alternate_names": r["alternate_names"],
                    "feature_type": r["feature_type"],
                    "status": r["status"],
                    "classification_source_refs": r["classification_source_refs"],
                    "administrative_memberships": r["administrative_memberships"],
                    "source_refs": r["source_refs"],
                    "geometry_source_refs": [],
                    "updated_at": r["updated_at"],
                },
                "geometry": None,
            })
    w_geojson(SRC, place_features)

    w_csv(SRC,
        ["id", "slug", "name_kl", "name_da", "latitude", "longitude", "feature_type", "municipality", "status", "updated_at"],
        denorm_places,
        lambda r: [
            r["id"],
            r["slug"],
            r["canonical_name"]["value"],
            next((n["value"] for n in r["alternate_names"] if n.get("language") == "da"), ""),
            r["coordinates"]["latitude"] if r.get("coordinates") else "",
            r["coordinates"]["longitude"] if r.get("coordinates") else "",
            r["feature_type"],
            next((m["name"] for m in r.get("administrative_memberships", []) if not m.get("valid_to")), ""),
            r["status"],
            r["updated_at"],
        ]
    )

    r_count = w_ndjson(RCH, denorm_reach)
    w_json(RCH, denorm_reach)
    w_csv(RCH,
        ["id", "origin_place_id", "destination_place_id", "direction", "mode",
         "services_json", "updated_at"],
        denorm_reach,
        lambda r: [
            r["id"],
            r["origin_place_id"],
            r["destination_place_id"],
            r["direction"],
            r["mode"],
            json.dumps(r.get("services", []), ensure_ascii=False),
            r.get("updated_at", ""),
        ]
    )

    def service_valid_on(service, at):
        valid_from = service.get("valid_from")
        valid_to = service.get("valid_to")
        if valid_from is not None and valid_from > at:
            return False
        if valid_to is not None and valid_to < at:
            return False
        return True

    # Passenger isolation on data_as_of (structural edges with passenger service).
    # Computed after services index; data_as_of finalized below — use provisional
    # max of source dates here, then rewrite once data_as_of is known.
    provisional_dates = [
        record[field]
        for records in (
            places,
            classifications,
            names,
            geoms,
            areas,
            memberships,
            external_ids,
            connections,
            services,
            sources,
        )
        for record in records
        for field in (
            "observed_at",
            "created_at",
            "retrieved_at",
            "effective_from",
            "valid_from",
        )
        if record.get(field)
    ]
    isolation_at = max(provisional_dates) if provisional_dates else "1970-01-01"
    connected = set()
    for connection in connections:
        if connection.get("retired_at") is not None:
            continue
        passenger_ok = any(
            service_valid_on(service, isolation_at)
            and "passenger" in service.get("capabilities", [])
            for service in svc_by_conn.get(connection["id"], [])
        )
        if not passenger_ok:
            continue
        connected.add(connection["origin_place_id"])
        connected.add(connection["destination_place_id"])
    active_place_ids = sorted(
        place["id"] for place in places if place.get("status") == "active"
    )
    connected_place_ids = [pid for pid in active_place_ids if pid in connected]
    isolated_place_ids = [pid for pid in active_place_ids if pid not in connected]
    isolation_report = {
        "effective_date": isolation_at,
        "capability": "passenger",
        "connected_place_ids": connected_place_ids,
        "isolated_place_ids": isolated_place_ids,
        "counts": {
            "places": len(active_place_ids),
            "connected": len(connected_place_ids),
            "isolated": len(isolated_place_ids),
        },
    }
    with (DIST_DIR / "isolation-report.json").open("w", encoding="utf-8") as file:
        json.dump(isolation_report, file, indent=2, ensure_ascii=False)
        file.write("\n")

    # Single-dependency: places with passenger access via one connection/mode/operator.
    place_connections: dict[str, set[str]] = {}
    place_modes: dict[str, set[str]] = {}
    place_operators: dict[str, set[str]] = {}
    for connection in connections:
        if connection.get("retired_at") is not None:
            continue
        passenger_services = [
            service
            for service in svc_by_conn.get(connection["id"], [])
            if service_valid_on(service, isolation_at)
            and "passenger" in service.get("capabilities", [])
        ]
        if not passenger_services:
            continue
        for place_id in (
            connection["origin_place_id"],
            connection["destination_place_id"],
        ):
            place_connections.setdefault(place_id, set()).add(connection["id"])
            place_modes.setdefault(place_id, set()).add(connection["mode"])
            for service in passenger_services:
                operator = service.get("operator")
                if operator:
                    place_operators.setdefault(place_id, set()).add(operator)

    single_connection = [
        {
            "place_id": place_id,
            "connection_id": next(iter(place_connections[place_id])),
        }
        for place_id in sorted(place_connections)
        if len(place_connections[place_id]) == 1
    ]
    single_mode = [
        {"place_id": place_id, "mode": next(iter(place_modes[place_id]))}
        for place_id in sorted(place_modes)
        if len(place_modes[place_id]) == 1
    ]
    single_operator = [
        {
            "place_id": place_id,
            "operator": next(iter(place_operators[place_id])),
        }
        for place_id in sorted(place_operators)
        if len(place_operators[place_id]) == 1
    ]
    single_dependency_report = {
        "effective_date": isolation_at,
        "capability": "passenger",
        "single_connection": single_connection,
        "single_mode": single_mode,
        "single_operator": single_operator,
        "counts": {
            "single_connection": len(single_connection),
            "single_mode": len(single_mode),
            "single_operator": len(single_operator),
        },
    }
    with (DIST_DIR / "single-dependency-report.json").open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(single_dependency_report, file, indent=2, ensure_ascii=False)
        file.write("\n")

    # Seasonal-loss: places connected in some months and isolated in others.
    def service_active_in_month(service, year: int, month: int) -> bool:
        at = f"{year}-{month:02d}-15"
        if not service_valid_on(service, at):
            return False
        seasonality = service.get("seasonality") or {}
        if seasonality.get("kind") == "seasonal":
            return month in (seasonality.get("months") or [])
        return True

    loss_year = int(isolation_at[:4])
    month_connected: dict[int, set[str]] = {}
    for month in range(1, 13):
        connected_month: set[str] = set()
        for connection in connections:
            if connection.get("retired_at") is not None:
                continue
            if any(
                service_active_in_month(service, loss_year, month)
                and "passenger" in service.get("capabilities", [])
                for service in svc_by_conn.get(connection["id"], [])
            ):
                connected_month.add(connection["origin_place_id"])
                connected_month.add(connection["destination_place_id"])
        month_connected[month] = connected_month

    seasonal_losses = []
    for place_id in active_place_ids:
        connected_months = [
            month for month in range(1, 13) if place_id in month_connected[month]
        ]
        isolated_months = [
            month
            for month in range(1, 13)
            if place_id not in month_connected[month]
        ]
        if connected_months and isolated_months:
            seasonal_losses.append(
                {
                    "place_id": place_id,
                    "connected_months": connected_months,
                    "isolated_months": isolated_months,
                }
            )
    seasonal_loss_report = {
        "year": loss_year,
        "capability": "passenger",
        "losses": seasonal_losses,
        "counts": {"places_with_seasonal_loss": len(seasonal_losses)},
    }
    with (DIST_DIR / "seasonal-loss-report.json").open("w", encoding="utf-8") as file:
        json.dump(seasonal_loss_report, file, indent=2, ensure_ascii=False)
        file.write("\n")

    def sha256(path):
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    source_files = [
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
    ]
    distribution_files = [
        f"{SRC}.ndjson",
        f"{SRC}.json",
        f"{SRC}.geojson",
        f"{SRC}.csv",
        f"{RCH}.ndjson",
        f"{RCH}.json",
        f"{RCH}.csv",
        "isolation-report.json",
        "single-dependency-report.json",
        "seasonal-loss-report.json",
    ]
    date_fields = (
        "observed_at",
        "created_at",
        "retrieved_at",
        "effective_from",
        "valid_from",
    )
    data_dates = [
        record[field]
        for records in (
            places,
            classifications,
            names,
            geoms,
            areas,
            memberships,
            external_ids,
            connections,
            services,
            sources,
        )
        for record in records
        for field in date_fields
        if record.get(field)
    ]
    data_as_of = max(data_dates) if data_dates else None

    # Manifest contains data state, not wall-clock build time, so clean builds
    # from identical canonical sources remain byte-for-byte reproducible.
    manifest = {
        "dataset": "nunat-aqqinik-nalunaarsuiffik",
        "version": data_as_of.replace("-", ".") if data_as_of else "0",
        "schema_version": "1.0",
        "data_as_of": data_as_of,
        "canonical_sources": {
            "places": len(places),
            "place_classifications": len(classifications),
            "place_names": len(names),
            "place_geometries": len(geoms),
            "administrative_areas": len(areas),
            "administrative_memberships": len(memberships),
            "external_identifiers": len(external_ids),
            "connections": len(connections),
            "connection_services": len(services),
            "sources": len(sources),
        },
        "distributions": {
            f"{SRC}.ndjson": p_count,
            f"{SRC}.json": p_count,
            f"{SRC}.geojson": p_count,
            f"{SRC}.csv": p_count,
            f"{RCH}.ndjson": r_count,
            f"{RCH}.json": r_count,
            f"{RCH}.csv": r_count,
            "isolation-report.json": 1,
            "single-dependency-report.json": 1,
            "seasonal-loss-report.json": 1,
        },
        "sha256": {
            **{
                f"source/{name}": sha256(SOURCE_DIR / name)
                for name in source_files
            },
            **{
                f"dist/{name}": sha256(DIST_DIR / name)
                for name in distribution_files
            },
        },
        "pending_source": any(s.get("verification_status") == "pending" for s in sources),
    }
    with open(DIST_DIR / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Built {p_count} places, {r_count} connections -> {DIST_DIR}")


if __name__ == "__main__":
    build()
