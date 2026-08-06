#!/usr/bin/env python3
"""Build the self-tiled IBCAO/GEBCO ocean-depth package (issue #23).

Creates web/public/packages/ocean-depth/:
- ocean-depth-dem.pmtiles     raster-dem (terrarium webp, 256 px, z0-10)
- ocean-depth-vector.pmtiles  MVT depare bands + contours (z0-11)
- manifest.json, ATTRIBUTION.md

Sources (cached under .cache/ocean-depth/, never committed):
- IBCAO v5.2 (2026) 400 m bathymetric grid — primary depth for the
  Arctic (north of 64N). EPSG:3996 polar stereographic; land masked.
  CEDA:
  https://data.ceda.ac.uk/bodc/gebco/ibcao/ibcao_v5.2/no_greenland_ice_sheet_elevation_data/400mx400m_grid_cell_spacing/single_complete_bathymetric_grid/
- GEBCO_2026 grid (15 arc-sec global ice-surface elevation) — fallback
  where IBCAO has no data (seas south of 64N, coastal gaps).
  CEDA tile:
  https://data.ceda.ac.uk/bodc/gebco/global/gebco_2026/ice_surface_elevation/geotiff/gebco_2026_n90.0_s0.0_w-90.0_e0.0_geotiff.tif
- Shared coastline: the coastline-land package land.geojson (OSM
  coastline ∪ Mapterhorn DEM land) — the exact shoreline the V1 display
  mask uses. Depth bands and contours are clipped to it BEFORE tiling,
  implementing the clip contract of web/src/map/coastline-clip.ts
  (mirrored here in shapely; the build verifies its own output).

Merging: the grids are warped to a common WGS84 15 arc-sec grid over the
Greenland bbox; IBCAO wins where it has data, GEBCO fills the rest. Land
cells (shared coastline) are 0 in the raster and nodata in the vector
grid; bands/contours are then clipped with shapely so nothing can drift
from the display mask.

Requirements: gdal (gdalwarp/gdal_rasterize/gdal_contour), tippecanoe,
numpy, pillow, shapely (repo .venv).

Usage:
  .venv/bin/python web/scripts/build-ocean-depth.py
Publish: bash scripts/publish-ocean-depth-assets.sh
Fetch:   bash scripts/fetch-ocean-depth-assets.sh
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np  # type: ignore[import-not-found]  # venv-only dep

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "web" / "public" / "packages" / "ocean-depth"
CACHE = ROOT / ".cache" / "ocean-depth"
COASTLINE_PKG = ROOT / "web" / "public" / "packages" / "coastline-land"

GREENLAND_BBOX = (-75.0, 59.5, -10.0, 84.0)  # W,S,E,N (same as the mask)
GRID_DEG = 1.0 / 240.0  # 15 arc-seconds — the GEBCO_2026 native cell size

# Same meter breaks the style renders (web/src/map/meter-bands.ts).
OCEAN_BREAKS_M = [5, 10, 20, 50, 100, 200, 500, 1000]

RASTER_MAX_ZOOM = 10  # 256 px terrarium webp; z11+ overzooms (data ~450 m)
VECTOR_MAX_ZOOM = 11  # MVT bands/contours; z12+ overzooms (corridor policy)
TILE_PX = 256

# Nodata marker for the vector depth grid (gdal_contour skips it).
DEPTH_NODATA = -32768
DEPTH_NODATA_STR = str(DEPTH_NODATA)

IBCAO_ZIP = CACHE / "ibcao_v5_2_2026_depth_400m.zip"
IBCAO_TIF = CACHE / "ibcao_v5_2_2026_depth_400m.tiff"
IBCAO_URL = (
    "https://data.ceda.ac.uk/bodc/gebco/ibcao/ibcao_v5.2/"
    "no_greenland_ice_sheet_elevation_data/400mx400m_grid_cell_spacing/"
    "single_complete_bathymetric_grid/ibcao_v5_2_2026_depth_400m.zip"
)
GEBCO_TIF = CACHE / "gebco_2026_tile.tif"
GEBCO_URL = (
    "https://data.ceda.ac.uk/bodc/gebco/global/gebco_2026/"
    "ice_surface_elevation/geotiff/gebco_2026_n90.0_s0.0_w-90.0_e0.0_geotiff.tif"
)
LAND_GEOJSON = CACHE / "land.geojson"

# Clip contract tolerances — same values as web/src/map/coastline-clip.ts
# and coastline-mask.test.ts.
OVERLAP_TOLERANCE_M2 = 25.0
BOUNDARY_EPSILON_M = 0.5


def _epsilon_deg_at(lat: float) -> float:
    """BOUNDARY_EPSILON_M expressed in degrees at a latitude."""
    import math

    return BOUNDARY_EPSILON_M / (111320.0 * max(0.1, abs(math.cos(math.radians(lat)))))


CONTOUR_SIMPLIFY_DEG = 0.001  # ~100 m — grid cells are ~400-450 m
BAND_SIMPLIFY_DEG = 0.001

ATTR_LINE = (
    "Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid, "
    "Seabed 2030) — not for navigation"
)


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr, flush=True)


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def run(cmd: list[str]) -> None:
    eprint("+ " + " ".join(str(part) for part in cmd))
    try:
        subprocess.run([str(part) for part in cmd], check=True)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(
            f"command failed ({exc.returncode}): "
            + " ".join(str(part) for part in cmd)
        ) from exc


def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        eprint(f"cached {dest.name} ({dest.stat().st_size / 1e6:.0f} MB)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    eprint(f"downloading {url} -> {dest}")
    if shutil.which("aria2c"):
        subprocess.run(
            [
                "aria2c", "--file-allocation=none", "--allow-overwrite=true",
                "-x8", "-s8", "-k1M", "-d", str(dest.parent),
                "-o", dest.name, url,
            ],
            check=True,
        )
        return
    urllib.request.urlretrieve(url, dest)


def ensure_coastline_land() -> Path:
    """land.geojson from the coastline-land release, sha256-verified."""
    manifest = COASTLINE_PKG / "manifest.json"
    if not manifest.exists():
        raise SystemExit(
            f"Missing {manifest} — run web/scripts/build-coastline-mask.py "
            "or fetch the coastline-land package first"
        )
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cannot read {manifest}: {exc}") from exc
    expected = None
    for row in data.get("files", []):
        if row.get("path") == "land.geojson":
            expected = row["sha256"]
    if not expected:
        raise SystemExit(f"coastline-land manifest has no land.geojson sha256")
    if LAND_GEOJSON.exists():
        _, have = sha256_file(LAND_GEOJSON)
        if have == expected:
            eprint("cached land.geojson (sha256 match)")
            return LAND_GEOJSON
    tag = f"web-coastline-mask-{data['id']}"
    fetch(
        f"https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/"
        f"releases/download/{tag}/land.geojson",
        LAND_GEOJSON,
    )
    _, have = sha256_file(LAND_GEOJSON)
    if have != expected:
        raise SystemExit(
            f"land.geojson sha256 mismatch: expected {expected}, got {have}"
        )
    return LAND_GEOJSON


def ensure_grids() -> None:
    """Warp IBCAO + GEBCO onto the shared 15 arc-sec Greenland grid."""
    ibcao_wgs = CACHE / "ibcao_wgs84.dat"
    gebco_wgs = CACHE / "gebco_wgs84.dat"
    if ibcao_wgs.exists() and gebco_wgs.exists():
        eprint("cached warped grids")
        return
    if not IBCAO_TIF.exists():
        fetch(IBCAO_URL, IBCAO_ZIP)
        import zipfile

        with zipfile.ZipFile(IBCAO_ZIP) as zf:
            zf.extractall(CACHE)
    fetch(GEBCO_URL, GEBCO_TIF)

    common = [
        "-t_srs", "EPSG:4326",
        "-te", *[str(v) for v in GREENLAND_BBOX],
        "-tr", str(GRID_DEG), str(GRID_DEG),
        "-r", "near",
        "-of", "ENVI",
        "-overwrite",
        "-dstnodata", DEPTH_NODATA_STR,
    ]
    if not ibcao_wgs.exists():
        eprint("warping IBCAO 400 m -> WGS84 15 arc-sec …")
        run(["gdalwarp", *common, str(IBCAO_TIF), str(ibcao_wgs)])
    if not gebco_wgs.exists():
        eprint("warping GEBCO_2026 tile -> WGS84 15 arc-sec …")
        run(["gdalwarp", *common, str(GEBCO_TIF), str(gebco_wgs)])


def read_envi(path: Path) -> np.ndarray:
    """Read a 1-band ENVI raster (written by gdalwarp) into float32."""
    try:
        hdr = path.with_suffix(".hdr").read_text(encoding="utf-8")
    except OSError as exc:
        raise SystemExit(f"Cannot read {path}.hdr: {exc}") from exc
    fields: dict[str, str] = {}
    for line in hdr.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            fields[key.strip()] = value.strip()
    try:
        samples = int(fields["samples"])
        lines = int(fields["lines"])
        dtype = {1: np.uint8, 2: np.int16, 4: np.float32}[int(fields["data type"])]
    except (KeyError, ValueError) as exc:
        raise SystemExit(f"Malformed ENVI header {path}.hdr: {exc}") from exc
    raw = path.read_bytes()
    arr = np.frombuffer(raw, dtype=dtype).reshape(lines, samples)
    return arr.astype(np.float32)


def load_land_parts(geojson: Path) -> list:
    from shapely.geometry import MultiPolygon, shape  # type: ignore[import-not-found]

    try:
        fc = json.loads(geojson.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cannot read {geojson}: {exc}") from exc
    parts = []
    for feature in fc.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        poly = shape(geom)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        if isinstance(poly, MultiPolygon):
            parts.extend(p for p in poly.geoms if not p.is_empty)
        else:
            parts.append(poly)
    eprint(f"land polygons: {len(parts)}")
    return parts


def rasterize_land_mask(parts: list, shape_rc: tuple[int, int]) -> np.ndarray:
    """Burn the shared coastline onto the grid: True = land."""
    import tempfile

    from shapely.geometry import mapping  # type: ignore[import-not-found]

    lines, samples = shape_rc
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": mapping(poly),
                }
                for poly in parts
            ],
        }
        geojson = tmpdir / "land.json"
        geojson.write_text(json.dumps(fc), encoding="utf-8")
        out = tmpdir / "mask.dat"
        run(
            [
                "gdal_rasterize",
                "-burn", "1",
                "-init", "0",
                "-te", *[str(v) for v in GREENLAND_BBOX],
                "-tr", str(GRID_DEG), str(GRID_DEG),
                "-ot", "Byte",
                "-of", "ENVI",
                str(geojson),
                str(out),
            ]
        )
        mask = read_envi(out).astype(bool)
    return mask


def write_envi(
    path: Path,
    arr: np.ndarray,
    nodata: float | None = None,
    cell_deg: float = GRID_DEG,
) -> None:
    """Write a float32 1-band north-up ENVI raster for gdal_contour."""
    lines, samples = arr.shape
    header = f"""ENVI
