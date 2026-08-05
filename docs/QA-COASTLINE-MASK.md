# Manual visual QA — coastline mask (Qaarsut + Naajaat)

Issue #16 regression areas. "Before" = current style with the coastline mask
layer removed (ocean layers unmasked). "After" = this branch with the
complete OSM coastline mask above every ocean layer.

## How to reproduce

1. `bash scripts/fetch-coastline-mask-assets.sh` (mask PMTiles must be present).
2. `pnpm --dir web dev`.
3. Open the map; from the console (`window.__nunatMap`), go to each area:

   ```js
   __nunatMap.easeTo({ center: [-52.633, 70.733], zoom: 13 }); // Qaarsut
   __nunatMap.easeTo({ center: [-55.8, 73.133], zoom: 12 });  // Naajaat
   ```

4. Before state (for comparison):

   ```js
   __nunatMap.removeLayer("terrain-coastline-mask")
   ```

5. After state: reload the page (or re-apply the style with
   `loadTerrainStyle` / `map.setStyle`).

## Checkpoints

| Area | Zoom | Check |
| --- | --- | --- |
| Qaarsut | 13 | No 5 m / 20 m / 50 m depth fill, contour line, or depth label on land |
| Qaarsut | 14 | Settlement coastline clean; small islands are land, not submerged bands |
| Naajaat | 12 | No angular depth areas or contour lines across mainland |
| Naajaat | 13 | Island/rock geometry around the settlement stays land |
| Any | 3–8 | Land hillshade and NunaGIS markers/labels still visible above the mask |
| Any | 14 | Ocean meter bands, contours, and labels visible in sea (mask did not over-clip) |

## Evidence (2026-08-05)

Captured at the zooms above with `pnpm dev` + the product map (vite :3457
equivalent). Screenshots below; each shows the same viewport before (mask
removed) and after (mask active).

- `docs/qa-coastline-mask/qaarsut-z13-before.png` / `qaarsut-z13-after.png`
- `docs/qa-coastline-mask/qaarsut-z14-before.png` / `qaarsut-z14-after.png`
- `docs/qa-coastline-mask/naajaat-z12-before.png` / `naajaat-z12-after.png`
- `docs/qa-coastline-mask/naajaat-z13-before.png` / `naajaat-z13-after.png`

## Result

- Before: depth bands and contours visibly cross land in both areas.
- After: no depth fill, contour, or label on land; small islands are land;
  sea-side bands and labels unchanged; land relief and official place labels
  render above the mask.

Measured pixel change (same viewport, mask off vs on, RGB delta > 30/765):

| Pair | Changed pixels |
| --- | --- |
| qaarsut-z13 before→after | 23.1 % |
| qaarsut-z14 before→after | 15.9 % |
| naajaat-z12 before→after | 7.5 % |
| naajaat-z13 before→after | 9.2 % |

Rendered-state check at the Qaarsut settlement (z13): with the mask active
`queryRenderedFeatures` reports `[placenames marker, terrain-coastline-mask]`
at the settlement pixel; after removing the mask it reports
`[water, terrain-ocean-fills]` — the defect this issue fixes.
