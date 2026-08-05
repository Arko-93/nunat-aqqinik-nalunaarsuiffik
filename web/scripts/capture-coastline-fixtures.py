#!/usr/bin/env python3
"""Capture deterministic coastline-mask regression fixtures (Qaarsut, Naajaat).

Land fixtures: OSM coastline land polygons (the mask shoreline) clipped to
each settlement tile bbox. Bathymetry fixtures: real Open Waters Seascape
`depare` depth-area polygons and `contours` lines fetched from the public
vector tiles around each settlement — these raw bands are known to cross
land (the defect issue #16 fixes). The committed fixtures pin the shared
coastline contract: after clipping bathymetry to the mask, no intersection
may remain.

Deterministic: fixed settlement points, fixed z12 tile bounds, fixed tile
zooms (12 + 13). Re-run regenerates identical files when upstream tiles
change; committed copies are the regression baseline.

Usage:
  .venv/bin/python web/scripts/capture-coastline-fixtures.py \
      --land <osm-land.geojson> [--out web/src/map/__fixtures__/coastline-mask]
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import sys
import urllib.request
from pathlib import Path

from mapbox_vector_tile import decode  # type: ignore[import-not-found]  # venv-only dep
from shapely.errors import GEOSException

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "web" / "src" / "map" / "__fixtures__" / "coastline-mask"
from shapely.geometry import box, mapping, shape

SEASCAPE_TILES = "https://tiles.openwaters.io/seascape/{z}/{x}/{y}.pbf"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )
}

# Settlement reference points (issue #16 regression areas).
AREAS = {
    "qaarsut": (-52.6333, 70.7333),
    "naajaat": (-55.8, 73.1333),
}


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    try:
        n = 2**z
        x = int((lon + 180.0) / 360.0 * n)
        y = int(
            (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
        )
    except (ValueError, ZeroDivisionError):
        raise ValueError(
            f"invalid tile coordinates for ({lon}, {lat}, z{z})"
        ) from None
    return x, y


def tile_bounds(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    n = 2**z
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon0, lat0, lon1, lat1


def make_transformer(tx: int, ty: int, z: int):
    """Tile-local MVT coords (y down, extent 4096) to WGS84 lon/lat."""
    n = 2**z
    extent = 4096.0

    def transform(x: float, y: float) -> tuple[float, float]:
        lon = (tx + x / extent) / n * 360.0 - 180.0
        lat = math.degrees(
            math.atan(
                math.sinh(math.pi * (1.0 - 2.0 * (ty + y / extent) / n))
            )
        )
        return lon, lat

    return transform


def fetch_tile(z: int, x: int, y: int) -> bytes:
    url = SEASCAPE_TILES.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=60).read()
    if raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    return raw  # already raw protobuf (no content-encoding)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def load_land_parts(land_path: Path, bbox) -> list[dict]:
    """OSM coastline land polygons clipped to bbox (same shoreline as mask)."""
    try:
        fc = json.loads(land_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read land source {land_path}: {exc}") from exc
    kept = []
    for feature in fc.get("features", []):
        geom = feature.get("geometry")
        if not geom or geom.get("type") != "Polygon":
            continue
        poly = shape(geom)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or not poly.intersects(bbox):
            continue
        clipped = poly.intersection(bbox)
        if clipped.is_empty or clipped.geom_type not in (
            "Polygon",
            "MultiPolygon",
        ):
            continue
        kept.append(
            {
                "type": "Feature",
                "properties": {"kind": "land"},
                "geometry": mapping(clipped),
            }
        )
    return kept


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--land", required=True, help="OSM coastline land GeoJSON (mask shoreline)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    from shapely.geometry import box, mapping, shape

    land_path = Path(args.land)
    if not land_path.exists():
        print(f"Missing land source: {land_path}", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)

    summary = []
    for name, (lon, lat) in AREAS.items():
        z12x, z12y = tile_xy(lon, lat, 12)
        bbox_geom = box(*tile_bounds(z12x, z12y, 12))

        land = load_land_parts(land_path, bbox_geom)
        land_out = args.out / f"land-{name}.geojson"
        land_out.write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": land},
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )

        # Real Seascape bands: z12 tile + the z13 tile holding the settlement.
        features = []
        for z in (12, 13):
            x, y = tile_xy(lon, lat, z)
            layers = decode(
                fetch_tile(z, x, y),
                # Tile origin/zoom is required — decode() returns tile-local
                # pixel coordinates unless told which tile it is.
                default_options={
                    "y_coord_down": True,
                    "transformer": make_transformer(x, y, z),
                },
            )
            for layer_name in ("depare", "contours"):
                for feature in layers.get(layer_name, {}).get("features", []):
                    geom = feature.get("geometry")
                    props = {
                        k: v
                        for k, v in (feature.get("properties") or {}).items()
                        if v is not None
                    }
                    if not geom:
                        continue
                    poly = shape(geom)
                    if not poly.is_valid:
                        poly = poly.buffer(0)
                    if poly.is_empty or not poly.intersects(bbox_geom):
                        continue
                    try:
                        clipped = poly.intersection(bbox_geom)
                    except GEOSException as exc:
                        # Buffer-repair can still miss a torn ring — retry once.
                        poly = poly.buffer(0)
                        if poly.is_empty or not poly.intersects(bbox_geom):
                            continue
                        clipped = poly.intersection(bbox_geom)
                    if clipped.is_empty:
                        continue
                    features.append(
                        {
                            "type": "Feature",
                            "properties": {"layer": layer_name, **props},
                            "geometry": mapping(clipped),
                        }
                    )
        bathy_out = args.out / f"bathymetry-{name}.geojson"
        bathy_out.write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": features},
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )
        depare_vals = sorted(
            {
                f["properties"]["drval1"]
                for f in features
                if f["properties"].get("layer") == "depare"
                and f["properties"].get("drval1") is not None
            }
        )
        contour_vals = sorted(
            {
                f["properties"]["depth_abs_m"]
                for f in features
                if f["properties"].get("layer") == "contours"
                and f["properties"].get("depth_abs_m") is not None
            }
        )
        summary.append(
            {
                "area": name,
                "land_features": len(land),
                "bathymetry_features": len(features),
                "depare_drval1": depare_vals,
                "contour_depth_abs_m": contour_vals,
                "land_sha256": sha256_file(land_out),
                "bathymetry_sha256": sha256_file(bathy_out),
            }
        )
        print(
            f"{name}: {len(land)} land, {len(features)} bathymetry features "
            f"(depare {depare_vals}, contours {contour_vals})"
        )

    readme = args.out / "README.md"
    readme.write_text(
        "\n".join(
            [
                "# Coastline-mask regression fixtures (Qaarsut, Naajaat)",
                "",
                "Deterministic geometry fixtures for the shared-coastline contract (issue #16).",
                "Committed; regenerate with:",
                "",
                "```sh",
                ".venv/bin/python web/scripts/capture-coastline-fixtures.py \\",
                "    --land <osm-coastline-land.geojson>",
                "```",
                "",
                "- Land fixtures: OSM coastline land polygons (full coastline, ODbL) —",
                "  the exact shoreline the coastline mask is built from.",
                "- Bathymetry fixtures: real Open Waters Seascape `depare` bands and",
                "  `contours` from public vector tiles (z12 + z13 around each settlement),",
                "  `https://tiles.openwaters.io/seascape/{z}/{x}/{y}.pbf`.",
                "- Raw bands cross land (the defect); the regression test proves the",
                "  shared-coastline clip removes every intersection.",
                "",
                "Captured 2026-08-05:",
                "",
                "```json",
                json.dumps(summary, indent=2),
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(summary)} areas to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
