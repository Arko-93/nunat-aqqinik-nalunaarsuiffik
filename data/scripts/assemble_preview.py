#!/usr/bin/env python3
"""Assemble static preview payload from built distributions and reconciliation."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
PREVIEW_DIR = ROOT / "preview"


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"missing {path}")
    with path.open(encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def copy_tree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def assemble(dist_dir: Path, reconciliation_dir: Path, site_dir: Path) -> None:
    if not dist_dir.exists():
        raise SystemExit(
            f"missing {dist_dir}; run `make -C data` before assembling preview"
        )

    out_dist = site_dir / "dist"
    out_data = site_dir / "data"
    out_dist.mkdir(parents=True, exist_ok=True)
    out_data.mkdir(parents=True, exist_ok=True)

    for path in dist_dir.iterdir():
        if path.is_file():
            shutil.copy2(path, out_dist / path.name)

    seeds_path = reconciliation_dir / "place-seeds.ndjson"
    seeds = read_ndjson(seeds_path)
    shutil.copy2(seeds_path, out_data / "place-seeds.ndjson")
    write_json(out_data / "place-seeds.json", seeds)

    authority_path = (
        reconciliation_dir / "authority" / "oqaasileriffik-nunagis.ndjson"
    )
    if authority_path.exists():
        authority = read_ndjson(authority_path)
        shutil.copy2(authority_path, out_data / "oqaasileriffik-nunagis.ndjson")
        write_json(out_data / "oqaasileriffik-nunagis.json", authority)

    # Directory listing helper for /dist/
    listing = sorted(path.name for path in out_dist.iterdir() if path.is_file())
    write_json(out_dist / "index.json", {"files": listing})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist-dir", type=Path, default=DATA_DIR / "dist")
    parser.add_argument(
        "--reconciliation-dir",
        type=Path,
        default=DATA_DIR / "reconciliation",
    )
    parser.add_argument("--site-dir", type=Path, default=PREVIEW_DIR)
    args = parser.parse_args()

    assemble(args.dist_dir, args.reconciliation_dir, args.site_dir)
    print(
        f"Assembled preview data into {args.site_dir / 'dist'} "
        f"and {args.site_dir / 'data'}"
    )


if __name__ == "__main__":
    main()
