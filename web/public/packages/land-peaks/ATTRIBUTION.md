# Land peak color bands — attribution

The peaks-only color-relief raster (`land-peaks.pmtiles`) is derived from
the Mapterhorn Terrarium tiles, <https://tiles.mapterhorn.com/> —
Klimadatastyrelsen Greenland DEM, CC BY 4.0
(<https://mapterhorn.com/attribution>).

- Same source as the land hillshade the style serves: the bands sit on
  the relief they were cut from, so they cannot drift (issue #24).
- Elevation below 500 m is transparent (peaks-only — never a full land
  wash); discrete bands at 500/750/1000/1250/1500/2000/2500 m
  use the product colors in web/src/map/meter-bands.ts
  (`landPeakBandColor`).
- z0–z10, 256 px lossless webp; z11+ renders
  overzoomed (same policy as the corridor land-relief).

## Redistribution terms

- CC BY 4.0 applies to the Mapterhorn DEM tiles this raster is derived
  from.
- Not for navigation: display context only; no safety-of-life claims.
