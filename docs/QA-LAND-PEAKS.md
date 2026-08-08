# QA — Land peak color bands (#24)

Discrete peak color bands at 500 / 750 / 1000 / 1250 / 1500 / 2000 / 2500 m
on high land only. Not a hypsometric land wash: elevation below 500 m is
transparent, so coastal lowland keeps the hillshade + basemap look.
`raster-opacity: 0.72` lets hillshade form read through the tints.

## What shipped

- `web/src/map/meter-bands.ts`: `LAND_BREAKS_M = [500, 750, 1000, 1250, 1500, 2000, 2500]`
  and `landPeakBandColor()`; `landPeaksOnly` live.
- `web/src/map/terrain-style.ts`:
  - meta `nunat:land-peak-bands: "500-750-1000-1250-1500-2000-2500"`,
    `nunat:land-peaks-only: true`, `nunat:land-breaks-m`,
    `nunat:land-peak-fill: discrete-color-relief-mapterhorn`,
    `nunat:land-peak-resampling: nearest`;
  - `TERRAIN_LAYER_IDS.landPeakBands = "terrain-land-peak-bands"`;
  - source `land-peaks` (raster, 256 px, maxzoom 10) — online:
    `pmtiles:///packages/land-peaks/land-peaks.pmtiles/{z}/{x}/{y}`,
    offline: pack `land-peaks.pmtiles` (same logical path);
  - layer paint: `raster-opacity: 0.72`;
  - layer order: `basemap water → ocean* → coastline mask → land hillshade → peak bands
    → basemap land fills → roads → labels`.
- Liberty `water` is relocated under the ocean stack so translucent basemap
  water cannot wash islands above the mask (`assertWaterUnderMask`).
- `web/scripts/build-land-peaks.py`: builds the full-Greenland
  `packages/land-peaks/land-peaks.pmtiles` from the same Mapterhorn
  Terrarium DEM tiles the hillshade serves. Peaks-only pyramid: only
  z7 parents that contain ≥500 m keep their children; tiles with every pixel
  below 500 m are omitted. Lossless RGBA webp keeps discrete band edges exact.
- `web/scripts/build-corridor-pack.py`: corridor pack carries
  `land-peaks.pmtiles` (same colorizer imported from build-land-peaks.py).
- Fetch/publish: `make web-fetch-land-peaks` / `make web-publish-land-peaks`.

## Why a color-relief raster (not a MapLibre trick)

MapLibre hillshade cannot color by elevation. The bands are a pre-baked
peaks-only color-relief raster from the same DEM as the hillshade. It sits
above the opaque hillshade; sub-500 m land keeps full hillshade relief.
`raster-resampling: nearest` keeps band edges crisp. Opacity 0.72 keeps
ridge form visible inside high bands.

## Evidence

- Style contract: `terrain-style.test.ts` — meta, opacity 0.72, water under mask,
  order above mask + hillshade and below basemap labels.
- Peaks-only bake: `data/scripts/test_land_peaks.py` — synthetic quadrants and
  band boundaries for the 7-step ramp.
- Browser dogfood: Naajaat (no Liberty water wash on islands); Qaqqarsuaq
  (multiple brown steps + visible hillshade through tint).

## Remaining

- z10→z13 overzoom blockiness on steep ridges.
- Asiaq shoreline (#25) may re-anchor mask/clip; peaks stay Mapterhorn until then.
