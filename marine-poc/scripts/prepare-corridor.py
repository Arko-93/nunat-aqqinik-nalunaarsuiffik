#!/usr/bin/env python3
"""Build the Uummannaq–Qaarsut offline corridor package.

Clips Natural Earth land, copies places, writes style/manifest checksums,
and optionally builds PMTiles when tippecanoe (host or Docker) is available.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PACKAGE = ROOT / "public" / "packages" / "uummannaq-qaarsut"
DATA_OUT = ROOT / "data" / "uummannaq-qaarsut"
PLACES_SRC = PACKAGE / "places.geojson"

# Pilot corridor bbox [west, south, east, north]
BBOX = (-52.85, 70.45, -50.7, 71.12)
PACKAGE_ID = "corridor_uummannaq_qaarsut_2026-08-01"


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def clip_land() -> Path:
    try:
        import shapefile  # type: ignore
        from shapely.geometry import box, mapping, shape  # type: ignore
        from shapely.ops import unary_union  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing pyshp/shapely. Run: python3 -m venv .venv && "
            ".venv/bin/pip install pyshp shapely"
        ) from exc

    shp = RAW / "ne_10m_land.shp"
    if not shp.exists():
        raise SystemExit(f"Missing {shp}; download Natural Earth 10m land first")

    bbox_poly = box(*BBOX)
    reader = shapefile.Reader(str(shp))
    parts = []
    for record in reader.iterShapeRecords():
        geom = shape(record.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        clipped = geom.intersection(bbox_poly)
        if clipped.is_empty:
            continue
        parts.append(clipped)

    if not parts:
        raise SystemExit("No land polygons intersect corridor bbox")

    merged = unary_union(parts)
    feature = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "source": "Natural Earth 10m land",
                    "licence": "public domain",
                    "safety": "not-for-navigation",
                },
                "geometry": mapping(merged),
            }
        ],
    }
    out = PACKAGE / "land.geojson"
    out.write_text(json.dumps(feature, separators=(",", ":")), encoding="utf-8")
    return out


def try_build_pmtiles(geojson: Path, out_name: str, layer: str) -> Path | None:
    out = PACKAGE / out_name
    tippecanoe = shutil.which("tippecanoe")
    cmd: list[str] | None = None
    if tippecanoe:
        cmd = [
            tippecanoe,
            "-o",
            str(out),
            "-Z4",
            "-z14",
            "-l",
            layer,
            "--drop-densest-as-needed",
            "--force",
            str(geojson),
        ]
    else:
        # Docker fallback
        try:
            subprocess.run(
                ["docker", "image", "inspect", "tippecanoe/tippecanoe:latest"],
                check=True,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("tippecanoe unavailable; skipping PMTiles for", out_name)
            return None
        cmd = [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{PACKAGE}:/data",
            "tippecanoe/tippecanoe:latest",
            "tippecanoe",
            "-o",
            f"/data/{out_name}",
            "-Z4",
            "-z14",
            "-l",
            layer,
            "--drop-densest-as-needed",
            "--force",
            f"/data/{geojson.name}",
        ]

    print("Building", out_name, "…")
    subprocess.run(cmd, check=True)
    return out if out.exists() else None


def write_style(has_land_pmtiles: bool, has_places_pmtiles: bool) -> None:
    sources: dict = {}
    layers: list = [
        {
            "id": "background",
            "type": "background",
            "paint": {"background-color": "#0b1c28"},
        }
    ]

    if has_land_pmtiles:
        sources["land"] = {
            "type": "vector",
            "url": "pmtiles://land.pmtiles",
            "attribution": "Natural Earth",
        }
        layers.append(
            {
                "id": "land-fill",
                "type": "fill",
                "source": "land",
                "source-layer": "land",
                "paint": {
                    "fill-color": "#1d3a2f",
                    "fill-opacity": 0.92,
                },
            }
        )
        layers.append(
            {
                "id": "land-outline",
                "type": "line",
                "source": "land",
                "source-layer": "land",
                "paint": {
                    "line-color": "#3d6b57",
                    "line-width": 1.2,
                },
            }
        )
    else:
        sources["land"] = {"type": "geojson", "data": "land.geojson"}
        layers.append(
            {
                "id": "land-fill",
                "type": "fill",
                "source": "land",
                "paint": {
                    "fill-color": "#1d3a2f",
                    "fill-opacity": 0.92,
                },
            }
        )
        layers.append(
            {
                "id": "land-outline",
                "type": "line",
                "source": "land",
                "paint": {
                    "line-color": "#3d6b57",
                    "line-width": 1.2,
                },
            }
        )

    if has_places_pmtiles:
        sources["places"] = {
            "type": "vector",
            "url": "pmtiles://places.pmtiles",
        }
        place_source_layer = "places"
        place_source = "places"
    else:
        sources["places"] = {"type": "geojson", "data": "places.geojson"}
        place_source_layer = None
        place_source = "places"

    place_circle = {
        "id": "places-circle",
        "type": "circle",
        "source": place_source,
        "paint": {
            "circle-radius": [
                "case",
                ["==", ["get", "isLocality"], True],
                8,
                4.5,
            ],
            "circle-color": [
                "case",
                ["==", ["get", "isLocality"], True],
                "#f0c674",
                "#8fb8c9",
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#041018",
        },
    }
    if place_source_layer:
        place_circle["source-layer"] = place_source_layer
    layers.append(place_circle)

    style = {
        "version": 8,
        "name": "uummannaq-qaarsut-companion",
        "metadata": {
            "nunat:safety": "not-for-navigation",
            "nunat:corridor": PACKAGE_ID,
            "nunat:bathymetry": "context-placeholder-not-for-navigation",
        },
        "sources": sources,
        "layers": layers,
    }
    (PACKAGE / "style.json").write_text(
        json.dumps(style, indent=2) + "\n", encoding="utf-8"
    )


def write_manifest(
    files: list[dict],
    has_land_pmtiles: bool,
    has_places_pmtiles: bool,
) -> None:
    places_meta = next(item for item in files if item["path"] == "places.geojson")
    layers = [
        {
            "id": "places",
            "source": "NunaGIS/Oqaasileriffik via repository release 2026.08.01.1",
            "licence": "written-confirmation-required-for-commercial-redistribution",
            "dataAsOf": "2026-08-01",
            "file": "places.pmtiles" if has_places_pmtiles else "places.geojson",
            "safety": "companion_only",
        },
        {
            "id": "land",
            "source": "Natural Earth 10m Physical Land",
            "licence": "public domain",
            "dataAsOf": "2022-05-09",
            "file": "land.pmtiles" if has_land_pmtiles else "land.geojson",
            "safety": "not-for-navigation",
        },
        {
            "id": "bathymetry-context",
            "source": "IBCAO v5.2 / GEBCO terms (context placeholder — no depth contours in POC)",
            "licence": "GEBCO terms",
            "dataAsOf": "2026-06-01",
            "safety": "not-for-navigation",
        },
    ]
    total_bytes = sum(item["bytes"] for item in files)
    # Aggregate digest over path + content digests for multi-file integrity.
    aggregate = hashlib.sha256()
    for item in sorted(files, key=lambda row: row["path"]):
        aggregate.update(item["path"].encode("utf-8"))
        aggregate.update(b":")
        aggregate.update(item["sha256"].encode("utf-8"))
        aggregate.update(b"\n")

    manifest = {
        "id": PACKAGE_ID,
        "bbox": list(BBOX),
        "minZoom": 4,
        "maxZoom": 14,
        "bytes": total_bytes,
        "sha256": aggregate.hexdigest(),
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "primaryFile": "places.geojson",
        "primaryBytes": places_meta["bytes"],
        "primarySha256": places_meta["sha256"],
        "files": files,
        "layers": layers,
        "style": "style.json",
        "attributions": [
            "Place names: Nunat Aqqinik Aalajangiisartut / Oqaasileriffik via NunaGIS",
            "Contains data derived from the repository place-identity release 2026.08.01.1",
            "Land: Natural Earth (public domain)",
            "Bathymetry context (when present): GEBCO / IBCAO — not for navigation or safety at sea",
        ],
        "warnings": [
            "This package is a travel-knowledge companion. It is not an official nautical chart.",
            "Do not use for navigation, depth clearance, or emergency decisions.",
            "Browser storage can be evicted; export important trips.",
            "Depth context is unavailable or placeholder-only in this POC build.",
        ],
    }
    text = json.dumps(manifest, indent=2) + "\n"
    (PACKAGE / "manifest.json").write_text(text, encoding="utf-8")
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PACKAGE / "manifest.json", DATA_OUT / "manifest.json")
    shutil.copy2(PACKAGE / "style.json", DATA_OUT / "style.json")
    if (PACKAGE / "land.geojson").exists():
        shutil.copy2(PACKAGE / "land.geojson", DATA_OUT / "land.geojson")


def main() -> int:
    if not PLACES_SRC.exists():
        print("Missing places.geojson at", PLACES_SRC, file=sys.stderr)
        return 1

    PACKAGE.mkdir(parents=True, exist_ok=True)
    land = clip_land()
    print("Wrote", land)

    land_pmtiles = try_build_pmtiles(land, "land.pmtiles", "land")
    places_pmtiles = try_build_pmtiles(PLACES_SRC, "places.pmtiles", "places")
    write_style(land_pmtiles is not None, places_pmtiles is not None)

    tracked = ["places.geojson", "land.geojson", "style.json", "manifest.json"]
    if land_pmtiles:
        tracked.append("land.pmtiles")
    if places_pmtiles:
        tracked.append("places.pmtiles")

    # First pass without manifest checksum of itself: write style first, then files list
    # excluding manifest, then write manifest.
    files = []
    for name in ["places.geojson", "land.geojson", "style.json"]:
        path = PACKAGE / name
        size, digest = sha256_file(path)
        files.append({"path": name, "bytes": size, "sha256": digest})
    if land_pmtiles:
        size, digest = sha256_file(land_pmtiles)
        files.append({"path": "land.pmtiles", "bytes": size, "sha256": digest})
    if places_pmtiles:
        size, digest = sha256_file(places_pmtiles)
        files.append({"path": "places.pmtiles", "bytes": size, "sha256": digest})

    write_manifest(
        files,
        has_land_pmtiles=land_pmtiles is not None,
        has_places_pmtiles=places_pmtiles is not None,
    )
    print("Package ready at", PACKAGE)
    for item in files:
        print(f"  {item['path']}: {item['bytes']} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