samples = {samples}
lines = {lines}
bands = 1
header offset = 0
file type = ENVI Standard
data type = 4
interleave = bsq
byte order = 0
{"data ignore value = " + str(nodata) if nodata is not None else ""}
map info = {{Geographic Lat/Lon, 1, 1, {GREENLAND_BBOX[0]}, {GREENLAND_BBOX[3]}, {cell_deg}, {cell_deg}, 0, 0, WGS-84, units=Degrees}}
coordinate system string = {{GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]}}
description = {{nunat ocean depth grid}}
"""
    # GDAL's ENVI driver reads the header from the .hdr file (with the
    # .dat beside it); callers pass the .dat path or a bare stem.
    hdr = path.with_suffix(".hdr")
    hdr.write_text(header, encoding="utf-8")
    arr.astype(np.float32).tofile(hdr.with_suffix(".dat"))


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    import math

    try:
        n = 2**z
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    except (ValueError, ZeroDivisionError) as exc:
        raise ValueError(f"invalid tile coordinates for ({lon}, {lat}, z{z})") from exc
    return x, y


def tile_bounds(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    import math

    n = 2**z
    lon0 = x / n * 360.0 - 180.0
    lon1 = (x + 1) / n * 360.0 - 180.0
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon0, lat0, lon1, lat1


def bbox_tiles(z: int) -> list[tuple[int, int]]:
    w, s, e, n = GREENLAND_BBOX
    x0, y_north = tile_xy(w, n, z)
    x1, y_south = tile_xy(e, s, z)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y_north, y_south + 1)]


def terrarium_webp(elev_m: np.ndarray) -> bytes:
    """float32 elevation array (sea negative, land 0) -> lossless webp."""
    from PIL import Image  # type: ignore[import-not-found]  # venv-only dep

    shifted = np.clip(elev_m + 32768.0, 0.0, 65535.0)
    terr = np.zeros((*elev_m.shape, 3), dtype=np.uint8)
    terr[:, :, 0] = (shifted // 256.0).astype(np.uint8)
    terr[:, :, 1] = (shifted % 256.0).astype(np.uint8)
    terr[:, :, 2] = ((shifted * 256.0) % 256.0).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(terr, "RGB").save(out, format="WEBP", lossless=True, method=1)
    return out.getvalue()


def _safe_float(value: object, what: str) -> float:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (ValueError, TypeError, OverflowError) as exc:
        raise SystemExit(f"{what}: invalid number {value!r}") from exc
    return result


def build_raster_tiles(elev_grid: np.ndarray) -> dict[tuple[int, int, int], bytes]:
    """Slice the clipped elevation grid into terrarium webp tiles.

    Nearest-neighbour sampling per tile pixel (vectorized fancy indexing):
    the grid is ~3x denser than a z10 tile pixel, so bilinear vs nearest
    is visually indistinguishable while the numpy path is microseconds per
    tile (PIL F-mode resize of multi-megapixel crops is pathologically
    slow). Tiles outside the grid fall back to flat 0.
    """
    lines, samples = elev_grid.shape
    # Cell-edge ladders (ascending) for index lookup.
    rows_asc = np.linspace(GREENLAND_BBOX[1], GREENLAND_BBOX[3], lines + 1)
    cols_asc = np.linspace(GREENLAND_BBOX[0], GREENLAND_BBOX[2], samples + 1)
    px = np.arange(TILE_PX, dtype=np.float64)

    def sample(w: float, s: float, e: float, n: float) -> np.ndarray:
        lon = w + (px + 0.5) * (e - w) / TILE_PX
        lat = n - (px + 0.5) * (n - s) / TILE_PX
        r_idx = np.clip(
            lines - np.searchsorted(rows_asc, lat, side="right"),
            0,
            lines - 1,
        )
        c_idx = np.clip(
            np.searchsorted(cols_asc, lon, side="right") - 1,
            0,
            samples - 1,
        )
        elev = elev_grid[np.ix_(r_idx, c_idx)]
        # Pixels outside the grid extent render flat 0, never a clamped
        # edge column stretched across the tile.
        inside_lon = (lon >= GREENLAND_BBOX[0]) & (lon <= GREENLAND_BBOX[2])
        inside_lat = (lat >= GREENLAND_BBOX[1]) & (lat <= GREENLAND_BBOX[3])
        elev = np.where(np.outer(inside_lat, inside_lon), elev, 0.0)
        return elev

    tiles: dict[tuple[int, int, int], bytes] = {}
    total = sum(len(bbox_tiles(z)) for z in range(RASTER_MAX_ZOOM + 1))
    done = 0
    for z in range(RASTER_MAX_ZOOM + 1):
        eprint(f"  raster zoom {z}: {len(bbox_tiles(z))} tiles")
        for x, y in bbox_tiles(z):
            w, s, e, n = tile_bounds(x, y, z)
            elev = sample(w, s, e, n)
            tiles[(z, x, y)] = terrarium_webp(elev)
            done += 1
            if done % 5000 == 0:
                eprint(f"  raster tiles {done}/{total}")
    eprint(f"raster tiles: {done}")
    return tiles


def load_geojson_shapes(path: Path) -> tuple[list, list[dict]]:
    """Load a gdal_contour GeoJSON into shapely geometries + properties."""
    from shapely.geometry import shape  # type: ignore[import-not-found]

    try:
        fc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Cannot read {path}: {exc}") from exc
    geoms = []
    props = []
    for feature in fc.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        poly = shape(geom)
        if poly.is_empty:
            continue
        geoms.append(poly)
        props.append(feature.get("properties") or {})
    return geoms, props


def clip_verify(
    geoms: list,
    props: list[dict],
    land_parts: list,
    *,
    kind: str,
) -> tuple[list, list[dict]]:
    """Clip geometry to the shared coastline and verify the clip contract.

    Mirrors web/src/map/coastline-clip.ts semantics: bands = band minus
    land; contours = keep only the parts outside land (shapely difference
    splits at crossings, same result as the turf line-split contract).
    Verification (build fails loudly when the contract is violated):
    - bands: overlap with land < 25 m2 per feature;
    - contours: no vertex or sampled midpoint truly inside land (boundary
      epsilon 0.5 m, like the TS regression fixtures).
    """
    from shapely.geometry import Point, box  # type: ignore[import-not-found]
    from shapely.ops import unary_union  # type: ignore[import-not-found]
    from shapely.strtree import STRtree  # type: ignore[import-not-found]

    land_tree = STRtree(land_parts)
    land_union_cache: dict[tuple, object] = {}

    def local_land(bounds, geom=None) -> object:
        key = tuple(round(v, 4) for v in bounds)
        if key not in land_union_cache:
            idx = land_tree.query(box(*bounds))
            if geom is not None:
                from shapely.prepared import prep  # type: ignore[import-not-found]

                prepared = prep(geom)
                local = [
                    land_parts[i]
                    for i in idx
                    if prepared.intersects(land_parts[i])
                ]
            else:
                local = [land_parts[i] for i in idx]
            if not local:
                return None
            land_union_cache[key] = unary_union(local)
        return land_union_cache[key]

    out_geoms = []
    out_props = []
    if kind == "bands":
        for geom, prop in zip(geoms, props):
            local = local_land(geom.bounds, geom)
            clipped = geom.difference(local) if local is not None else geom
            if clipped.is_empty:
                continue
            out_geoms.append(clipped)
            out_props.append(prop)
        # Verify: no clipped band overlaps land beyond numeric noise.
        eprint("verifying band clip (overlap < 25 m2) …")
        bad = 0
        for index, geom in enumerate(out_geoms):
            local = local_land(geom.bounds, geom)
            if local is None:
                continue
            overlap = geom.intersection(local)
            if overlap.is_empty:
                continue
            m2 = unary_union(overlap).area * 111320.0 * 111320.0
            if m2 > OVERLAP_TOLERANCE_M2:
                bad += 1
                if bad <= 3:
                    eprint(
                        f"  band {index} overlaps land by {m2:.0f} m2 "
                        f"(tolerance {OVERLAP_TOLERANCE_M2:.0f})"
                    )
        if bad:
            raise SystemExit(f"band clip contract violated: {bad} bands on land")
    else:  # contours
        # Truly-inside test: a point is on land only when it is farther
        # than BOUNDARY_EPSILON_M from the coastline (TS fixtures use the
        # same semantics). Eroding the land by the epsilon implements that
        # exactly — a buffered (grown) land would wrongly flag every split
        # endpoint that sits on the boundary.
        land_eroded = [
            p.buffer(-_epsilon_deg_at((p.bounds[1] + p.bounds[3]) / 2.0))
            for p in land_parts
        ]
        land_eroded = [p for p in land_eroded if p is not None and not p.is_empty]
        eroded_tree = STRtree(land_eroded)
        for geom, prop in zip(geoms, props):
            local = local_land(geom.bounds, geom)
            clipped = geom.difference(local) if local is not None else geom
            if clipped.is_empty:
                continue
            if clipped.geom_type == "MultiLineString":
                pieces = list(clipped.geoms)
            else:
                pieces = [clipped]
            out_geoms.extend(pieces)
            out_props.extend(prop for _ in pieces)
        eprint("verifying contour clip (no point truly inside land) …")
        bad = 0
        checked = 0
        for index, geom in enumerate(out_geoms):
            coords = list(geom.coords)
            samples = []
            for a, b in zip(coords[:-1], coords[1:]):
                for t in (0.25, 0.5, 0.75):
                    samples.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            for position in [*coords, *samples]:
                checked += 1
                point = Point(position[0], position[1])
                hits = eroded_tree.query(point)
                inside = any(
                    land_eroded[i].contains(point) for i in hits
                )
                if inside:
                    bad += 1
                    if bad <= 3:
                        eprint(f"  contour {index} has a point inside land at {position}")
        eprint(f"contour points checked: {checked}")
        if bad:
            raise SystemExit(
                f"contour clip contract violated: {bad} points on land"
            )
    return out_geoms, out_props


def build_vector(
    depth_grid: np.ndarray,
    land_parts: list,
) -> tuple[Path, Path]:
    """gdal_contour bands + lines on the depth grid, clipped, then tippecanoe."""
    import gc

    from shapely.strtree import STRtree  # type: ignore[import-not-found]  # venv-only dep

    depth_env = CACHE / "depth.env"
    write_envi(depth_env, depth_grid, nodata=DEPTH_NODATA)
    # GDAL's ENVI driver wants the data file (header sits beside it).
    depth_dat = depth_env.with_suffix(".dat")

    tree = STRtree(land_parts)
    # Clip coastline: 200 m simplified land. The display mask (full
    # precision) sits above every ocean layer, so the clip's precision is
    # invisible on screen; the simplification makes the unions/differences
    # ~10x cheaper (the deep-basin band bbox spans all of Greenland).
    clip_land = []
    for part in land_parts:
        simple = part.simplify(0.002, preserve_topology=True)
        if not simple.is_valid:
            simple = simple.buffer(0)
        if not simple.is_empty:
            clip_land.append(simple)
    clip_tree = STRtree(clip_land)

    # Resumable: the clipped GeoJSONs are deterministic given the depth
    # grid and the shared coastline; reuse them when nothing changed.
    cached_bands = CACHE / "bands-clipped-v2.geojson"
    cached_contours = CACHE / "contours-clipped-v2.geojson"
    simplified_bands = CACHE / "bands-simplified-v2.geojson"
    simplified_contours = CACHE / "contours-simplified-v2.geojson"
    # The depth grid derives from the warped grids + land polygons; depth.dat
    # is rewritten every run, so freshness compares against the inputs.
    vector_inputs = [
        CACHE / "ibcao_wgs84.dat",
        CACHE / "gebco_wgs84.dat",
        LAND_GEOJSON,
    ]

    def newer_than_inputs(path: Path) -> bool:
        return path.exists() and all(
            path.stat().st_mtime > source.stat().st_mtime
            for source in vector_inputs
        )

    cache_fresh = newer_than_inputs(cached_bands) and newer_than_inputs(
        cached_contours
    )
    if cache_fresh:
        eprint(f"reusing clipped vector caches ({cached_bands.name} + {cached_contours.name})")
        bands_json = cached_bands
        contours_json = cached_contours
        del depth_grid
        gc.collect()
    else:
        bands_json, contours_json = _build_clipped_vector(
            depth_dat,
            depth_grid,
            land_parts,
            tree,
            cached_bands,
            cached_contours,
            simplified_bands,
            simplified_contours,
            clip_land,
            clip_tree,
        )

    out = OUT_DIR / "ocean-depth-vector.pmtiles"
    out.parent.mkdir(parents=True, exist_ok=True)
    tippecanoe = shutil.which("tippecanoe")
    if not tippecanoe:
        raise SystemExit("tippecanoe not found — brew install tippecanoe")
    run(
        [
            tippecanoe,
            "-o", str(out),
            "-Z0", f"-z{VECTOR_MAX_ZOOM}",
            "-L", f"depare:{bands_json}",
            "-L", f"contours:{contours_json}",
            "--simplify-only-low-zooms",
            "-pf", "-pk",
            "--force",
        ]
    )
    return out, contours_json


def _build_clipped_vector(
    depth_dat: Path,
    depth_grid: np.ndarray,
    land_parts: list,
    tree,
    bands_out: Path,
    contours_out: Path,
    simplified_bands_cache: Path,
    simplified_contours_cache: Path,
    clip_land: list,
    clip_tree,
) -> tuple[Path, Path]:
    """gdal_contour + clip + verify the depth grid; cache the clipped GeoJSONs."""
    import gc
    import tempfile

    from shapely.geometry import box, mapping  # type: ignore[import-not-found]
    from shapely.ops import unary_union  # type: ignore[import-not-found]

    # Same input-freshness baseline as build_vector (warped grids + land).
    vector_inputs = [
        CACHE / "ibcao_wgs84.dat",
        CACHE / "gebco_wgs84.dat",
        LAND_GEOJSON,
    ]

    def newer_than_inputs(path: Path) -> bool:
        return path.exists() and all(
            path.stat().st_mtime > source.stat().st_mtime
            for source in vector_inputs
        )

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        bands_raw = tmpdir / "bands.geojson"
        contours_raw = tmpdir / "contours.geojson"
        # Bands: 30 arc-sec grid (every 2nd cell) — 4x fewer cells, same
        # meter classes; the band edges are simplified to ~100 m anyway.
        bands_env = tmpdir / "depth-bands.env"
        write_envi(
            bands_env,
            depth_grid[::2, ::2],
            nodata=DEPTH_NODATA,
            cell_deg=GRID_DEG * 2,
        )
        bands_dat = bands_env.with_suffix(".dat")
        del depth_grid
        gc.collect()
        bands_simple = tmpdir / "bands-simplified.geojson"
        contours_simple = tmpdir / "contours-simplified.geojson"
        # gdal_contour + ogr2ogr are the slow stages (~15 min for the band
        # polygonization) — reuse their simplified output when the inputs
        # (warped grids + land polygons) did not change.
        simplified_fresh = newer_than_inputs(
            simplified_bands_cache
        ) and newer_than_inputs(simplified_contours_cache)
        if simplified_fresh:
            eprint("reusing simplified contour/band GeoJSON caches")
            bands_simple = simplified_bands_cache
            contours_simple = simplified_contours_cache
        else:
            # Band polygon intervals: gdal_contour -p emits ONLY intervals
            # between listed levels (GDAL 3.13), so the [0,5) band needs an
            # explicit 0 level and the >1000 m band needs a synthetic top
            # level; drval0/drval1 are the interval bounds (-amin/-amax).
            band_levels = [0, *OCEAN_BREAKS_M, 1_000_000]
            band_level_args: list[str] = []
            for level in band_levels:
                band_level_args += ["-fl", str(level)]
            line_level_args: list[str] = []
            for level in OCEAN_BREAKS_M:
                line_level_args += ["-fl", str(level)]
            eprint("gdal_contour: depth band polygons (30 arc-sec grid) …")
            run(
                [
                    "gdal_contour", "-p",
                    "-amin", "drval0", "-amax", "drval1",
                    *band_level_args,
                    "-of", "GeoJSON", str(bands_dat), str(bands_raw),
                ]
            )
            eprint("gdal_contour: depth contour lines …")
            run(
                [
                    "gdal_contour", "-a", "depth_abs_m",
                    *line_level_args,
                    "-of", "GeoJSON", str(depth_dat), str(contours_raw),
                ]
            )

            # Simplify with GDAL (streaming C++, no full-load): the raw
            # cell-resolution zigzag (450 m steps) would otherwise produce
            # multi-GB GeoJSONs and blow memory when parsed into shapely.
            # OGR_GEOJSON_MAX_OBJ_SIZE: the deep-basin band polygon is a
            # single feature above GDAL's default 100 MB object cap.
            eprint("ogr2ogr: simplifying band polygons …")
            run(
                [
                    "ogr2ogr",
                    "--config", "OGR_GEOJSON_MAX_OBJ_SIZE", "0",
                    "-simplify", str(BAND_SIMPLIFY_DEG),
                    "-f", "GeoJSON", str(bands_simple), str(bands_raw),
                ]
            )
            eprint("ogr2ogr: simplifying contour lines …")
            run(
                [
                    "ogr2ogr",
                    "--config", "OGR_GEOJSON_MAX_OBJ_SIZE", "0",
                    "-simplify", str(CONTOUR_SIMPLIFY_DEG),
                    "-f", "GeoJSON", str(contours_simple), str(contours_raw),
                ]
            )
            shutil.copy2(bands_simple, simplified_bands_cache)
            shutil.copy2(contours_simple, simplified_contours_cache)
        eprint(
            f"simplified bands: {bands_simple.stat().st_size / 1e6:.1f} MB, "
            f"contours: {contours_simple.stat().st_size / 1e6:.1f} MB"
        )

        band_geoms, band_props = load_geojson_shapes(bands_simple)
        eprint(f"raw bands: {len(band_geoms)}")

        # Normalize drval1 to the Seascape convention (upper band edge):
        # the style colors bands by drval1 (5 = 0-5 m, 10 = 5-10 m, ...).
        def normalize_drval1(value: float) -> float:
            for level in OCEAN_BREAKS_M:
                if value < level:
                    return level
            return OCEAN_BREAKS_M[-1]

        for prop in band_props:
            raw = prop.get("drval1")
            if isinstance(raw, (int, float)):
                prop["drval1"] = normalize_drval1(_safe_float(raw, "drval1"))
            prop["sys"] = "m"

        # Clip bands, then free their geometries before loading the
        # contours (16 GB machines OOM with both collections in memory).
        eprint("clipping bands …")
        clipped_bands = []
        clipped_band_props = []
        for geom, prop in zip(band_geoms, band_props):
            simple = geom
            # ogr2ogr's Douglas-Peucker pass can leave self-intersecting
            # rings on long band boundaries — repair before GEOS ops.
            if not simple.is_valid:
                simple = simple.buffer(0)
            if simple.is_empty:
                continue
            idx = clip_tree.query(box(*simple.bounds))
            if len(idx) > 0:
                # Only parts that truly intersect the band matter: the
                # deep-basin band's bbox covers all of Greenland, and
                # unioning 215k parts per band is the slow path (10+ min).
                # Prepared geometry keeps the per-part test envelope-fast.
                from shapely.prepared import prep  # type: ignore[import-not-found]

                prepared = prep(simple)
                local_parts = [
                    clip_land[i]
                    for i in idx
                    if prepared.intersects(clip_land[i])
                ]
                if local_parts:
                    simple = simple.difference(unary_union(local_parts))
            if simple.is_empty:
                continue
            simple = simple.simplify(BAND_SIMPLIFY_DEG, preserve_topology=True)
            if simple.is_empty:
                continue
            if simple.geom_type == "Polygon":
                clipped_bands.append(simple)
                clipped_band_props.append(prop)
            elif simple.geom_type == "MultiPolygon":
                for part in simple.geoms:
                    if not part.is_empty:
                        clipped_bands.append(part)
                        clipped_band_props.append(prop)
        del band_geoms, band_props
        gc.collect()

        # Now the contours, loaded after the band geometries are freed.
        contour_geoms, contour_props = load_geojson_shapes(contours_simple)
        eprint(f"raw contours: {len(contour_geoms)}")

        for prop in contour_props:
            depth = prop.get("depth_abs_m")
            if isinstance(depth, (int, float)):
                prop["depth_m"] = -_safe_float(depth, "depth_abs_m")
            if "sys" in prop:
                del prop["sys"]

        # Clip contours, then free them before the verification pass.
        eprint("clipping contours …")
        clipped_contours = []
        clipped_contour_props = []
        for geom, prop in zip(contour_geoms, contour_props):
            simple = geom
            if not simple.is_valid:
                simple = simple.buffer(0)
            if simple.is_empty:
                continue
            idx = clip_tree.query(box(*simple.bounds))
            if len(idx) > 0:
                # Only land parts intersecting the line itself matter
                # (bbox queries return far more).
                local_parts = [
                    clip_land[i]
                    for i in idx
                    if clip_land[i].intersects(simple)
                ]
                if local_parts:
                    simple = simple.difference(unary_union(local_parts))
            if simple.is_empty:
                continue
            simple = simple.simplify(CONTOUR_SIMPLIFY_DEG, preserve_topology=True)
            if simple.is_empty:
                continue
            if simple.geom_type == "LineString":
                clipped_contours.append(simple)
                clipped_contour_props.append(prop)
            elif simple.geom_type == "MultiLineString":
                for part in simple.geoms:
                    if not part.is_empty:
                        clipped_contours.append(part)
                        clipped_contour_props.append(prop)

        eprint(f"clipped bands: {len(clipped_bands)}, clipped contours: {len(clipped_contours)}")

        # The clip-contract verification on the final output.
        final_bands, final_band_props = clip_verify(
            clipped_bands, clipped_band_props, clip_land, kind="bands"
        )
        final_contours, final_contour_props = clip_verify(
            clipped_contours, clipped_contour_props, clip_land, kind="contours"
        )

        bands_fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": prop,
                    "geometry": mapping(geom),
                }
                for geom, prop in zip(final_bands, final_band_props)
            ],
        }
        contours_fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": prop,
                    "geometry": mapping(geom),
                }
                for geom, prop in zip(final_contours, final_contour_props)
            ],
        }
        bands_out.write_text(json.dumps(bands_fc), encoding="utf-8")
        contours_out.write_text(json.dumps(contours_fc), encoding="utf-8")
        eprint(
            f"clipped bands geojson: {bands_out.stat().st_size / 1e6:.1f} MB, "
            f"contours: {contours_out.stat().st_size / 1e6:.1f} MB"
        )
        return bands_out, contours_out


def build_raster_archive(elev_grid: np.ndarray) -> Path:
    from pmtiles_writer import write_pmtiles  # type: ignore[import-not-found]  # web/scripts on sys.path

    tiles = build_raster_tiles(elev_grid)
    out = OUT_DIR / "ocean-depth-dem.pmtiles"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_pmtiles(
        tiles,
        out,
        tile_type=4,  # webp
        tile_compression=0,
        bbox=GREENLAND_BBOX,
        metadata={
            "name": "Greenland ocean depth DEM (IBCAO v5.2 + GEBCO_2026)",
            "description": (
                "Self-tiled ocean depth (terrarium webp, 256 px, z0-10): "
                "IBCAO v5.2 400 m primary, GEBCO_2026 fallback, clipped to "
                "the shared coastline (OSM ∪ Mapterhorn DEM land) before "
                "tiling. Not for navigation."
            ),
            "attribution": ATTR_LINE,
            "minzoom": 0,
            "maxzoom": RASTER_MAX_ZOOM,
            "bounds": list(GREENLAND_BBOX),
            "center": [
                sum(GREENLAND_BBOX[0::2]) / 2,
                sum(GREENLAND_BBOX[1::2]) / 2,
                min(6, RASTER_MAX_ZOOM),
            ],
            "format": "webp",
            "generator": "nunat build-ocean-depth.py",
        },
    )
    return out


def write_manifest(
    dem: Path,
    vector: Path,
    contours_json: Path,
    created_at: str,
) -> Path:
    rows = []
    for path in (dem, vector):
        size, sha = sha256_file(path)
        rows.append({"path": path.name, "bytes": size, "sha256": sha})
    package_id = f"ocean-depth_{created_at}"
    manifest = {
        "id": package_id,
        "slug": "ocean-depth",
        "title": {
            "kl": "Imarmiut itissusaat (IBCAO/GEBCO)",
            "da": "Havdybde (IBCAO/GEBCO)",
            "en": "Ocean depth (IBCAO/GEBCO)",
        },
        "description": (
            "Self-tiled ocean depth replacing the Open Waters Seascape "
            "interim source: IBCAO v5.2 (2026) 400 m bathymetric grid "
            "primary with GEBCO_2026 (15 arc-sec) fallback, merged on a "
            "WGS84 15 arc-sec grid over the Greenland bbox. Depth bands "
            "and contours are clipped to the shared coastline (OSM ∪ "
            "Mapterhorn DEM land — the same shoreline the display mask "
            "uses) before tiling; the raster clips land cells to 0. "
            "Not for navigation."
        ),
        "bbox": list(GREENLAND_BBOX),
        "minZoom": 0,
        "maxZoom": RASTER_MAX_ZOOM,
        "bytes": sum(row["bytes"] for row in rows),
        "createdAt": f"{created_at}T00:00:00Z",
        "dataAsOf": created_at,
        "files": rows,
        "source": {
            "title": (
                "IBCAO v5.2 (2026) 400 m bathymetric grid ∪ GEBCO_2026 "
                "15 arc-sec grid (fallback)"
            ),
            "publisher": (
                "IBCAO (International Bathymetric Chart of the Arctic "
                "Ocean) / Nippon Foundation-GEBCO Seabed 2030; GEBCO "
                "(General Bathymetric Chart of the Oceans)"
            ),
            "url": IBCAO_URL,
            "licence": (
                "IBCAO v5.2: Open Government Licence v3.0 (OGL-3.0, UK) — "
                "free use with attribution; GEBCO_2026: free use with "
                "attribution to the GEBCO Compilation Group"
            ),
            "attribution": ATTR_LINE,
            "redistribution": (
                "IBCAO v5.2 is published under the Open Government Licence "
                "v3.0 (nationalarchives.gov.uk/doc/open-government-licence/version/3/) "
                "— free use with attribution. GEBCO_2026 is free to use with "
                "attribution to the GEBCO Compilation Group. The clipped "
                "bathymetry is derived from the shared coastline and keeps "
                "OSM ODbL share-alike obligations for the "
                "coastline-derived portions."
            ),
            "safety": "not-for-navigation",
        },
        "notForNavigation": True,
        "notes": (
            "Self-tiled IBCAO/GEBCO bathymetry (issue #23): merged WGS84 "
            "15 arc-sec grid, IBCAO v5.2 400 m primary north of 64N with "
            "GEBCO_2026 fallback; depth bands + contours clipped to the "
            "shared coastline (OSM ∪ Mapterhorn DEM land) before tiling — "
            "the clip contract of web/src/map/coastline-clip.ts mirrored "
            "in the build, verified at build time (band overlap < 25 m2, "
            "no contour point inside land). Raster is terrarium webp "
            "256 px z0-10 (z11+ overzooms), vector MVT z0-11 (z12+ "
            "overzooms). Not a chart; not for navigation. Files are hosted "
            "on a GitHub Release. Fetch: bash scripts/fetch-ocean-depth-assets.sh"
        ),
    }
    out = OUT_DIR / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return out


def write_attribution() -> None:
    text = f"""# Ocean depth (IBCAO/GEBCO) — attribution and redistribution

