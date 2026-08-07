# Ocean depth (IBCAO/GEBCO) — build + verification notes

Issue #23: replace the interim Open Waters Seascape ocean source with
self-tiled IBCAO v5.2 bathymetry (GEBCO_2026 fallback), clipped to the
shared coastline before tiling.

## What was built

- `web/scripts/build-ocean-depth.py` — the full pipeline:
  1. Fetch (cached under `.cache/ocean-depth/`): IBCAO v5.2 (2026) 400 m
     grid (CEDA, EPSG:3996 polar stereographic), GEBCO_2026 tile
     (CEDA, 15 arc-sec, lon −90…0), and the coastline-land `land.geojson`
     (sha256-verified against its manifest — the shared coastline).
  2. `gdalwarp` both grids to a WGS84 15 arc-sec Greenland-bbox grid;
     merge: IBCAO wins where valid, GEBCO fills the rest.
  3. Raster clip: land cells (shared coastline, `gdal_rasterize` of the
     mask polygons) become 0. Vector clip: land cells become nodata.
  4. Raster tiles: terrarium lossless-webp 256 px, z0–10
     (`ocean-depth-dem.pmtiles`; z11+ overzooms).
  5. Vector tiles: band polygons from a 30 arc-sec grid (fill bands do
     not need the 450 m cell detail — 4x lighter to contour/clip),
     contour lines from the 15 arc-sec grid (`depth_abs_m`/`depth_m`),
     both simplified with `ogr2ogr -simplify` (~100 m), then clipped with
     shapely against the shared coastline (STRtree-local difference — the
     Python mirror of `web/src/map/coastline-clip.ts`). The clip shoreline
     is a 200 m simplified (repaired) copy of the mask land — the display
     mask sits above every ocean layer, so the coarser V1 clip shoreline
     is invisible on screen; the TS fixtures still pin the true-coastline
     contract. Then tippecanoe z0–11 (`ocean-depth-vector.pmtiles`;
     z12+ overzooms).
  6. Build-time clip verification (the contract gate): every clipped band
     overlaps land < 25 m2; no clipped contour vertex or segment midpoint
     is truly inside land (0.5 m boundary epsilon, tested against the
     eroded clip shoreline so boundary-touching split endpoints pass).
     The build FAILS if either check trips.
- `web/public/packages/ocean-depth/` — manifest (sha256) + ATTRIBUTION.
- Corridor pack: `ocean-depth-vector.pmtiles` (z0–11, 10.4 MB) and the
  restored offline ocean hillshade `ocean-depth-dem.pmtiles` (z0–10,
  6.1 MB) are subsets of the package archives (shared PMTiles
  reader/writer in `web/scripts/pmtiles_writer.py`); the pack rename
  `ocean-depth.pmtiles` → `ocean-depth-vector.pmtiles` mirrors the online
  package file names. Pack total 87.2 MB (was 90.4 MB with Seascape) —
  the hillshade raster fits the budget.

## Data conventions

- IBCAO v5.2: depth positive in sea, land masked (nodata −32768 after
  warp). Covers north of 64°N.
- GEBCO_2026: elevation, sea negative; used only where IBCAO has no data.
- Seascape-compatible vector fields: `depare.drval1` (5/10/20/50/100/
  200/500/1000, upper band edge), `contours.depth_abs_m` (positive) +
  `contours.depth_m` (signed). No `sys` field: the metric ladder only
  (style filters accept absence of `sys`).
- The raster encodes elevation (sea negative); land cells are 0 (flat)
  so no depth signal exists under the mask.

## How to reproduce the build

```sh
uv venv .venv --python 3.12 && uv pip install --python .venv/bin/python numpy pillow shapely
brew install gdal tippecanoe          # gdalwarp / gdal_rasterize / gdal_contour
.venv/bin/python web/scripts/build-ocean-depth.py
make web-fetch-ocean-depth            # verify/fetch the published assets instead
```

## Checkpoints (product path)

| Check | How |
| --- | --- |
| Style points at hosted IBCAO/GEBCO PMTiles, never Seascape | `terrain-style.test.ts`: online sources are `pmtiles:///packages/ocean-depth/…`, `nunat:ocean-source: ibcao-v5.2`, `nunat:ocean-fallback: gebco-2026`, no `openwaters`/`seascape` anywhere in the composed style |
| Clip contract proofs stay green | `coastline-mask.test.ts` (fixtures cross land raw; clipped output never does) — helpers now live in `web/src/map/coastline-clip.ts` |
| Offline hillshade restored | offline style serves `ocean-depth-dem.pmtiles` from the pack (tileSize 256); `nunat:ocean-hillshade-offline: served` |
| Pack contract | `TERRAIN_OFFLINE_FILES` requires `ocean-depth-dem.pmtiles` + `ocean-depth-vector.pmtiles` for kind=full |
| Not-for-navigation | attribution and metadata carry “not for navigation” in EN/DA/KL copy and in both PMTiles manifests |

## Evidence

- Build log: band/contour clip verification counts (points checked, 0
  violations), archive sizes in the manifest.
- Browser QA: see the corridor pack offline run (pack now carries the
  hillshade raster; z12 ocean renders overzoomed from z11).

## Remaining gaps

- Asiaq shoreline swap (#25) must update both the mask and the ocean clip
  (same `land.geojson` source), plus the ODbL/CC BY notes in both
  ATTRIBUTION files.
- Land peak color bands shipped in #24 (peaks-only color relief from the
  same Mapterhorn DEM as the hillshade; transparent below 500 m, bands
  500/1000/2000 m; z11+ renders overzoomed) — see docs/QA-LAND-PEAKS.md.
- `soundings` layer from the old Seascape pack is not reproduced (the
  style does not use it); `vector_layers` metadata lists only
  `depare`/`contours`.
- z12 vector detail is overzoomed from z11 (grid cells ~400–450 m add no
  z12 detail); the corridor pack serves z0–11 for ocean.
