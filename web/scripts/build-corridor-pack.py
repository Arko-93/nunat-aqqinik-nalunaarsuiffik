#!/usr/bin/env python3
"""Build the full Qaarsut→Kullorsuaq corridor offline pack.

Creates web/public/packages/qaarsut-kullorsuaq/{land-relief.pmtiles,
ocean-depth-dem.pmtiles, ocean-depth-vector.pmtiles,
coastline-land/land.pmtiles, localities.geojson, manifest.json,
ATTRIBUTION.md}.

Sources (all already live in the online map):
- land-relief: Mapterhorn Terrarium webp tiles (Klimadatastyrelsen
  Greenland DEM, CC BY 4.0) — the exact tiles the online style serves,
  clipped to the corridor bbox. Every tile is re-encoded at 256 px
  (offline tileSize 256) to fit the 250 MB family-phone budget; native
  512 px Mapterhorn tiles average 150-180 KiB and would blow the budget.
- ocean-depth-dem: subset of the self-tiled ocean-depth package raster
  (IBCAO v5.2 + GEBCO_2026 fallback, terrarium webp 256 px, z0-10) —
  the offline ocean hillshade, restored since the pack can carry it.
- ocean-depth-vector: subset of the self-tiled ocean-depth package MVT
  (depare bands + contours clipped to the shared coastline, z0-11; z12
  renders overzoomed) — the meter-band signal: fills, contours, labels.
- coastline-land/land.pmtiles: the shared coastline mask (OSM coastline
  ∪ Mapterhorn DEM land, ODbL + CC BY 4.0) re-tiled from the full
  Greenland mask clipped to the corridor bbox.
- localities.geojson: inhabited corridor localities (settlements + towns)
  filtered from web/public/data/localities.geojson to the corridor bbox.

Prerequisite: the ocean-depth package PMTiles must be present (built by
web/scripts/build-ocean-depth.py or fetched with
scripts/fetch-ocean-depth-assets.sh) — the pack subsets them.

Usage:
  .venv/bin/python web/scripts/build-corridor-pack.py            # full build
  .venv/bin/python web/scripts/build-corridor-pack.py --measure  # sizes only

Requirements (venv): numpy, pillow, shapely. Binary: tippecanoe.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "web" / "public" / "packages" / "qaarsut-kullorsuaq"
CACHE = ROOT / ".cache" / "corridor-pack"
DEM_CACHE = CACHE / "dem"

CORRIDOR_BBOX = (-58.5, 70.4, -50.5, 74.9)  # W,S,E,N
CORRIDOR_SLUG = "qaarsut-kullorsuaq"

# The ocean-depth package (web/public/packages/ocean-depth) is the single
# source for both pack ocean archives: the self-tiled IBCAO/GEBCO raster
# and the clipped vector are subset to the corridor bbox.
OCEAN_PACKAGE = ROOT / "web" / "public" / "packages" / "ocean-depth"

# Land-relief: full-bbox pyramid z0..LAND_MAX_ZOOM, every tile re-encoded
# at 256 px (DEM_REENCODE_SIZE) so the archive is uniform and the style
# serves tileSize 256. Native Mapterhorn 512 px tiles are ~150-180 KiB on
# average and would blow the 250 MB pack budget at z10+ (measured: z10
# native alone ~161 MB). z10 is the cap — z11+ renders overzoomed, same
# policy as the coastline mask (maxzoom 13, z14 overzooms).
LAND_MAX_ZOOM = 10
DEM_REENCODE_SIZE = 256
# Ocean-depth vector: subset of the self-tiled archive z0..11 (the archive
# maxzoom; z12 renders overzoomed — the ~450 m grid adds no z12 detail).
OCEAN_MAX_ZOOM = 11
# Ocean-depth DEM raster (hillshade): subset z0..10 (archive maxzoom).
OCEAN_DEM_MAX_ZOOM = 10
# Coastline mask corridor: same flags as the full mask build.
MASK_MAX_ZOOM = 13

DEM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"

USER_AGENT = "nunat-corridor-pack-build/1.0"
FETCH_THREADS = 16

SOURCE_LABELS = {
    "land-relief": (
        "Land relief DEM © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) — "
        "Mapterhorn Terrarium tiles, Qaarsut→Kullorsuaq corridor clip"
    ),
    "ocean-depth-dem": (
        "Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open "
        "grid, Seabed 2030) — self-tiled, clipped to the shared "
        "coastline; not for navigation"
    ),
    "ocean-depth-vector": (
        "Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open "
        "grid, Seabed 2030) — self-tiled, clipped to the shared "
        "coastline; not for navigation"
    ),
    "coastline-land": (
        "© OpenStreetMap contributors (ODbL) · © Klimadatastyrelsen / "
        "Mapterhorn (CC BY 4.0) — coastline land mask"
    ),
}


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr, flush=True)


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    try:
        n = 2**z
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(lat_r := math.radians(lat))) / math.pi) / 2.0 * n)
    except (ValueError, ZeroDivisionError):
        raise ValueError(f"invalid tile coordinates for ({lon}, {lat}, z{z})")
    return x, y


def tile_bounds(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    n = 2**z
    lon0 = x / n * 360.0 - 180.0
    lon1 = (x + 1) / n * 360.0 - 180.0
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon0, lat0, lon1, lat1


def bbox_tiles(z: int) -> list[tuple[int, int]]:
    w, s, e, n = CORRIDOR_BBOX
    x0, y_north = tile_xy(w, n, z)
    x1, y_south = tile_xy(e, s, z)
    # Rows grow southward: y_north <= y_south.
    return [
        (x, y)
        for x in range(x0, x1 + 1)
        for y in range(y_north, y_south + 1)
    ]


def land_intersecting_tiles(
    clip_path: Path, z: int
) -> set[tuple[int, int]]:
    from shapely.geometry import box, shape  # type: ignore[import-not-found]
    from shapely.strtree import STRtree  # type: ignore[import-not-found]

    try:
        raw = json.loads(clip_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"Cannot read {clip_path}: {exc}") from exc
    parts = [shape(feature["geometry"]) for feature in raw["features"]]
    spatial_index = STRtree(parts)
    out: set[tuple[int, int]] = set()
    for x, y in bbox_tiles(z):
        tile_box = box(*tile_bounds(x, y, z))
        if spatial_index.query(tile_box).size > 0:
            out.add((x, y))
    return out


def fetch(url: str, dest: Path, expected_min: int = 0) -> bool:
    """Fetch one file to dest; True when a usable file is now present."""
    if dest.exists() and dest.stat().st_size > expected_min:
        return True
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for _attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                data = response.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return True
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"")
                return True
            last_error = exc
        except Exception as exc:  # noqa: BLE001 - retry transient failures
            last_error = exc
    if last_error is not None:
        eprint(f"  tile {url}: {last_error}")
    return False


def fetch_many(urls: list[tuple[str, Path]]) -> None:
    def work(item: tuple[str, Path]) -> None:
        url, dest = item
        fetch(url, dest)

    with ThreadPoolExecutor(max_workers=FETCH_THREADS) as pool:
        list(pool.map(work, urls))


def download_dem(tiles: list[tuple[int, int, int]]) -> list[Path]:
    """Fetch Mapterhorn webp tiles; 404s are cached as empty files."""
    urls: list[tuple[str, Path]] = []
    for z, x, y in tiles:
        dest = DEM_CACHE / str(z) / str(x) / f"{y}.webp"
        if not dest.exists():
            urls.append((DEM_TILE_URL.format(z=z, x=x, y=y), dest))
    if urls:
        eprint(f"fetching {len(urls)} Mapterhorn tiles …")
        fetch_many(urls)
    return [DEM_CACHE / str(z) / str(x) / f"{y}.webp" for z, x, y in tiles]


def _varint(n: int) -> bytes:  # noqa: ARG001 - kept for writer compatibility
    raise SystemExit("pmtiles writer moved to web/scripts/pmtiles_writer.py")


def _zxy_to_tileid(z: int, x: int, y: int) -> int:  # noqa: ARG001
    raise SystemExit("pmtiles writer moved to web/scripts/pmtiles_writer.py")


def _serialize_directory(merged: list[tuple[int, int, int, int]]) -> bytes:  # noqa: ARG001
    raise SystemExit("pmtiles writer moved to web/scripts/pmtiles_writer.py")


def write_pmtiles(
    tiles: dict[tuple[int, int, int], bytes],
    out: Path,
    *,
    tile_type: int,
    tile_compression: int,
    metadata: dict,
) -> None:
    """Write a clustered PMTiles v3 archive — shared writer (issue #23)."""
    from pmtiles_writer import write_pmtiles as _write  # type: ignore[import-not-found]

    _write(
        tiles,
        out,
        tile_type=tile_type,
        tile_compression=tile_compression,
        metadata=metadata,
        bbox=CORRIDOR_BBOX,
    )


def reencode_dem_256(raw: bytes) -> bytes:
    """Decode a 512px Mapterhorn terrarium webp, re-encode at 256px webp."""
    from PIL import Image  # type: ignore[import-not-found]  # venv-only dep
    import numpy as np  # type: ignore[import-not-found]  # venv-only dep

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.asarray(
        img.resize((256, 256), Image.Resampling.BILINEAR), dtype=np.float64
    )
    elev = arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0 - 32768.0
    # Standard terrarium: R*256 + G + B/256 with the +32768 bias. Mapterhorn
    # serves R=128 constant (elev = G + B/256), which this encoding reproduces.
    shifted = np.clip(elev, 0.0, 32512.0) + 32768.0
    terr = np.zeros((256, 256, 3), dtype=np.uint8)
    terr[:, :, 0] = (shifted // 256.0).astype(np.uint8)
    terr[:, :, 1] = (shifted % 256.0).astype(np.uint8)
    terr[:, :, 2] = ((shifted * 256.0) % 256.0).astype(np.uint8)
    out = io.BytesIO()
    # Lossless: lossy webp quantizes the R channel (±14) which is a
    # ±3600 m elevation error in terrarium encoding. Lossless webp keeps
    # the DEM exact at ~3 KB/tile (256 px).
    Image.fromarray(terr, "RGB").save(
        out, format="WEBP", lossless=True, method=6
    )
    return out.getvalue()


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


def build_mask(clip_path: Path) -> Path:
    """Re-tile the corridor mask clip (same flags as the full mask build)."""
    tippecanoe = shutil.which("tippecanoe")
    if not tippecanoe:
        raise SystemExit(
            "tippecanoe not found — install it (brew install tippecanoe)"
        )
    out = PACKAGE / "coastline-land" / "land.pmtiles"
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        tippecanoe,
        "-o",
        str(out),
        "-Z0",
        f"-z{MASK_MAX_ZOOM}",
        "-l",
        "land",
        "--simplify-only-low-zooms",
        "--force",
        "-pf",
        "-pk",
        str(clip_path),
    ]
    eprint("building corridor coastline mask …")
    subprocess.run(cmd, check=True)
    return out


def build_land_relief(clip_path: Path, measure_only: bool) -> Path | None:
    dem_tiles: list[tuple[int, int, int]] = []
    for z in range(0, LAND_MAX_ZOOM + 1):
        dem_tiles.extend((z, x, y) for x, y in bbox_tiles(z))
    eprint(f"land-relief tiles: bbox pyramid z0..{LAND_MAX_ZOOM} ({len(dem_tiles)} tiles)")
    paths = download_dem(dem_tiles)
    if measure_only:
        total = sum(p.stat().st_size for p in paths if p.stat().st_size)
        eprint(f"land-relief raw bytes: {total / 1e6:.1f} MB")
        return None

    tiles: dict[tuple[int, int, int], bytes] = {}
    for (z, x, y), path in zip(dem_tiles, paths):
        if path.stat().st_size == 0:
            continue
        raw = path.read_bytes()
        # Uniform 256 px tiles (tileSize 256 in the offline style): native
        # 512 px Mapterhorn tiles would blow the pack budget (measured).
        tiles[(z, x, y)] = reencode_dem_256(raw)

    out = PACKAGE / "land-relief.pmtiles"
    write_pmtiles(
        tiles,
        out,
        tile_type=4,  # webp
        tile_compression=0,
        metadata={
            "name": "Qaarsut–Kullorsuaq land relief (Mapterhorn)",
            "description": SOURCE_LABELS["land-relief"],
            "attribution": "© Klimadatastyrelsen / Mapterhorn (CC BY 4.0)",
            "minzoom": 0,
            "maxzoom": LAND_MAX_ZOOM,
            "bounds": list(CORRIDOR_BBOX),
            "center": [
                sum(CORRIDOR_BBOX[0::2]) / 2,
                sum(CORRIDOR_BBOX[1::2]) / 2,
                min(8, LAND_MAX_ZOOM),
            ],
            "format": "webp",
            "generator": "nunat build-corridor-pack.py",
        },
    )
    return out


def subset_ocean_archive(
    archive_name: str,
    out_name: str,
    z_max: int,
    measure_only: bool,
) -> Path | None:
    """Subset one ocean-depth package archive to the corridor bbox."""
    from pmtiles_writer import read_pmtiles  # type: ignore[import-not-found]

    src = OCEAN_PACKAGE / archive_name
    if not src.exists():
        raise SystemExit(
            f"Missing {src} — run web/scripts/build-ocean-depth.py or "
            "scripts/fetch-ocean-depth-assets.sh first"
        )
    eprint(f"reading {archive_name} …")
    all_tiles = read_pmtiles(src)
    w, s, e, n = CORRIDOR_BBOX
    wanted = {
        (z, x, y): body
        for (z, x, y), body in all_tiles.items()
        if z <= z_max
        and (x, y) in bbox_tiles(z)
    }
    del all_tiles
    eprint(f"{out_name}: {len(wanted)} corridor tiles")
    if measure_only:
        total = sum(len(body) for body in wanted.values())
        eprint(f"{out_name} raw bytes: {total / 1e6:.1f} MB")
        return None
    out = PACKAGE / out_name
    write_pmtiles(
        wanted,
        out,
        tile_type=1 if out_name.endswith("vector.pmtiles") else 4,
        tile_compression=2 if out_name.endswith("vector.pmtiles") else 0,
        metadata={
            "name": f"Qaarsut–Kullorsuaq {out_name} (IBCAO/GEBCO self-tiled)",
            "description": SOURCE_LABELS[
                "ocean-depth-vector" if out_name.endswith("vector.pmtiles") else "ocean-depth-dem"
            ],
            "attribution": (
                "Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback "
                "(open grid, Seabed 2030) — not for navigation"
            ),
            "minzoom": 0,
            "maxzoom": z_max,
            "bounds": list(CORRIDOR_BBOX),
            "center": [sum(CORRIDOR_BBOX[0::2]) / 2, sum(CORRIDOR_BBOX[1::2]) / 2, 6],
            "format": "pbf" if out_name.endswith("vector.pmtiles") else "webp",
            "generator": "nunat build-corridor-pack.py",
            **(
                {
                    "vector_layers": [
                        {
                            "id": "contours",
                            "fields": {
                                "depth_m": "Number",
                                "depth_abs_m": "Number",
                            },
                        },
                        {"id": "depare", "fields": {"drval1": "Number", "sys": "String"}},
                    ],
                }
                if out_name.endswith("vector.pmtiles")
                else {}
            ),
        },
    )
    return out


def build_ocean_depth(measure_only: bool) -> tuple[Path | None, Path | None]:
    """Corridor ocean archives: subsets of the self-tiled ocean package."""
    vector = subset_ocean_archive(
        "ocean-depth-vector.pmtiles",
        "ocean-depth-vector.pmtiles",
        OCEAN_MAX_ZOOM,
        measure_only,
    )
    dem = subset_ocean_archive(
        "ocean-depth-dem.pmtiles",
        "ocean-depth-dem.pmtiles",
        OCEAN_DEM_MAX_ZOOM,
        measure_only,
    )
    return vector, dem


def build_clip() -> Path:
    from shapely.geometry import box, mapping, shape  # type: ignore[import-not-found]
    from shapely.ops import unary_union  # type: ignore[import-not-found]

    src = CACHE / "land.geojson"
    if not src.exists():
        raise SystemExit(
            f"Missing {src} — run: bash scripts/fetch-coastline-mask-assets.sh "
            "(or fetch the coastline-land release land.geojson)"
        )
    try:
        raw = json.loads(src.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"Cannot read {src}: {exc}") from exc
    bbox_poly = box(*CORRIDOR_BBOX)
    parts = []
    for feature in raw["features"]:
        geom = shape(feature["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        clipped = geom.intersection(bbox_poly)
        if clipped.is_empty:
            continue
        parts.append(clipped)
    if not parts:
        raise SystemExit("No land polygons intersect the corridor bbox")
    merged = unary_union(parts)
    feature = {
        "type": "Feature",
        "properties": {
            "source": "OpenStreetMap coastline land polygons ∪ Mapterhorn DEM land",
            "licence": "ODbL + CC BY 4.0",
            "safety": "not-for-navigation",
        },
        "geometry": mapping(merged),
    }
    out = CACHE / "corridor-land.geojson"
    out.write_text(
        json.dumps({"type": "FeatureCollection", "features": [feature]}),
        encoding="utf-8",
    )
    return out


def write_attribution() -> None:
    text = f"""# Qaarsut–Kullorsuaq corridor offline pack — attribution

The corridor pack serves the same tile sources as the online terrain-first
map, clipped to the corridor bbox ({CORRIDOR_BBOX[0]}, {CORRIDOR_BBOX[1]},
{CORRIDOR_BBOX[2]}, {CORRIDOR_BBOX[3]} W,S,E,N). Not for navigation.

## Sources

- Land relief (`land-relief.pmtiles`): Mapterhorn Terrarium tiles,
  <https://tiles.mapterhorn.com/> — Klimadatastyrelsen Greenland DEM,
  CC BY 4.0 (<https://mapterhorn.com/attribution>).
  z0–z{LAND_MAX_ZOOM}, every tile re-encoded at {DEM_REENCODE_SIZE} px
  (offline tileSize {DEM_REENCODE_SIZE}); z11+ renders overzoomed. The archive
  is the same data the online style serves.
- Ocean depth vector (`ocean-depth-vector.pmtiles`): self-tiled from the
  IBCAO v5.2 (2026) 400 m grid with GEBCO_2026 fallback (15 arc-sec) —
  depth band polygons (`depare`) + contour lines, clipped to the shared
  coastline (OSM ∪ Mapterhorn DEM land) before tiling, z0–z{OCEAN_MAX_ZOOM}
  (z12+ renders overzoomed). See packages/ocean-depth/ATTRIBUTION.md.
- Ocean hillshade raster (`ocean-depth-dem.pmtiles`): the same self-tiled
  depth grid as terrarium webp 256 px, z0–z{OCEAN_DEM_MAX_ZOOM} (z11+
  renders overzoomed) — the offline ocean hillshade, restored since the
  pack can carry it.
- Coastline mask (`coastline-land/land.pmtiles`): OpenStreetMap land
  polygons (full coastline, ODbL) unioned with Mapterhorn DEM land
  (Klimadatastyrelsen, CC BY 4.0) — the shared V1 interim shoreline used
  by the display mask and the bathymetry clip. Derived mask published
  under ODbL share-alike.
- Localities (`localities.geojson`): NunaGIS PlacenamesRegister midpoint
  layer (Type 21/23) via the web data release — see data/source/ provenance.

## Attribution (required, shown in the map)

> © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) ·
> Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid, Seabed 2030) ·
> © OpenStreetMap contributors (ODbL)

## Redistribution terms

- ODbL 1.0 (<https://opendatacommons.org/licenses/odbl/>) applies to the
  OSM-derived mask and to any bathymetry clipped to this coastline;
  the DEM-derived portion keeps CC BY 4.0.
- CC BY 4.0 applies to the Mapterhorn DEM tiles in land-relief.pmtiles.
- The IBCAO/GEBCO depth grids are open data; derived products must
  acknowledge IBCAO/GEBCO Compilation Group.
- Not for navigation: display context and cartographic repair only; no
  safety-of-life claims.
"""
    (PACKAGE / "ATTRIBUTION.md").write_text(text, encoding="utf-8")


def write_manifest(
    files: dict[str, Path],
    notes: str,
) -> None:
    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    package_id = f"corridor_qaarsut_kullorsuaq_{created[:10]}"
    rows = []
    total = 0
    for path, file in files.items():
        size, sha = sha256_file(file)
        total += size
        rows.append({"path": path, "bytes": size, "sha256": sha})
    manifest = {
        "id": package_id,
        "slug": CORRIDOR_SLUG,
        "title": {"kl": "Qaarsut–Kullorsuaq", "da": "Qaarsut–Kullorsuaq", "en": "Qaarsut–Kullorsuaq"},
        "bbox": list(CORRIDOR_BBOX),
        "bytes": total,
        "createdAt": created,
        "kind": "full",
        "files": rows,
        "storage": {
            "opfs": [row["path"] for row in rows],
            "cache": ["manifest.json"],
        },
        "notForNavigation": True,
        "notes": notes,
    }
    (PACKAGE / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    eprint(f"pack total: {total / 1e6:.1f} MB (cap 250 MB)")
    eprint(f"manifest: {PACKAGE / 'manifest.json'}")
    for row in rows:
        eprint(f"  {row['path']}: {row['bytes'] / 1e6:.1f} MB")


def build_localities() -> Path:
    """Corridor localities: inhabited places inside CORRIDOR_BBOX.

    Source: web/public/data/localities.geojson (the fetch:placenames
    localities export). A kind=full pack must carry its corridor's
    localities — an empty file is a build error, not a valid pack.
    """
    src = ROOT / "web" / "public" / "data" / "localities.geojson"
    if not src.exists():
        raise SystemExit(
            f"Missing {src} — run: pnpm --dir web fetch:localities"
        )
    try:
        raw = json.loads(src.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"Cannot read {src}: {exc}") from exc

    w, s, e, n = CORRIDOR_BBOX
    inside = []
    for feature in raw.get("features", []):
        coords = (feature.get("geometry") or {}).get("coordinates")
        if not coords or len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        if w <= lon <= e and s <= lat <= n:
            inside.append(feature)
    if not inside:
        raise SystemExit(
            "No corridor localities found — refusing an empty localities file"
        )
    out = PACKAGE / "localities.geojson"
    out.write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": inside},
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    eprint(f"corridor localities: {len(inside)} features -> {out.name}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--measure",
        action="store_true",
        help="download tiles and print sizes only; do not build archives",
    )
    args = parser.parse_args()

    if args.measure:
        clip = build_clip()
        build_land_relief(clip, measure_only=True)
        build_ocean_depth(measure_only=True)
        return

    PACKAGE.mkdir(parents=True, exist_ok=True)
    clip = build_clip()
    land = build_land_relief(clip, measure_only=False)
    ocean_vector, ocean_dem = build_ocean_depth(measure_only=False)
    mask = build_mask(clip)
    localities = build_localities()

    write_attribution()
    if land is None or ocean_vector is None or ocean_dem is None:
        raise SystemExit("build failed")
    write_manifest(
        {
            "land-relief.pmtiles": land,
            "ocean-depth-vector.pmtiles": ocean_vector,
            "ocean-depth-dem.pmtiles": ocean_dem,
            "coastline-land/land.pmtiles": mask,
            "localities.geojson": localities,
        },
        (
            "Full Qaarsut→Kullorsuaq corridor pack. Land relief (Mapterhorn "
            f"DEM, CC BY 4.0) z0–z{LAND_MAX_ZOOM}, every tile re-encoded at "
            f"{DEM_REENCODE_SIZE} px (tileSize {DEM_REENCODE_SIZE} offline; "
            "z11+ renders overzoomed), ocean depth (self-tiled IBCAO v5.2 + "
            f"GEBCO_2026 fallback, clipped to the shared coastline) z0–z{OCEAN_MAX_ZOOM} "
            "vector (z12 renders overzoomed) + ocean hillshade raster "
            f"z0–z{OCEAN_DEM_MAX_ZOOM} (z11+ overzooms), coastline mask "
            f"(OSM ∪ DEM, ODbL + CC BY 4.0) z0–z{MASK_MAX_ZOOM}, localities. "
            "Offline serves the ocean hillshade raster again (the pack "
            "carries it). Tiles beyond the pack bbox are absent — no live "
            "network fallback. Not for navigation."
        ),
    )


if __name__ == "__main__":
    main()
