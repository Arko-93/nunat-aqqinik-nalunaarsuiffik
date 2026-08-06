#!/usr/bin/env python3
"""Shared PMTiles v3 writer for the nunat web tile builds.

Subset writer producing clustered PMTiles v3 archives with content
dedup, run-length merging, and leaf-directory spill. Used by
build-corridor-pack.py and build-ocean-depth.py so every archive the
web map serves is written by the same code (and validated by the same
pmtiles-protocol tests).

Key layout facts (the JS reader depends on these):
- Header is 127 bytes; the root directory starts at offset 127.
- The JS reader loads the root from the first 16 KB of the file, so the
  compressed root directory must stay well under that (ROOT_MAX_BYTES).
- Larger entry sets spill into leaf directories (run=0 pointers).
- tile_compression: 0=none, 2=gzip (MVT bodies). tile_type: 1=mvt,
  2=png, 3=jpeg, 4=webp.
"""

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

# The JS reader loads the root directory from the first 16 KB of the
# file; keep the compressed root comfortably inside it.
ROOT_MAX_BYTES = 12000
LEAF_TARGET_BYTES = 10000


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
    bbox: tuple[float, float, float, float],
) -> None:
    """Write a clustered PMTiles v3 archive with content dedup.

    tile_type: 1=mvt, 2=png, 3=jpeg, 4=webp. tile_compression: 0=none, 2=gzip.
    bbox is (W, S, E, N). The root directory stays small enough to fit the
    reader's first-16 KB fetch; larger entry sets spill into leaf
    directories (run=0 pointers).
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

    w, s, e, n = bbox
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


def read_pmtiles(path: Path) -> dict[tuple[int, int, int], bytes]:
    """Read every tile of a PMTiles v3 archive into {(z, x, y): body}.

    General reader (handles any clustered v3 archive: our writer's output
    and tippecanoe's): parses the header, walks root + leaf directories,
    and returns raw tile bodies exactly as stored (compression untouched —
    callers know the tile_compression from the header).
    """
    raw = path.read_bytes()

    def u64(offset: int) -> int:
        return int.from_bytes(raw[offset : offset + 8], "little")

    if raw[0:7] != b"PMTiles" or raw[7] != 3:
        raise ValueError(f"{path} is not a PMTiles v3 archive")
    internal_compression = raw[97]
    root_offset = u64(8)
    root_len = u64(16)
    leaf_offset = u64(40)
    leaf_len = u64(48)
    tile_offset = u64(56)
    tile_len = u64(64)

    def decompress(data: bytes) -> bytes:
        if internal_compression == 2:
            import gzip

            return gzip.decompress(data)
        return data

    def parse_dir(data: bytes) -> list[tuple[int, int, int, int]]:
        """Directory entries: (tileId, offset, length, run)."""
        entries: list[tuple[int, int, int, int]] = []
        pos = 0

        def varint() -> int:
            nonlocal pos
            result = 0
            shift = 0
            while True:
                b = data[pos]
                pos += 1
                result |= (b & 0x7F) << shift
                if not b & 0x80:
                    return result
                shift += 7

        count = varint()
        ids: list[int] = []
        prev = 0
        for _ in range(count):
            prev += varint()
            ids.append(prev)
        runs = [varint() for _ in range(count)]
        lengths = [varint() for _ in range(count)]
        offsets: list[int] = []
        prev_off = 0
        for index in range(count):
            delta = varint()
            if delta == 0:
                offsets.append(prev_off + lengths[index - 1] if index > 0 else 0)
            else:
                offsets.append(delta - 1)
            prev_off = offsets[-1]
        for tile_id, offset, length, run in zip(ids, offsets, lengths, runs):
            entries.append((tile_id, offset, length, run))
        return entries

    root = decompress(raw[root_offset : root_offset + root_len])
    dirs = [parse_dir(root)]
    # Leaf directories pointed at by run=0 entries.
    leaves: list[tuple[int, int]] = []
    for tile_id, offset, length, run in dirs[0]:
        del tile_id
        if run == 0:
            leaves.append((offset, length))
    for offset, length in leaves:
        dirs.append(parse_dir(decompress(raw[leaf_offset + offset : leaf_offset + offset + length])))

    def zxy_of(tile_id: int) -> tuple[int, int, int]:
        # Inverse of the pmtiles reference zxyToTileId (node_modules/pmtiles
        # tileIdToZxy): recover (z, x, y) from the Hilbert-style curve id.
        z = ((tile_id * 3 + 1).bit_length() - 1) // 2
        acc = ((1 << z) * (1 << z) - 1) // 3
        r = tile_id - acc
        x = 0
        y = 0
        a = 1
        while a < (1 << z):
            c = a & (r >> 1)
            u = a & (r ^ c)
            # Mirror the forward rotate: u==0 swaps, and with c!=0 reflects.
            if u == 0:
                if c != 0:
                    x = a - 1 - x
                    y = a - 1 - y
                x, y = y, x
            r >>= 1
            x += c
            y += u
            a <<= 1
        return z, x, y

    out: dict[tuple[int, int, int], bytes] = {}
    for directory in dirs:
        prev_off = None
        prev_len = None
        for tile_id, offset, length, run in directory:
            if run == 0:
                continue
            z, x, y = zxy_of(tile_id)
            if prev_off is not None and prev_len is not None and offset == 0:
                off = prev_off + prev_len
            else:
                off = offset
            body = raw[tile_offset + off : tile_offset + off + length]
            for i in range(run):
                zz, xx, yy = zxy_of(tile_id + i)
                out[(zz, xx, yy)] = body
            prev_off, prev_len = off, length
    return out
