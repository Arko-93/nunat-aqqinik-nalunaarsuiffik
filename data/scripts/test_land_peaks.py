#!/usr/bin/env python3
"""Unit tests for the peaks-only color-relief bake (issue #24).

Regression for the lowland-wash bug: BAND_COLORS must start at 500 m
(LAND_BREAKS_M[0]) so elevations 0-499 m stay transparent inside mixed
tiles — the peaks-only policy, never a full land wash.

Synthetic terrarium webp tiles with known elevations are fed through
peaks_webp (web/scripts/build-land-peaks.py); the RGBA output is
decoded and asserted per band.
"""

import importlib.util
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BUILD_SCRIPT = ROOT / "web" / "scripts" / "build-land-peaks.py"


def load_build_module():
    spec = importlib.util.spec_from_file_location("build_land_peaks", BUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {BUILD_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def terrarium_tile_512(elevations: list[float]) -> bytes:
    """512x512 terrarium webp with one uniform quadrant per elevation.

    Quadrants (top-left, top-right, bottom-left, bottom-right) stay
    uniform through the 512->256 bilinear resize, so the decoded band
    colors are exact at each quadrant centre.
    """
    size = 512
    half = size // 2
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    quadrants = [
        (0, 0, elevations[0]),
        (0, half, elevations[1]),
        (half, 0, elevations[2]),
        (half, half, elevations[3]),
    ]
    for y0, x0, elev in quadrants:
        shifted = np.clip(elev + 32768.0, 0.0, 65535.0)
        block = np.zeros((half, half, 3), dtype=np.uint8)
        block[:, :, 0] = (shifted // 256.0).astype(np.uint8)
        block[:, :, 1] = (shifted % 256.0).astype(np.uint8)
        block[:, :, 2] = ((shifted * 256.0) % 256.0).astype(np.uint8)
        arr[y0 : y0 + half, x0 : x0 + half] = block
    out = io.BytesIO()
    Image.fromarray(arr, "RGB").save(out, format="WEBP", lossless=True)
    return out.getvalue()


def decode_rgba(data: bytes) -> np.ndarray:
    """Decode a peaks_webp output; a decode failure is a test failure."""
    try:
        return np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))
    except Exception as exc:  # noqa: BLE001 - test failure, not recovery
        raise AssertionError(f"cannot decode peaks_webp output: {exc}") from exc


def assert_quadrant(rgba: np.ndarray, y: int, x: int, expect: tuple[int, int, int, int]) -> None:
    pixel = tuple(int(v) for v in rgba[y, x])
    assert pixel == expect, f"quadrant centre ({x},{y}) = {pixel}, expected {expect}"


def main() -> int:
    build = load_build_module()
    out_px = build.TILE_PX  # 256

    # Mixed tile: 100 (lowland) / 600 / 1500 / 2500 m. Only 600+ banded;
    # 100 m must stay fully transparent (the bug baked it #8a7a5c).
    mixed = terrarium_tile_512([100.0, 600.0, 1500.0, 2500.0])
    result = build.peaks_webp(mixed)
    assert result is not None, "mixed tile must not be omitted (has >=500 m)"
    rgba = decode_rgba(result)
    assert rgba.shape == (out_px, out_px, 4), f"unexpected output shape {rgba.shape}"
    assert_quadrant(rgba, out_px // 4, out_px // 4, (0, 0, 0, 0))  # 100 m -> transparent
    assert_quadrant(rgba, out_px // 4, 3 * out_px // 4, (138, 122, 92, 255))  # 600 m -> band1
    assert_quadrant(rgba, 3 * out_px // 4, out_px // 4, (107, 94, 74, 255))  # 1500 m -> band2
    assert_quadrant(rgba, 3 * out_px // 4, 3 * out_px // 4, (74, 70, 63, 255))  # 2500 m -> band3
    # Boundaries: exactly 500 and 2000 belong to [500,1000) and [2000,inf).
    edge = terrarium_tile_512([499.0, 500.0, 1999.0, 2000.0])
    edge_rgba = decode_rgba(build.peaks_webp(edge))
    assert_quadrant(edge_rgba, out_px // 4, out_px // 4, (0, 0, 0, 0))  # 499 -> transparent
    assert_quadrant(edge_rgba, out_px // 4, 3 * out_px // 4, (138, 122, 92, 255))  # 500 -> band1
    assert_quadrant(edge_rgba, 3 * out_px // 4, out_px // 4, (107, 94, 74, 255))  # 1999 -> band2
    assert_quadrant(edge_rgba, 3 * out_px // 4, 3 * out_px // 4, (74, 70, 63, 255))  # 2000 -> band3

    # All-below-500 tile: omitted entirely (returns None).
    low = terrarium_tile_512([10.0, 100.0, 300.0, 499.0])
    assert build.peaks_webp(low) is None, "all-below-500 tile must be omitted"

    # The bake must never contain a (0, 1000) interval: first band starts
    # at LAND_BREAKS_M[0].
    first_band_low = build.BAND_COLORS[0][0][0]
    message = f"first band starts at {first_band_low}, expected {build.LAND_BREAKS_M[0]}"
    assert first_band_low == build.LAND_BREAKS_M[0], message

    print("test_land_peaks: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
