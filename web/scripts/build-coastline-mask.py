#!/usr/bin/env python3
"""Build the web coastline-mask package from OSM coastline land polygons.

Creates web/public/packages/coastline-land/{land.geojson, land.pmtiles,
manifest.json}. The PMTiles land mask is the complete OSM coastline (full
land-polygons-split-4326, ~5 m simplify) — not Natural Earth, not
landuse/landcover fills. Same shoreline that bathymetry tiling must clip to.

Fast path: --input-geojson reuses an existing clipped OSM land GeoJSON
(e.g. the marine release land.geojson) and only re-tiles.

Usage:
  .venv/bin/python web/scripts/build-coastline-mask.py [--input-geojson FILE]
  bash scripts/fetch-coastline-mask-assets.sh        # fetch only (fast)
  bash scripts/publish-coastline-mask-assets.sh      # build + publish release

Requirements (venv): pyshp, shapely, pyproj. Binary: tippecanoe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "web" / "public" / "packages" / "coastline-land"
CACHE = ROOT / ".cache" / "coastline-mask"

OSM_LAND_ZIP = CACHE / "land-polygons-split-4326.zip"
OSM_LAND_SHP = CACHE / "land-polygons-split-4326" / "land_polygons.shp"
OSM_LAND_URL = (
    "https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip"
)

# Whole-Greenland planning bbox (same as marine prepare-regions).
GREENLAND_BBOX = (-75.0, 59.5, -10.0, 84.0)
LAND_SIMPLIFY_DEG = 0.00005  # ~5 m WGS84 light simplify

SOURCE_LABEL = (
    "OpenStreetMap land polygons (full coastline, ODbL) — "
    "osmdata.openstreetmap.de land-polygons-split-4326"
)
NOT_FOR_NAVIGATION = "not-for-navigation"


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def ensure_osm_land_shp() -> Path:
    if OSM_LAND_SHP.exists():
        return OSM_LAND_SHP
    CACHE.mkdir(parents=True, exist_ok=True)
    if not OSM_LAND_ZIP.exists():
        print(f"Downloading full OSM land polygons (~925 MB)…\n  {OSM_LAND_URL}")
        urllib.request.urlretrieve(OSM_LAND_URL, OSM_LAND_ZIP)
    print(f"Unpacking {OSM_LAND_ZIP.name}")
    shutil.unpack_archive(OSM_LAND_ZIP, CACHE)
    if not OSM_LAND_SHP.exists():
        raise SystemExit(f"Missing {OSM_LAND_SHP} after unpack")
    return OSM_LAND_SHP


def _explode_polygons(geom) -> list:
    from shapely.geometry import GeometryCollection, MultiPolygon, Polygon

    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return [part for part in geom.geoms if not part.is_empty]
    if isinstance(geom, GeometryCollection):
        out = []
        for part in geom.geoms:
            out.extend(_explode_polygons(part))
        return out
    return []


def _clip_osm_land_polygons(bbox) -> list:
    """Clip full OSM land polygons to the Greenland bbox (pyshp scan)."""
    import shapefile  # type: ignore[import-not-found]
    from shapely.geometry import box, shape

    shp = ensure_osm_land_shp()
    bbox_poly = box(*bbox)
    reader = shapefile.Reader(str(shp))
    parts: list = []
    scanned = 0
    for index, record in enumerate(reader.iterShapes(), start=1):
        scanned = index
        geom = shape(record.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not geom.intersects(bbox_poly):
            continue
        clipped = geom.intersection(bbox_poly)
        if clipped.is_empty:
            continue
        for poly in _explode_polygons(clipped):
            simplified = poly.simplify(LAND_SIMPLIFY_DEG, preserve_topology=True)
            if not simplified.is_valid:
                simplified = simplified.buffer(0)
            for part in _explode_polygons(simplified):
                if not part.is_empty and part.area > 0:
                    parts.append(part)
    print(f"land polygons: {len(parts)} (scanned {scanned} shapes)")
    return parts


def load_land_parts(input_geojson: Path) -> list:
    """Reuse an existing clipped OSM land GeoJSON (fast path)."""
    from shapely.geometry import shape

    try:
        fc = json.loads(input_geojson.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read {input_geojson}: {exc}") from exc
    parts: list = []
    for feature in fc.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        poly = shape(geom)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        for part in _explode_polygons(poly):
            if not part.is_empty and part.area > 0:
                parts.append(part)
    print(f"land polygons: {len(parts)} (from {input_geojson.name})")
    return parts


def write_land_geojson(parts: list) -> Path:
    from shapely.geometry import mapping

    features = [
        {
            "type": "Feature",
            "properties": {
                "kind": "land",
                "source": SOURCE_LABEL,
                "licence": "ODbL",
                "safety": NOT_FOR_NAVIGATION,
            },
            "geometry": mapping(poly),
        }
        for poly in parts
    ]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "land.geojson"
    out.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": features},
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    return out


def build_pmtiles(geojson: Path) -> Path:
    tippecanoe = shutil.which("tippecanoe")
    if not tippecanoe:
        raise SystemExit(
            "tippecanoe not found — install it (brew install tippecanoe) "
            "or fetch the built package with scripts/fetch-coastline-mask-assets.sh"
        )
    out = OUT_DIR / "land.pmtiles"
    cmd = [
        tippecanoe,
        "-o",
        str(out),
        "-Z0",
        "-z13",
        "-l",
        "land",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        "--simplify-only-low-zooms",
        "--force",
        str(geojson),
    ]
    print("Building land.pmtiles …")
    subprocess.run(cmd, check=True)
    if not out.exists():
        raise SystemExit("tippecanoe produced no land.pmtiles")
    return out


def write_manifest(
    land_geojson: Path,
    land_pmtiles: Path,
    created_at: str,
    data_as_of: str,
) -> Path:
    files = []
    for path in (land_geojson, land_pmtiles):
        size, digest = sha256_file(path)
        files.append({"path": path.name, "bytes": size, "sha256": digest})
    package_id = f"coastline-land_{created_at}"
    manifest = {
        "id": package_id,
        "slug": "coastline-land",
        "title": {
            "kl": "Sinaa (land-mask)",
            "da": "Kystlinje (land-maske)",
            "en": "Coastline land mask",
        },
        "description": (
            "Complete OSM coastline land polygon mask for the terrain-first "
            "map — one shared shoreline for the display mask and for clipping "
            "bathymetry. Not for navigation."
        ),
        "bbox": list(GREENLAND_BBOX),
        "minZoom": 0,
        "maxZoom": 13,
        "bytes": sum(item["bytes"] for item in files),
        "createdAt": f"{created_at}T00:00:00Z",
        "dataAsOf": data_as_of,
        "files": files,
        "source": {
            "title": "OpenStreetMap land polygons (full coastline)",
            "publisher": "OpenStreetMap contributors via osmdata.openstreetmap.de",
            "url": OSM_LAND_URL,
            "licence": "ODbL",
            "attribution": "© OpenStreetMap contributors (ODbL)",
            "redistribution": (
                "ODbL share-alike: derived masks must keep OSM attribution "
                "and publish under ODbL (opendatacommons.org/licenses/odbl)."
            ),
            "safety": NOT_FOR_NAVIGATION,
        },
        "notForNavigation": True,
        "notes": (
            "land.pmtiles is hosted on a GitHub Release (repo precedent: "
            "files >50 MB are not committed). Fetch: "
            "bash scripts/fetch-coastline-mask-assets.sh"
        ),
    }
    out = OUT_DIR / "manifest.json"
    out.write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-geojson",
        type=Path,
        default=None,
        help="Reuse a clipped OSM land GeoJSON instead of the raw pipeline",
    )
    args = parser.parse_args()

    try:
        from shapely.geometry import box  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "Missing pyshp/shapely/pyproj — create the venv first:\n"
            "  python3 -m venv .venv\n"
            "  .venv/bin/pip install pyshp shapely pyproj"
        ) from exc

    data_as_of = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if args.input_geojson:
        if not args.input_geojson.exists():
            raise SystemExit(f"Missing --input-geojson {args.input_geojson}")
        parts = load_land_parts(args.input_geojson)
    else:
        parts = _clip_osm_land_polygons(GREENLAND_BBOX)
    if not parts:
        raise SystemExit("No land polygons — mask cannot be built")

    land_geojson = write_land_geojson(parts)
    print(f"land.geojson: {land_geojson.stat().st_size} bytes")
    land_pmtiles = build_pmtiles(land_geojson)
    print(f"land.pmtiles: {land_pmtiles.stat().st_size} bytes")
    manifest = write_manifest(land_geojson, land_pmtiles, data_as_of, data_as_of)
    print(f"manifest: {manifest}")
    print(
        "Publish: bash scripts/publish-coastline-mask-assets.sh\n"
        "Fetch on other machines: bash scripts/fetch-coastline-mask-assets.sh"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