The web product map's ocean layers (depth fills, contours, contour labels,
hillshade) are self-tiled from the IBCAO v5.2 bathymetric grid with the
GEBCO_2026 grid as fallback. This replaces the interim Open Waters Seascape
source (issue #23).

## Sources

- IBCAO v5.2 (2026) 400 m grid: <{IBCAO_URL}>
  Bathymetry north of 64N, EPSG:3996, elevation in metres (sea negative,
  Greenland ice sheet elevation excluded). Publisher: IBCAO (International
  Bathymetric Chart of the Arctic Ocean), part of the Nippon
  Foundation-GEBCO Seabed 2030 project. Licence: Open Government Licence
  v3.0 (<https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>).
- GEBCO_2026 grid (15 arc-sec global ice-surface elevation):
  <https://www.gebco.net/data_and_products/gridded_bathymetry_data/>
  Used as fallback where IBCAO has no data (seas south of 64N, coastal
  gaps). Publisher: GEBCO Compilation Group.
- Shared coastline for clipping: OpenStreetMap coastline land polygons
  (ODbL) unioned with Mapterhorn DEM land (Klimadatastyrelsen, CC BY 4.0) —
  the same shoreline the display mask uses (see packages/coastline-land).
- Build: `web/scripts/build-ocean-depth.py` warps both grids to a WGS84
  15 arc-sec Greenland grid, merges (IBCAO wins where valid), clips land
  cells to the shared coastline, and tiles: raster-dem terrarium webp
  (256 px, z0-10) + MVT depth bands/contours (z0-11), both clipped before
  tiling and verified at build time.

## Attribution (required, shown in the map)

> Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid,
> Seabed 2030) — not for navigation

