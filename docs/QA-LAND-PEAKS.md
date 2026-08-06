# QA — Land peak color bands (#24)

Discrete peak color bands at 500 / 1000 / 2000 m on high land only.
Not a hypsometric land wash: elevation below 500 m is transparent, so
coastal lowland keeps the hillshade + basemap look.

## What shipped

- `web/src/map/meter-bands.ts`: `LAND_BREAKS_M = [500, 1000, 2000]` and
  `landPeakBandColor()` were already the product policy; `landPeaksOnly`
  is now live (was "not shipped yet").
- `web/src/map/terrain-style.ts`:
  - meta `nunat:land-peak-bands: "500-1000-2000"` (was `"deferred"`),
    `nunat:land-peaks-only: true`, `nunat:land-breaks-m`,
    `nunat:land-peak-fill: discrete-color-relief-mapterhorn`,
    `nunat:land-peak-resampling: nearest`;
  - `TERRAIN_LAYER_IDS.landPeakBands = "terrain-land-peak-bands"`;
  - source `land-peaks` (raster, 256 px, maxzoom 10) — online:
    `pmtiles:///packages/land-peaks/land-peaks.pmtiles/{z}/{x}/{y}`,
    offline: pack `land-peaks.pmtiles` (same logical path);
  - layer order: `ocean* → coastline mask → land hillshade → peak bands
    → basemap land fills → roads → labels`.
- `web/scripts/build-land-peaks.py`: builds the full-Greenland
  `packages/land-peaks/land-peaks.pmtiles` from the same Mapterhorn
  Terrarium DEM tiles the hillshade serves. Peaks-only pyramid: only
  z7 parents that contain ≥500 m keep their children, so ocean and
  coastal-lowland subtrees are never fetched; tiles with every pixel
  below 500 m are omitted from the archive. Lossless RGBA webp keeps
  the discrete band edges exact.
- `web/scripts/build-corridor-pack.py`: the corridor pack now carries
  `land-peaks.pmtiles` (same colorizer — imported from
  build-land-peaks.py, so the two can never disagree).
- `TERRAIN_OFFLINE_FILES` requires `land-peaks.pmtiles` for
  kind=full offline terrain.
- Fetch/publish: `make web-fetch-land-peaks` / `make web-publish-land-peaks`.

## Why a color-relief raster (not a MapLibre trick)

MapLibre hillshade cannot color by elevation, and there is no
client-side DEM colorization. The bands are a pre-baked peaks-only
color-relief raster from the same DEM as the hillshade, so the band
edges and the relief cannot drift. It sits above the opaque hillshade
(a raster under it would be invisible); sub-500 m land keeps full
hillshade relief. `raster-resampling: nearest` keeps band edges crisp
(linear would blur the 500/1000/2000 m boundaries into fringes).
z0–z10 at 256 px; z11+ renders overzoomed (same policy as land-relief).

## Evidence

- Style contract: `terrain-style.test.ts` — meta flipped to
  `500-1000-2000`, layer/source present with explicit `{z}/{x}/{y}`
  URLs and maxzoom 10, order above mask + hillshade and below basemap
  labels, offline pack path served.
- Offline contract: `corridor-pack.test.ts` / `manifest.test.ts` —
  kind=full requires `land-peaks.pmtiles`; OPFS install reads it.
- Pack build: `land-peaks.pmtiles` in the corridor pack manifest with
  sha256; peaks tiles = N, skipped below 500 m = M.
- Full-country archive: `packages/land-peaks/land-peaks.pmtiles` X MB,
  N tiles (z0–z10).
- Browser dogfood (Qaarsut→Kullorsuaq): high peaks tinted at the
  breaks; low coastal land not washed; place labels readable above the
  bands (screenshots in the PR).

## Remaining gaps

- Asiaq shoreline swap (#25) also re-anchors the DEM-dependent layers
  (mask, bathymetry clip, peak bands) to the authoritative shoreline.
- z10 source overzooms to z13 (200 m blocks); a z11+ peaks pyramid
  would need Mapterhorn native tiles beyond the current pack budget.
