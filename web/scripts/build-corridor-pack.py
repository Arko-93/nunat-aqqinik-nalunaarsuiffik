#!/usr/bin/env python3
"""Build the full Qaarsut→Kullorsuaq corridor offline pack.

Creates web/public/packages/qaarsut-kullorsuaq/{land-relief.pmtiles,
ocean-depth.pmtiles, coastline-land/land.pmtiles, localities.geojson,
manifest.json, ATTRIBUTION.md}.

Sources (all already live in the online map):
- land-relief: Mapterhorn Terrarium webp tiles (Klimadatastyrelsen
  Greenland DEM, CC BY 4.0) — the exact tiles the online style serves,
  clipped to the corridor bbox. Every tile is re-encoded at 256 px
  (offline tileSize 256) to fit the 250 MB family-phone budget; native
  512 px Mapterhorn tiles average 150-180 KiB and would blow the budget.
- ocean-depth: Open Waters Seascape vector tiles (GEBCO mosaic, © Open
  Waters) — contours + depare + soundings, the meter-band signal. The
  online raster hillshade layer is not part of the pack (see manifest
  notes); depth fills/contours/labels all come from the vector source.
- coastline-land/land.pmtiles: the shared coastline mask (OSM coastline
  ∪ Mapterhorn DEM land, ODbL + CC BY 4.0) re-tiled from the full
  Greenland mask clipped to the corridor bbox.
- localities.geojson: inhabited corridor localities (settlements + towns)
  filtered from web/public/data/localities.geojson to the corridor bbox.

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
SEA_CACHE = CACHE / "seascape"

CORRIDOR_BBOX = (-58.5, 70.4, -50.5, 74.9)  # W,S,E,N
CORRIDOR_SLUG = "qaarsut-kullorsuaq"

# Land-relief: full-bbox pyramid z0..LAND_MAX_ZOOM, every tile re-encoded
# at 256 px (DEM_REENCODE_SIZE) so the archive is uniform and the style
# serves tileSize 256. Native Mapterhorn 512 px tiles are ~150-180 KiB on
# average and would blow the 250 MB pack budget at z10+ (measured: z10
# native alone ~161 MB). z10 is the cap — z11+ renders overzoomed, same
# policy as the coastline mask (maxzoom 13, z14 overzooms).
LAND_MAX_ZOOM = 10
DEM_REENCODE_SIZE = 256
# Ocean-depth: full-bbox pyramid up to OCEAN_MAX_ZOOM (Seascape MVT,
# ~45 MB total measured for z0-z12).
OCEAN_MAX_ZOOM = 12
# Coastline mask corridor: same flags as the full mask build.
MASK_MAX_ZOOM = 13

DEM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"
SEASCAPE_TILE_URL = "https://tiles.openwaters.io/seascape/{z}/{x}/{y}.pbf"

USER_AGENT = "nunat-corridor-pack-build/1.0"
FETCH_THREADS = 16

SOURCE_LABELS = {
    "land-relief": (
        "Land relief DEM © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) — "
        "Mapterhorn Terrarium tiles, Qaarsut→Kullorsuaq corridor clip"
    ),
    "ocean-depth": (
        "Ocean depth © Open Waters (open-grid GEBCO mosaic, interim) — "
        "not for navigation"
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


def download_seascape(z_max: int) -> list[tuple[int, int, int]]:
    tiles = [
        (z, x, y)
        for z in range(0, z_max + 1)
        for x, y in bbox_tiles(z)
    ]
    urls: list[tuple[str, Path]] = []
    for z, x, y in tiles:
        dest = SEA_CACHE / str(z) / str(x) / f"{y}.pbf"
        if not dest.exists():
            urls.append((SEASCAPE_TILE_URL.format(z=z, x=x, y=y), dest))
    if urls:
        eprint(f"fetching {len(urls)} Seascape tiles …")
        fetch_many(urls)
    return tiles


# --------------------------------------------------------------------------
# PMTiles v3 writer (subset): clustered archives, no leaf directories.
# --------------------------------------------------------------------------

def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _zxy_to_tileid(z: int, x: int, y: int) -> int:
    """Hilbert-style curve used by PMTiles (port of the reference writer)."""
    acc = ((1 << z) * (1 << z) - 1) // 3
    n = z - 1
    while n >= 0:
        a = 1 << n
        c = x & a
        u = y & a
        acc += (3 * c ^ u) * a
        if u == 0:
            if c != 0:
                x = a - 1 - x
                y = a - 1 - y
            x, y = y, x
        n -= 1
    return acc


def _serialize_directory(merged: list[tuple[int, int, int, int]]) -> bytes:
    """Serialize one directory: entry count + column-major arrays.

    Entries are (tileId, offset, length, run). Length is the real byte
    length; run is the real run length (1 = single tile). Leaf-pointer
    entries carry run=0 (tileId = first tile of the leaf).
    """
    out = bytearray()
    out += _varint(len(merged))
    for index, (tile_id, _offset, _length, _run) in enumerate(merged):
        if index == 0:
            out += _varint(tile_id)
        else:
            out += _varint(tile_id - merged[index - 1][0])
    for _tile_id, _offset, _length, run in merged:
        out += _varint(run)
    for _tile_id, _offset, length, _run in merged:
        out += _varint(length)
    for index, (tile_id, offset, length, _run) in enumerate(merged):
        del tile_id
        if index > 0 and offset == merged[index - 1][1] + merged[index - 1][2]:
            out += _varint(0)
        else:
            out += _varint(offset + 1)
    return bytes(out)


def write_pmtiles(
    tiles: dict[tuple[int, int, int], bytes],
    out: Path,
    *,
    tile_type: int,
    tile_compression: int,
    metadata: dict,
) -> None:
    """Write a clustered PMTiles v3 archive with content dedup.

    tile_type: 1=mvt, 2=png, 3=jpeg, 4=webp. tile_compression: 0=none, 2=gzip.
    The root directory stays small enough to fit the reader's first-16 KB
    fetch; larger entry sets spill into leaf directories (run=0 pointers).
    """
    entries: list[tuple[int, int, int]] = []  # (tileId, offset, length)
    content_offsets: dict[bytes, tuple[int, int]] = {}
    tile_data = bytearray()
    minz = min(z for z, _, _ in tiles)
    maxz = max(z for z, _, _ in tiles)

    for key in sorted(tiles, key=lambda k: _zxy_to_tileid(*k)):
        z, x, y = key
        data = tiles[key]
        if data in content_offsets:
            offset, length = content_offsets[data]
        else:
            offset = len(tile_data)
            length = len(data)
            tile_data.extend(data)
            content_offsets[data] = (offset, length)
        entries.append((_zxy_to_tileid(z, x, y), offset, length))

    # Merge adjacent entries with identical content into runs.
    merged: list[tuple[int, int, int, int]] = []
    for tile_id, offset, length in entries:
        if (
            merged
            and merged[-1][1] == offset
            and merged[-1][2] == length
            and tile_id == merged[-1][0] + merged[-1][3]
        ):
            prev = merged[-1]
            merged[-1] = (prev[0], prev[1], prev[2], prev[3] + 1)
        else:
            merged.append((tile_id, offset, length, 1))

    import gzip

    # Spill into leaf directories: the JS reader loads the root from the
    # first 16 KB of the file, so the compressed root must stay small.
    ROOT_MAX_BYTES = 12000
    LEAF_TARGET_BYTES = 10000

    def raw_size(chunk: list[tuple[int, int, int, int]]) -> int:
        size = 1  # entry count varint
        prev_id = None
        prev_off = None
        prev_len = None
        for tile_id, offset, length, run in chunk:
            size += 1 + (4 if prev_id is None else max(1, (tile_id - prev_id).bit_length() // 7 + 1))
            size += max(1, run.bit_length() // 7 + 1)
            size += max(1, length.bit_length() // 7 + 1)
            if prev_off is not None and prev_len is not None and offset == prev_off + prev_len:
                size += 1
            else:
                size += max(1, (offset + 1).bit_length() // 7 + 1)
            prev_id, prev_off, prev_len = tile_id, offset, length
        return size

    leaves: list[list[tuple[int, int, int, int]]] = []
    if len(merged) == 0:
        leaves = []
    elif raw_size(merged) <= ROOT_MAX_BYTES:
        leaves = [merged]
    else:
        current: list[tuple[int, int, int, int]] = []
        for entry in merged:
            current.append(entry)
            if raw_size(current) >= LEAF_TARGET_BYTES:
                leaves.append(current)
                current = []
        if current:
            leaves.append(current)

    leaf_section = bytearray()
    # Serialize leaves (all but the last chunk if it can live in the root).
    root_chunk: list[tuple[int, int, int, int]]
    if len(leaves) == 1:
        root_chunk = leaves[0]
    else:
        root_chunk = []
        for chunk in leaves:
            raw = _serialize_directory(chunk)
            offset = len(leaf_section)
            leaf_section.extend(gzip.compress(raw))
            root_chunk.append((chunk[0][0], offset, len(leaf_section) - offset, 0))

    root = gzip.compress(_serialize_directory(root_chunk))
    meta = gzip.compress(json.dumps(metadata, separators=(",", ":")).encode("utf-8"))

    w, s, e, n = CORRIDOR_BBOX
    header = bytearray(127)
    header[0:7] = b"PMTiles"
    header[7] = 3  # specVersion
    header[96] = 1  # clustered
    header[97] = 2  # internalCompression: gzip
    header[98] = tile_compression
    header[99] = tile_type
    header[100] = minz
    header[101] = maxz

    leaf_offset = 127 + len(root) + len(meta)

    def put_u64(offset: int, value: int) -> None:
        header[offset : offset + 8] = value.to_bytes(8, "little")

    def put_i32(offset: int, value: float) -> None:
        if not math.isfinite(value):
            raise ValueError(f"non-finite bbox coordinate: {value}")
        scaled = math.floor(value * 1e7)
        clamped = max(-2147483648, min(2147483647, scaled))
        header[offset : offset + 4] = clamped.to_bytes(4, "little", signed=True)

    put_u64(8, 127)  # rootDirectoryOffset
    put_u64(16, len(root))
    put_u64(24, 127 + len(root))
    put_u64(32, len(meta))
    put_u64(40, leaf_offset)
    put_u64(48, len(leaf_section))
    put_u64(56, leaf_offset + len(leaf_section))
    put_u64(64, len(tile_data))
    put_u64(72, sum(run for _, _, _, run in merged))
    put_u64(80, len(merged) + (len(leaves) - 1 if len(leaves) > 1 else 0))
    put_u64(88, len(content_offsets))
    put_i32(102, w)
    put_i32(106, s)
    put_i32(110, e)
    put_i32(114, n)
    header[118] = min(14, minz + 3)
    center_lon = (w + e) / 2.0
    center_lat = (s + n) / 2.0
    put_i32(119, center_lon)
    put_i32(123, center_lat)

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as handle:
        handle.write(header)
        handle.write(root)
        handle.write(meta)
        handle.write(leaf_section)
        handle.write(tile_data)


# --------------------------------------------------------------------------

def reencode_dem_256(raw: bytes) -> bytes:
    """Decode a 512px Mapterhorn terrarium webp, re-encode at 256px webp."""
    from PIL import Image  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]

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


def build_ocean_depth(measure_only: bool) -> Path | None:
    tiles_list = download_seascape(OCEAN_MAX_ZOOM)
    if measure_only:
        total = sum(
            (SEA_CACHE / str(z) / str(x) / f"{y}.pbf").stat().st_size
            for z, x, y in tiles_list
            if (SEA_CACHE / str(z) / str(x) / f"{y}.pbf").exists()
        )
        eprint(f"ocean-depth raw bytes: {total / 1e6:.1f} MB")
        return None

    tiles: dict[tuple[int, int, int], bytes] = {}
    for z, x, y in tiles_list:
        path = SEA_CACHE / str(z) / str(x) / f"{y}.pbf"
        if path.stat().st_size == 0:
            continue
        raw = path.read_bytes()
        # Seascape serves raw MVT bodies; the canonical PMTiles format
        # stores MVT gzip-compressed (tileCompression=2 in the header).
        import gzip

        tiles[(z, x, y)] = gzip.compress(raw, compresslevel=6)

    out = PACKAGE / "ocean-depth.pmtiles"
    write_pmtiles(
        tiles,
        out,
        tile_type=1,  # mvt
        tile_compression=2,  # gzip (Seascape .pbf bodies are gzipped MVT)
        metadata={
            "name": "Qaarsut–Kullorsuaq ocean depth (Open Waters Seascape)",
            "description": SOURCE_LABELS["ocean-depth"],
            "attribution": "© Open Waters (open-grid GEBCO mosaic, interim) — not for navigation",
            "minzoom": 0,
            "maxzoom": OCEAN_MAX_ZOOM,
            "bounds": list(CORRIDOR_BBOX),
            "center": [sum(CORRIDOR_BBOX[0::2]) / 2, sum(CORRIDOR_BBOX[1::2]) / 2, 6],
            "format": "pbf",
            "generator": "nunat build-corridor-pack.py",
            "vector_layers": [
                {
                    "id": "contours",
                    "fields": {
                        "depth_m": "Number",
                        "depth_abs_m": "Number",
                        "sys": "String",
                        "depth_ft": "Number",
                        "depth_fm": "Number",
                    },
                },
                {"id": "soundings", "fields": {"depth_m": "Number", "depth_ft": "Number", "depth_fm": "Number"}},
                {"id": "depare", "fields": {"drval1": "Number", "drval2": "Number", "sys": "String", "rank": "Number"}},
            ],
        },
    )
    return out


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
- Ocean depth (`ocean-depth.pmtiles`): Open Waters Seascape vector tiles,
  <https://tiles.openwaters.io/seascape/> — open-grid GEBCO mosaic,
  interim product, © Open Waters (<https://openwaters.io/charts/seascape#license>).
  Not for navigation; not a chart.
- Coastline mask (`coastline-land/land.pmtiles`): OpenStreetMap land
  polygons (full coastline, ODbL) unioned with Mapterhorn DEM land
  (Klimadatastyrelsen, CC BY 4.0) — the shared V1 interim shoreline used
  by the display mask. Derived mask published under ODbL share-alike.
- Localities (`localities.geojson`): NunaGIS PlacenamesRegister midpoint
  layer (Type 21/23) via the web data release — see data/source/ provenance.

## Attribution (required, shown in the map)

> © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) · © Open Waters ·
> © OpenStreetMap contributors (ODbL)

## Redistribution terms

- ODbL 1.0 (<https://opendatacommons.org/licenses/odbl/>) applies to the
  OSM-derived mask and to any bathymetry clipped to this coastline;
  the DEM-derived portion keeps CC BY 4.0.
- CC BY 4.0 applies to the Mapterhorn DEM tiles in land-relief.pmtiles.
- The Seascape open-grid depth data carries Open Waters' licence terms.
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
    ocean = build_ocean_depth(measure_only=False)
    mask = build_mask(clip)
    localities = build_localities()

    write_attribution()
    if land is None or ocean is None:
        raise SystemExit("build failed")
    write_manifest(
        {
            "land-relief.pmtiles": land,
            "ocean-depth.pmtiles": ocean,
            "coastline-land/land.pmtiles": mask,
            "localities.geojson": localities,
        },
        (
            "Full Qaarsut→Kullorsuaq corridor pack. Land relief (Mapterhorn "
            f"DEM, CC BY 4.0) z0–z{LAND_MAX_ZOOM}, every tile re-encoded at "
            f"{DEM_REENCODE_SIZE} px (tileSize {DEM_REENCODE_SIZE} offline; "
            "z11+ renders overzoomed), ocean depth (Open Waters Seascape "
            f"open-grid MVT, interim) z0–z{OCEAN_MAX_ZOOM}, coastline mask "
            f"(OSM ∪ DEM, ODbL + CC BY 4.0) z0–z{MASK_MAX_ZOOM}, localities. "
            "Offline the ocean hillshade raster layer is not served (the "
            "pack carries the vector depth source: fills, contours, labels). "
            "Tiles beyond the pack bbox are absent — no live network "
            "fallback. Not for navigation."
        ),
    )


if __name__ == "__main__":
    main()