## Redistribution terms

- IBCAO/GEBCO grids: IBCAO v5.2 under the Open Government Licence v3.0
  (free use with attribution); GEBCO_2026 free to use with attribution to
  the GEBCO Compilation Group. Derived products must acknowledge
  IBCAO/GEBCO Compilation Group.
- The coastline-derived portions (clipping shoreline) carry OSM ODbL
  share-alike obligations; the DEM-derived shoreline portions keep
  CC BY 4.0 (Klimadatastyrelsen / Mapterhorn).
- Not for navigation: display context and cartographic signal only; no
  safety-of-life claims. This is not a chart.
"""
    (OUT_DIR / "ATTRIBUTION.md").write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="use cached grids only; fail if sources are missing",
    )
    args = parser.parse_args()

    try:
        from shapely.geometry import shape  # noqa: F401  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit(
            "Missing shapely/numpy — create the venv first:\n"
            "  uv venv .venv --python 3.12 && "
            "uv pip install --python .venv/bin/python numpy pillow shapely"
        ) from exc

    for tool in ("gdalwarp", "gdal_rasterize", "gdal_contour", "tippecanoe"):
        if not shutil.which(tool):
            raise SystemExit(f"Missing {tool} — brew install gdal tippecanoe")

    CACHE.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    land_geojson = ensure_coastline_land()
    land_parts = load_land_parts(land_geojson)
    if not land_parts:
        raise SystemExit("No land polygons — shared coastline missing")

    ensure_grids()
    ibcao = read_envi(CACHE / "ibcao_wgs84.dat")
    gebco = read_envi(CACHE / "gebco_wgs84.dat")
    eprint(f"grids: ibcao {ibcao.shape}, gebco {gebco.shape}")
    if ibcao.shape != gebco.shape:
        raise SystemExit("warped grids differ in shape — rebuild caches")

    # IBCAO v5.2: elevation in metres (sea negative, land positive), no
    # nodata metadata — land cells carry real elevations. GEBCO_2026: same
    # convention, nodata outside its coverage (warped to DEPTH_NODATA).
    # IBCAO wins where it has data; GEBCO fills the rest.
    ibcao_valid = ibcao != DEPTH_NODATA
    gebco_valid = gebco != DEPTH_NODATA
    elevation = np.where(ibcao_valid, ibcao, 0.0)
    elevation = np.where(gebco_valid & ~ibcao_valid, gebco, elevation)
    # Land is the mask's job: any positive cell (IBCAO/GEBCO land beyond
    # the shared coastline) renders flat, never as depth or relief.
    elevation = np.where(elevation > 0, 0.0, elevation)

    land_mask = rasterize_land_mask(land_parts, elevation.shape)
    eprint(f"land cells: {land_mask.sum() / land_mask.size * 100:.1f}%")

    # Raster clip: land cells are flat 0 (never depth under the mask).
    raster_elev = np.where(land_mask, 0.0, elevation)
    # Vector grid: land cells are nodata; depth positive in sea.
    depth_grid = np.where(
        land_mask, DEPTH_NODATA, np.maximum(0.0, -elevation)
    )

    dem = OUT_DIR / "ocean-depth-dem.pmtiles"
    grids = [CACHE / "ibcao_wgs84.dat", CACHE / "gebco_wgs84.dat"]
    raster_fresh = dem.exists() and all(
        dem.stat().st_mtime > grid.stat().st_mtime for grid in grids
    )
    if raster_fresh:
        eprint("reusing existing ocean-depth-dem.pmtiles (deterministic output)")
    else:
        dem = build_raster_archive(raster_elev)
    eprint(f"ocean-depth-dem.pmtiles: {dem.stat().st_size / 1e6:.1f} MB")

    # Free the 2 GB of float32 grids before the vector stage (16 GB
    # machines OOM with everything resident). depth_grid is freed inside
    # build_vector after depth.dat is written.
    import gc

    del ibcao, gebco, elevation, land_mask, raster_elev
    gc.collect()

    vector, contours_json = build_vector(depth_grid, land_parts)
    eprint(f"ocean-depth-vector.pmtiles: {vector.stat().st_size / 1e6:.1f} MB")

    write_attribution()
    manifest = write_manifest(dem, vector, contours_json, created_at)
    eprint(f"manifest: {manifest}")
    print(
        f"Built {OUT_DIR}\n"
        "Publish: bash scripts/publish-ocean-depth-assets.sh\n"
        "Fetch on other machines: bash scripts/fetch-ocean-depth-assets.sh"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
