#!/usr/bin/env python3
"""Build the peaks-only land color-relief package (issue #24).

Creates web/public/packages/land-peaks/:
- land-peaks.pmtiles   RGBA webp color-relief raster (256 px, z0-10)
- manifest.json, ATTRIBUTION.md

Source: the same Mapterhorn Terrarium webp tiles the land hillshade uses
(Klimadatastyrelsen Greenland DEM, CC BY 4.0) — the bands cannot drift
from the relief they sit on. Elevation below 500 m is transparent;
500-1000 / 1000-2000 / 2000+ m use landPeakBandColor from
web/src/map/meter-bands.ts (the style's breaks are the same numbers).

Peaks-only policy: tiles whose every pixel is below 500 m are omitted
entirely, so coastal lowland (and open ocean, which Mapterhorn 404s or
serves as nodata) never enters the archive — a full-country wash is
explicitly avoided. z0-z10, every tile re-encoded at 256 px (the style
serves tileSize 256; z11+ renders overzoomed, same policy as the
corridor land-relief). Lossless webp keeps band edges exact.

Usage:
  .venv/bin/python web/scripts/build-land-peaks.py            # full build
  .venv/bin/python web/scripts/build-land-peaks.py --measure  # sizes only

Requirements (venv): numpy, pillow. (No gdal/tippecanoe needed.)
Publish: bash scripts/publish-land-peaks-assets.sh
Fetch:   bash scripts/fetch-land-peaks-assets.sh
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np  # type: ignore[import-not-found]  # venv-only dep
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "web" / "public" / "packages" / "land-peaks"
CACHE = ROOT / ".cache" / "land-peaks"
DEM_CACHE = CACHE / "dem"

GREENLAND_BBOX = (-75.0, 59.5, -10.0, 84.0)  # W,S,E,N (same as ocean-depth)

# Same breaks the style renders (web/src/map/meter-bands.ts LAND_BREAKS_M).
LAND_BREAKS_M = [500, 1000, 2000]

# z10 cap: same policy as the corridor land-relief — z11+ overzooms.
LAND_PEAKS_MAX_ZOOM = 10
TILE_PX = 256  # re-encoded from native 512 px Mapterhorn tiles

# landPeakBandColor() from meter-bands.ts, baked into the raster.
# Keys are (low, high) half-open elevation bands; the last is +inf.
# Peaks-only: the first band starts at LAND_BREAKS_M[0] — elevations
# below 500 m are never colored (RGBA stays alpha 0), so a mixed tile
# keeps its lowland pixels transparent instead of washing them.
BAND_COLORS: list[tuple[tuple[float, float], tuple[int, int, int]]] = [
    ((500, 1000), (138, 122, 92)),  # [500, 1000) -> #8a7a5c
    ((1000, 2000), (107, 94, 74)),  # [1000, 2000) -> #6b5e4a
    ((2000, math.inf), (74, 70, 63)),  # >=2000 -> #4a463f
]

DEM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"

# Pyramid pre-filter level: z7 parents are fetched for every bbox tile;
# deeper zooms only fetch children of parents that contain >= 500 m
# elevation. Ocean and coastal-lowland subtrees are never fetched — the
# peaks-only archive skips them anyway, and this cuts the fetch count
# from the full ~67k-tile bbox pyramid to the land-above-500 m core.
FILTER_ZOOM = 7

USER_AGENT = "nunat-land-peaks-build/1.0"
FETCH_THREADS = 16
ENCODE_THREADS = 8


def _decode_elev(raw: bytes) -> np.ndarray:
    """512px Mapterhorn terrarium webp -> float64 elevation array."""
    from PIL import Image  # type: ignore[import-not-found]  # venv-only dep

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.asarray(img, dtype=np.float64)
    return (
        arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0 - 32768.0
    )


def _tile_children(z: int, x: int, y: int, target_z: int) -> list[tuple[int, int, int]]:
    """All (z, x, y) tiles at target_z under the (z, x, y) parent."""
    factor = 2 ** (target_z - z)
    out = []
    for cx in range(x * factor, (x + 1) * factor):
        for cy in range(y * factor, (y + 1) * factor):
            out.append((target_z, cx, cy))
    return out


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr, flush=True)


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    try:
        n = 2**z
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    except (ValueError, ZeroDivisionError):
        raise ValueError(f"invalid tile coordinates for ({lon}, {lat}, z{z})")
    return x, y


def bbox_tiles(z: int) -> list[tuple[int, int]]:
    w, s, e, n = GREENLAND_BBOX
    x0, y_north = tile_xy(w, n, z)
    x1, y_south = tile_xy(e, s, z)
    # Rows grow southward: y_north <= y_south.
    return [
        (x, y)
        for x in range(x0, x1 + 1)
        for y in range(y_north, y_south + 1)
    ]


def fetch(url: str, dest: Path) -> None:
    """Fetch one file to dest; 404s are cached as empty files."""
    if dest.exists():
        return
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for _attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                data = response.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(b"")
                return
            last_error = exc
        except Exception as exc:  # noqa: BLE001 - retry transient failures
            last_error = exc
    if last_error is not None:
        eprint(f"  tile {url}: {last_error}")


def download_dem(tiles: list[tuple[int, int, int]]) -> list[Path]:
    """Fetch Mapterhorn webp tiles; 404s are cached as empty files."""
    urls: list[tuple[str, Path]] = []
    for z, x, y in tiles:
        dest = DEM_CACHE / str(z) / str(x) / f"{y}.webp"
        if not dest.exists():
            urls.append((DEM_TILE_URL.format(z=z, x=x, y=y), dest))
    if urls:
        eprint(f"fetching {len(urls)} Mapterhorn tiles …")
        with ThreadPoolExecutor(max_workers=FETCH_THREADS) as pool:
            list(pool.map(lambda item: fetch(*item), urls))
    return [DEM_CACHE / str(z) / str(x) / f"{y}.webp" for z, x, y in tiles]


def peaks_webp(raw: bytes) -> bytes | None:
    """512px Mapterhorn terrarium webp -> 256px RGBA band webp (or None).

    Returns None when every pixel is below 500 m (peaks-only: such tiles
    are omitted from the archive). Mapterhorn serves R=128 constant, so
    elev_m = G + B/256; the standard terrarium formula reproduces this.
    """
    from PIL import Image  # type: ignore[import-not-found]  # venv-only dep

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.asarray(
        img.resize((TILE_PX, TILE_PX), Image.Resampling.BILINEAR),
        dtype=np.float64,
    )
    elev = arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0 - 32768.0
    if elev.max() < LAND_BREAKS_M[0]:
        return None

    rgba = np.zeros((TILE_PX, TILE_PX, 4), dtype=np.uint8)
    for (low, high), color in BAND_COLORS:
        mask = (elev >= low) & (elev < high)
        rgba[mask, 0:3] = color
        rgba[mask, 3] = 255
    # Elevations below 500 m (and nodata) stay transparent — peaks-only:
    # the first band starts at LAND_BREAKS_M[0], so lowland pixels inside
    # a mixed tile never get a wash color.

    out = io.BytesIO()
    # Lossless: keeps band edges exact (lossy webp blurs the discrete
    # breaks and can tint transparent pixels).
    Image.fromarray(rgba, "RGBA").save(
        out, format="WEBP", lossless=True, method=6
    )
    return out.getvalue()


def build_peaks(measure_only: bool) -> Path | None:
    # Fetch z0..FILTER_ZOOM over the whole bbox (tiny), then walk deeper
    # only under parents that contain >= 500 m (peaks-only pyramid).
    dem_tiles: list[tuple[int, int, int]] = []
    for z in range(0, FILTER_ZOOM + 1):
        dem_tiles.extend((z, x, y) for x, y in bbox_tiles(z))
    eprint(
        f"land-peaks tiles: filter pyramid z0..{FILTER_ZOOM} "
        f"({len(dem_tiles)} tiles) + children of >=500 m parents"
    )
    paths = download_dem(dem_tiles)

    # Parents with max elevation >= 500 m keep their children.
    kept: set[tuple[int, int]] = set()
    for (z, x, y), path in zip(dem_tiles, paths):
        if z < FILTER_ZOOM or path.stat().st_size == 0:
            continue
        if _decode_elev(path.read_bytes()).max() >= LAND_BREAKS_M[0]:
            kept.add((x, y))
    eprint(f"filter: {len(kept)}/{len(bbox_tiles(FILTER_ZOOM))} z{FILTER_ZOOM} parents >= 500 m")

    if measure_only:
        for z in range(FILTER_ZOOM + 1, LAND_PEAKS_MAX_ZOOM + 1):
            children: list[tuple[int, int, int]] = []
            for x, y in kept:
                children.extend(_tile_children(FILTER_ZOOM, x, y, z))
            paths.extend(download_dem(children))
        total = sum(p.stat().st_size for p in paths if p.stat().st_size)
        eprint(f"land-peaks raw bytes: {total / 1e6:.1f} MB")
        return None

    # Deep zooms: only children of kept parents. Parent tiles are decoded
    # for the filter anyway, so encode them too.
    all_tiles = [(key, path) for key, path in zip(dem_tiles, paths)]
    for z in range(FILTER_ZOOM + 1, LAND_PEAKS_MAX_ZOOM + 1):
        children: list[tuple[int, int, int]] = []
        for x, y in kept:
            children.extend(_tile_children(FILTER_ZOOM, x, y, z))
        eprint(f"land-peaks zoom {z}: {len(children)} candidate children")
        paths = download_dem(children)
        all_tiles.extend((key, path) for key, path in zip(children, paths))

    tiles: dict[tuple[int, int, int], bytes] = {}
    skipped = 0
    to_encode = [
        (key, path) for key, path in all_tiles if path.stat().st_size
    ]
    eprint(f"encoding {len(to_encode)} non-empty tiles …")

    def work(item: tuple[tuple[int, int, int], Path]) -> bytes | None:
        key, path = item
        raw = path.read_bytes()
        return peaks_webp(raw)

    with ThreadPoolExecutor(max_workers=ENCODE_THREADS) as pool:
        results = list(pool.map(work, to_encode))
    for key, result in zip((k for k, _ in to_encode), results):
        if result is None:
            skipped += 1
        else:
            tiles[key] = result
    eprint(f"peak tiles: {len(tiles)} (skipped {skipped} below 500 m)")

    out = OUT_DIR / "land-peaks.pmtiles"
    write_pmtiles(
        tiles,
        out,
        tile_type=4,  # webp
        tile_compression=0,
        metadata={
            "name": "Greenland land peak color bands (Mapterhorn)",
            "description": (
                "Peaks-only color relief: transparent below 500 m, discrete "
                f"bands at {LAND_BREAKS_M[0]}/{LAND_BREAKS_M[1]}/{LAND_BREAKS_M[2]} m "
                "(web/src/map/meter-bands.ts LAND_BREAKS_M). Same Mapterhorn "
                "DEM as the land hillshade (CC BY 4.0). z11+ renders "
                "overzoomed."
            ),
            "attribution": "© Klimadatastyrelsen / Mapterhorn (CC BY 4.0)",
            "minzoom": 0,
            "maxzoom": LAND_PEAKS_MAX_ZOOM,
            "bounds": list(GREENLAND_BBOX),
            "center": [
                sum(GREENLAND_BBOX[0::2]) / 2,
                sum(GREENLAND_BBOX[1::2]) / 2,
                min(8, LAND_PEAKS_MAX_ZOOM),
            ],
            "format": "webp",
            "generator": "nunat build-land-peaks.py",
        },
    )
    return out


def write_pmtiles(
    tiles: dict[tuple[int, int, int], bytes],
    out: Path,
    *,
    tile_type: int,
    tile_compression: int,
    metadata: dict,
) -> None:
    """Write a clustered PMTiles v3 archive — shared writer (issue #23)."""
    sys.path.insert(0, str(ROOT / "web" / "scripts"))
    from pmtiles_writer import write_pmtiles as _write  # type: ignore[import-not-found]

    _write(
        tiles,
        out,
        tile_type=tile_type,
        tile_compression=tile_compression,
        metadata=metadata,
        bbox=GREENLAND_BBOX,
    )


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


def write_attribution() -> None:
    text = f"""# Land peak color bands — attribution

The peaks-only color-relief raster (`land-peaks.pmtiles`) is derived from
the Mapterhorn Terrarium tiles, <https://tiles.mapterhorn.com/> —
Klimadatastyrelsen Greenland DEM, CC BY 4.0
(<https://mapterhorn.com/attribution>).

- Same source as the land hillshade the style serves: the bands sit on
  the relief they were cut from, so they cannot drift (issue #24).
- Elevation below 500 m is transparent (peaks-only — never a full land
  wash); discrete bands at {LAND_BREAKS_M[0]} / {LAND_BREAKS_M[1]} /
  {LAND_BREAKS_M[2]} m use the product colors in
  web/src/map/meter-bands.ts (`landPeakBandColor`).
- z0–z{LAND_PEAKS_MAX_ZOOM}, 256 px lossless webp; z11+ renders
  overzoomed (same policy as the corridor land-relief).

## Redistribution terms

- CC BY 4.0 applies to the Mapterhorn DEM tiles this raster is derived
  from.
- Not for navigation: display context only; no safety-of-life claims.
"""
    (OUT_DIR / "ATTRIBUTION.md").write_text(text, encoding="utf-8")


def write_manifest(created_at: str) -> Path:
    files = sorted(OUT_DIR.glob("*.pmtiles"))
    if not files:
        raise SystemExit("no pmtiles in output dir")
    rows = []
    total = 0
    for path in files:
        size, sha = sha256_file(path)
        total += size
        rows.append({"path": path.name, "bytes": size, "sha256": sha})
    manifest = {
        "id": f"land-peaks_{created_at}",
        "slug": "land-peaks",
        "title": {
            "kl": "Nunap qaammartaasut (land peak bands)",
            "da": "Landhøjdeklasser (land peak bands)",
            "en": "Land peak color bands",
        },
        "bbox": list(GREENLAND_BBOX),
        "bytes": total,
        "createdAt": f"{created_at}T00:00:00Z",
        "kind": "full",
        "files": rows,
        "notForNavigation": True,
        "notes": (
            f"Peaks-only color relief (transparent below {LAND_BREAKS_M[0]} m, "
            f"bands {LAND_BREAKS_M[0]}/{LAND_BREAKS_M[1]}/{LAND_BREAKS_M[2]} m), "
            f"z0-z{LAND_PEAKS_MAX_ZOOM} 256 px webp from the Mapterhorn DEM "
            "(CC BY 4.0); z11+ renders overzoomed."
        ),
    }
    out = OUT_DIR / "manifest.json"
    out.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    eprint(f"manifest: {out}")
    for row in rows:
        eprint(f"  {row['path']}: {row['bytes'] / 1e6:.1f} MB")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--measure",
        action="store_true",
        help="download tiles and print sizes only; do not build archives",
    )
    args = parser.parse_args()

    if args.measure:
        build_peaks(measure_only=True)
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DEM_CACHE.mkdir(parents=True, exist_ok=True)
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = build_peaks(measure_only=False)
    if out is None:
        raise SystemExit("build failed")
    eprint(f"land-peaks.pmtiles: {out.stat().st_size / 1e6:.1f} MB")
    write_attribution()
    write_manifest(created_at)
    print(
        f"Built {OUT_DIR}\n"
        "Publish: bash scripts/publish-land-peaks-assets.sh\n"
        "Fetch on other machines: bash scripts/fetch-land-peaks-assets.sh"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
