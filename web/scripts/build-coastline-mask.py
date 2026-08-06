#!/usr/bin/env python3
"""Build the web coastline-mask package (OSM coastline + DEM land).

Creates web/public/packages/coastline-land/{land.geojson, land.pmtiles,
manifest.json}. The PMTiles land mask is the complete OSM coastline (full
land-polygons-split-4326, ~5 m simplify) UNION Mapterhorn DEM land above
~1 m elevation in a z12 coastal band — not Natural Earth, not
landuse/landcover fills. The DEM union closes shoreline disagreements where
the land hillshade renders land the OSM coastline misses (issue #19: Naajaat
etc.), so the mask is the shoreline exactly as the map renders it.

Same shoreline that bathymetry tiling must clip to.

Fast path: --input-geojson reuses an existing clipped OSM land GeoJSON
(e.g. the marine release land.geojson) and only re-tiles (+ DEM union).

Usage:
  .venv/bin/python web/scripts/build-coastline-mask.py [--input-geojson FILE]
  .venv/bin/python web/scripts/build-coastline-mask.py --skip-dem-augment  # offline
  bash scripts/fetch-coastline-mask-assets.sh        # fetch only (fast)
  bash scripts/publish-coastline-mask-assets.sh      # build + publish release

Requirements (venv): pyshp, shapely, pyproj, numpy, pillow. Binary: tippecanoe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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
    "osmdata.openstreetmap.de land-polygons-split-4326, unioned with "
    "Mapterhorn DEM land (Klimadatastyrelsen, CC BY 4.0) above ~1 m "
    "elevation in a z12 coastal band"
)
NOT_FOR_NAVIGATION = "not-for-navigation"

# --- Mapterhorn DEM land augmentation (issue #19) ---------------------------
# The land hillshade renders the Mapterhorn DEM; where the DEM shows land the
# OSM coastline misses (Naajaat: ~0.15 km2, up to ~600 m seaward; Kullorsuaq,
# Upernavik, …), ocean layers would paint under the hillshade. The mask
# therefore unions polygonized DEM land (> DEM_LAND_ELEV_M) with the OSM
# coastline. The DEM is sampled in a z12 band around the OSM coastline (each
# z12 pixel ~6-10 m) — the same shoreline the bathymetry clip must use.
DEM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"
DEM_AUGMENT_ZOOM = 12
DEM_LAND_ELEV_M = 1.0
# DEM fragments: skip sub-20x20 m slivers (sub-pixel at corridor zooms) and
# simplify to ~25 m — the DEM boundary detail beyond that is invisible in
# the mask and multiplies tile size (335k fragments otherwise).
DEM_MIN_AREA_M2 = 400.0
DEM_SIMPLIFY_DEG = 0.00025
# Absorb DEM/OSM shoreline noise: DEM-land slivers within ~2-6 m of the OSM
# coastline are treated as already covered (the DEM boundary zigzags around
# the OSM line at 2-6 m everywhere; only real disagreements survive). The
# visible margin (> 6 m) stays covered (issue #19 Naajaat lobe etc.).
DEM_ABSORB_DEG = 0.00006
DEM_TILE_CACHE = CACHE / "dem-tiles"
DEM_FETCH_THREADS = 24
DEM_NEIGHBOR_RINGS = 1  # also fetch tiles one ring away from the coastline


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


def _tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    import math

    try:
        n = 2**z
        x = int((lon + 180.0) / 360.0 * n)
        y = int(
            (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
        )
    except (ValueError, ZeroDivisionError):
        raise ValueError(f"invalid tile coordinates for ({lon}, {lat}, z{z})")
    return x, y


def _tile_bounds(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    import math

    n = 2**z
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon0, lat0, lon1, lat1


def _fetch_dem_tile(x: int, y: int, z: int) -> bytes | None:
    """Mapterhorn Terrarium webp tile, cached on disk (None on 404)."""
    cached = DEM_TILE_CACHE / str(z) / str(x) / f"{y}.webp"
    if cached.exists():
        return cached.read_bytes()
    url = DEM_TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "nunat-mask-build/1.0"})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                raw = response.read()
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(raw)
            return raw
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            last_error = exc
        except Exception as exc:  # noqa: BLE001 - retry transient failures
            last_error = exc
    if last_error is not None:
        print(f"  DEM tile {z}/{x}/{y}: {last_error}", file=sys.stderr)
    return None


def _decode_terrarium_m(raw: bytes):
    """Terrarium-encoded webp to elevation in metres (rows top->bottom)."""
    import io

    import numpy as np  # type: ignore[import-not-found]  # venv-only dep
    from PIL import Image  # type: ignore[import-not-found]  # venv-only dep

    arr = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"), dtype=np.float32)
    return (arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0) - 32768.0


def _boundary_edges(grid):
    """Boundary segments of a bool grid (True = land) in pixel coords.

    Each adjacent cell pair with different labels yields exactly one segment
    (x0, y0, x1, y1). Pixel y grows down. Direction is irrelevant —
    shapely.ops.polygonize welds the undirected edges into closed rings.
    """
    import numpy as np  # type: ignore[import-not-found]  # venv-only dep

    h, w = grid.shape
    edges = []
    if h > 1:
        diff = grid[1:, :] != grid[:-1, :]
        for y, x in zip(*np.nonzero(diff)):
            i = y + 1  # edge between rows i-1 and i, at y = i
            edges.append((x, i, x + 1, i))
    if w > 1:
        diff = grid[:, 1:] != grid[:, :-1]
        for y, x in zip(*np.nonzero(diff)):
            j = x + 1  # edge between cols j-1 and j, at x = j
            edges.append((j, y, j, y + 1))
    return edges


def _polygonize_dem_tile(elev, bounds: tuple[float, float, float, float]) -> list:
    """DEM land polygons (elevation > DEM_LAND_ELEV_M) of one tile, WGS84.

    The grid is padded with one sea cell on every side so land touching the
    tile edge still yields closed rings (the ring follows the tile edge).
    The land grid is dilated by one 8-connected cell first: diagonal land
    contacts otherwise produce self-touching (pinched) polygonize rings, and
    the dilation doubles as the deliberate ~6 m seaward micro-buffer for
    DEM-derived land (issue #19 shoreline strategy).
    """
    from shapely.affinity import affine_transform
    from shapely.geometry import LineString
    from shapely.ops import polygonize

    import numpy as np  # type: ignore[import-not-found]  # venv-only dep

    raw_grid = elev > DEM_LAND_ELEV_M
    if not raw_grid.any():
        return []
    h, w = raw_grid.shape
    grid = np.zeros((h + 2, w + 2), dtype=bool)
    grid[1:-1, 1:-1] = raw_grid
    dilated = grid.copy()
    for dy, dx in (
        (-1, -1), (-1, 0), (-1, 1),
        (0, -1), (0, 1),
        (1, -1), (1, 0), (1, 1),
    ):
        dilated |= np.roll(np.roll(grid, dy, axis=0), dx, axis=1)
    # np.roll wraps: keep the outermost sea ring sea so boundary rings close.
    dilated[0, :] = False
    dilated[-1, :] = False
    dilated[:, 0] = False
    dilated[:, -1] = False
    edges = _boundary_edges(dilated)
    if not edges:
        return []
    lon0, lat0, lon1, lat1 = bounds
    n = 512
    sx = (lon1 - lon0) / n
    sy = -(lat1 - lat0) / n
    # Padded pixel (x, y) is original pixel (x-1, y-1); offset by one cell.
    offset_x = lon0 - sx
    offset_y = lat1 + sy
    rings = polygonize([LineString([(x0, y0), (x1, y1)]) for x0, y0, x1, y1 in edges])
    out = []
    for ring in rings:
        if ring.is_empty:
            continue
        poly = affine_transform(ring, [sx, 0.0, 0.0, sy, offset_x, offset_y])
        if not poly.is_valid:
            poly = poly.buffer(0)
        for part in _explode_polygons(poly):
            if not part.is_empty and part.area > 0:
                out.append(part)
    return out


def _band_tiles(parts: list) -> list[tuple[int, int]]:
    """z12 tiles touching any OSM land boundary, plus one ring of neighbours."""
    from shapely.geometry import box
    from shapely.prepared import prep

    z = DEM_AUGMENT_ZOOM
    seen: set[tuple[int, int]] = set()
    for part in parts:
        boundary = prep(part.boundary)
        minx, miny, maxx, maxy = part.bounds
        x0, y1 = _tile_xy(minx, maxy, z)
        x1, y0 = _tile_xy(maxx, miny, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                if boundary.intersects(box(*_tile_bounds(x, y, z))):
                    seen.add((x, y))
    if DEM_NEIGHBOR_RINGS > 0:
        ring = set()
        for x, y in seen:
            for dx in range(-DEM_NEIGHBOR_RINGS, DEM_NEIGHBOR_RINGS + 1):
                for dy in range(-DEM_NEIGHBOR_RINGS, DEM_NEIGHBOR_RINGS + 1):
                    ring.add((x + dx, y + dy))
        seen |= ring
    return sorted(seen)


def _dem_augment_polygons(parts: list, bbox: tuple[float, float, float, float]) -> list:
    """DEM land outside the OSM coastline, in a z12 coastal band (issue #19)."""
    import numpy as np  # type: ignore[import-not-found]  # venv-only dep
    from shapely.geometry import box
    from shapely.ops import unary_union
    from shapely.strtree import STRtree

    tiles = _band_tiles(parts)
    print(f"DEM band tiles at z{DEM_AUGMENT_ZOOM}: {len(tiles)}")
    spatial = STRtree(parts)

    def process(tile: tuple[int, int]):
        x, y = tile
        raw = _fetch_dem_tile(x, y, DEM_AUGMENT_ZOOM)
        if raw is None:
            return []
        elev = _decode_terrarium_m(raw)
        bounds = _tile_bounds(x, y, DEM_AUGMENT_ZOOM)
        polys = _polygonize_dem_tile(elev, bounds)
        if not polys:
            return []
        tile_box = box(*bounds)
        nearby = [parts[i] for i in spatial.query(tile_box)]
        if nearby:
            osm = unary_union(nearby)
            if DEM_ABSORB_DEG > 0:
                # Absorb sub-buffer shoreline slivers (issue #19 strategy:
                # the mask may extend slightly seaward of OSM where the DEM
                # renders land nearby).
                osm = osm.buffer(DEM_ABSORB_DEG, join_style="mitre")
        else:
            osm = None
        kept = []
        for poly in polys:
            if osm is not None and poly.intersects(osm):
                poly = poly.difference(osm)
            if poly.is_empty:
                continue
            simplified = poly.simplify(DEM_SIMPLIFY_DEG, preserve_topology=True)
            if not simplified.is_valid:
                simplified = simplified.buffer(0)
            for part in _explode_polygons(simplified):
                if part.is_empty:
                    continue
                mid_lat = (bounds[1] + bounds[3]) / 2.0
                m2 = part.area * (111320.0 * 111320.0) * abs(
                    math_cos_deg(mid_lat)
                )
                if m2 >= DEM_MIN_AREA_M2:
                    kept.append(part)
        return kept
    augmented: list = []
    with ThreadPoolExecutor(max_workers=DEM_FETCH_THREADS) as pool:
        for index, kept in enumerate(pool.map(process, tiles), start=1):
            augmented.extend(kept)
            if index % 2500 == 0:
                print(f"  DEM tiles {index}/{len(tiles)}")
    print(f"DEM-land polygons added: {len(augmented)}")
    return augmented


def math_cos_deg(degrees: float) -> float:
    import math

    return math.cos(math.radians(degrees))


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
        # Issue #19: no densest-drop for the land layer — small coastal
        # polygons/islets must never disappear at corridor zooms. Without it
        # tippecanoe keeps every feature at every zoom (z14 renders the z13
        # tiles overzoomed, same coverage).
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
            "Complete OSM coastline land polygon mask unioned with Mapterhorn "
            "DEM land (elevation > ~1 m, z12 coastal band) for the terrain-first "
            "map — one shared shoreline for the display mask and for clipping "
            "bathymetry. The DEM union closes shoreline gaps where the land "
            "hillshade renders land the OSM coastline misses. Not for navigation."
        ),
        "bbox": list(GREENLAND_BBOX),
        "minZoom": 0,
        "maxZoom": 13,
        "bytes": sum(item["bytes"] for item in files),
        "createdAt": f"{created_at}T00:00:00Z",
        "dataAsOf": data_as_of,
        "files": files,
        "source": {
            "title": (
                "OpenStreetMap land polygons (full coastline) unioned with "
                "Mapterhorn DEM land (Klimadatastyrelsen)"
            ),
            "publisher": "OpenStreetMap contributors via osmdata.openstreetmap.de; Klimadatastyrelsen via Mapterhorn",
            "url": OSM_LAND_URL,
            "licence": "ODbL + CC BY 4.0 (DEM)",
            "attribution": "© OpenStreetMap contributors (ODbL) · © Klimadatastyrelsen / Mapterhorn (CC BY 4.0)",
            "redistribution": (
                "ODbL share-alike: derived masks must keep OSM attribution "
                "and publish under ODbL (opendatacommons.org/licenses/odbl). "
                "The DEM-derived portion keeps CC BY 4.0 attribution."
            ),
            "safety": NOT_FOR_NAVIGATION,
        },
        "notForNavigation": True,
        "notes": (
            "V1 interim shoreline: OSM coastline unioned with Mapterhorn DEM "
            "land (elevation > ~1 m) sampled in a z12 coastal band — the mask "
            "matches the land hillshade by construction (issue #19). Asiaq may "
            "replace both sources when authoritative distributable geometry "
            "arrives; clip-before-tile is future IBCAO/GEBCO work. "
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
    parser.add_argument(
        "--skip-dem-augment",
        action="store_true",
        help="Skip the Mapterhorn DEM land union (offline builds only)",
    )
    args = parser.parse_args()

    try:
        from shapely.geometry import box  # noqa: F401
    except ImportError as exc:
        raise SystemExit(
            "Missing pyshp/shapely/pyproj — create the venv first:\n"
            "  python3 -m venv .venv\n"
            "  .venv/bin/pip install pyshp shapely pyproj numpy pillow"
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

    if not args.skip_dem_augment:
        print("DEM land augmentation (issue #19)…")
        augmented = _dem_augment_polygons(parts, GREENLAND_BBOX)
        parts = parts + augmented
    else:
        print("DEM land augmentation skipped (--skip-dem-augment)")

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
