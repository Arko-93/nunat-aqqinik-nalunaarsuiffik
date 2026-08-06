# Manual visual QA — coastline mask (Qaarsut, Naajaat, Upernavik, Kullorsuaq)

Issue #16 regression areas + issue #19 fix areas. "Before" = the previous
mask package (OSM coastline only, `coastline-land_2026-08-05`); "After" =
this branch's mask (OSM coastline ∪ Mapterhorn DEM land, `coastline-land_2026-08-06`).

## How to reproduce

1. `bash scripts/fetch-coastline-mask-assets.sh` (mask PMTiles must be present).
2. `pnpm --dir web dev`.
3. Open the map; from the console (`window.__nunatMap`), go to each area:

   ```js
   __nunatMap.easeTo({ center: [-52.638, 70.731], zoom: 13 }); // Qaarsut
   __nunatMap.easeTo({ center: [-55.808, 73.143], zoom: 13 }); // Naajaat
   __nunatMap.easeTo({ center: [-56.147, 72.785], zoom: 13 }); // Upernavik
   __nunatMap.easeTo({ center: [-57.220, 74.579], zoom: 13 }); // Kullorsuaq
   ```

4. Before state (for comparison): use the previous release tag
   `web-coastline-mask-coastline-land_2026-08-05` assets, or
   `__nunatMap.removeLayer("terrain-coastline-mask")` for the unmasked look.

## Checkpoints

| Area | Zoom | Check |
| --- | --- | --- |
| Naajaat | 13–14 | No 5 m / 20 m / 50 m depth fill, contour line, or depth label on the settlement island or the DEM land west of it (issue #19 underfill) |
| Qaarsut | 13–14 | Settlement coastline clean; small islands are land, not submerged bands |
| Upernavik | 13 | No depth fill on DEM land around the settlement |
| Kullorsuaq | 13 | No depth fill on DEM land around the settlement |
| Any | 3–8 | Land hillshade and NunaGIS markers/labels still visible above the mask |
| Any | 14 | Ocean meter bands, contours, and labels visible in sea (mask did not over-clip) |

## Evidence (2026-08-06)

Fixed camera (1523×914, DPR 1), same viewport before/after. Screenshots:

- `docs/qa-coastline-mask/naajaat-z13-before.png` / `naajaat-z13-after.png`
- `docs/qa-coastline-mask/naajaat-z14-before.png` / `naajaat-z14-after.png`
- `docs/qa-coastline-mask/qaarsut-z13-before.png` / `qaarsut-z13-after.png`
- `docs/qa-coastline-mask/qaarsut-z14-before.png` / `qaarsut-z14-after.png`
- `docs/qa-coastline-mask/upernavik-z13-before.png` / `upernavik-z13-after.png`
- `docs/qa-coastline-mask/kullorsuaq-z13-before.png` / `kullorsuaq-z13-after.png`

Measured pixel change (same viewport, mask old vs new, RGB delta > 30/765):

| Pair | Changed pixels |
| --- | --- |
| naajaat-z13 before→after | 6.0 % |
| naajaat-z14 before→after | 9.1 % |
| qaarsut-z13 before→after | 3.1 % |
| qaarsut-z14 before→after | 1.4 % |
| upernavik-z13 before→after | 0.2 % |
| kullorsuaq-z13 before→after | 0.0 % |

Upernavik and Kullorsuaq changed little in pixels: their DEM↔OSM underfill is
~0.04–0.06 km² — sub-visual at z13 in a ~48 km² viewport — but it is closed by
the same DEM union (geometric regression, see below).

## Rendered-state check (issue #19 defect point)

At the Naajaat DEM-land point `(-55.83467, 73.14733)` (west of the OSM
settlement ring; the pixel that was ocean-over-land in the #18 QA):

- Before (OSM-only mask): `queryRenderedFeatures` reports
  `[water, terrain-ocean-fills]` — depth fill paints on DEM land.
- After (this branch): reports
  `[water, terrain-coastline-mask, terrain-ocean-fills]` — the mask layer
  sits above the fills (layer-order contract `assertMaskAboveOcean`), and
  the rendered pixel is the mask beige under land hillshade.

## Geometric regression (committed fixtures)

`web/src/map/coastline-mask.test.ts` pins the shared-coastline contract:

- 61→60 DEM-land sample points at Naajaat (Mapterhorn z14 pixels > 15 m
  outside the OSM-only shoreline, elevations up to ~120 m) are covered by the
  mask tiles at z12/z13 — fails on the OSM-only mask, passes on the DEM union.
- Bathymetry clip helpers still leave no depth band or contour portion on land.
