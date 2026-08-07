# Qaarsut–Kullorsuaq corridor offline pack — attribution

The corridor pack serves the same tile sources as the online terrain-first
map, clipped to the corridor bbox (-58.5, 70.4,
-50.5, 74.9 W,S,E,N). Not for navigation.

## Sources

- Land relief (`land-relief.pmtiles`): Mapterhorn Terrarium tiles,
  <https://tiles.mapterhorn.com/> — Klimadatastyrelsen Greenland DEM,
  CC BY 4.0 (<https://mapterhorn.com/attribution>).
  z0–z10, native 512 px (offline tileSize
  512); z11+ renders overzoomed. Same tiles as the online style.
- Land peak bands (`land-peaks.pmtiles`): peaks-only color relief cut from
  the same corridor DEM tiles (issue #24) — transparent below 500 m,
  discrete bands at 500/1000/2000 m (`landPeakBandColor` in
  `web/src/map/meter-bands.ts`), z0–z10,
  256 px lossless webp; z11+ renders overzoomed. Same
  Mapterhorn DEM source as `land-relief.pmtiles`, so the bands sit on the
  relief they were cut from.
- Ocean depth vector (`ocean-depth-vector.pmtiles`): self-tiled from the
  IBCAO v5.2 (2026) 400 m grid with GEBCO_2026 fallback (15 arc-sec) —
  depth band polygons (`depare`) + contour lines, clipped to the shared
  coastline (OSM ∪ Mapterhorn DEM land) before tiling, z0–z11
  (z12+ renders overzoomed). See packages/ocean-depth/ATTRIBUTION.md.
- Ocean hillshade raster (`ocean-depth-dem.pmtiles`): the same self-tiled
  depth grid as terrarium webp 256 px, z0–z10 (z11+
  renders overzoomed) — the offline ocean hillshade, restored since the
  pack can carry it.
- Coastline mask (`coastline-land/land.pmtiles`): OpenStreetMap land
  polygons (full coastline, ODbL) unioned with Mapterhorn DEM land
  (Klimadatastyrelsen, CC BY 4.0) — the shared V1 interim shoreline used
  by the display mask and the bathymetry clip. Derived mask published
  under ODbL share-alike.
- Localities (`localities.geojson`): NunaGIS PlacenamesRegister midpoint
  layer (Type 21/23) via the web data release — see data/source/ provenance.

## Attribution (required, shown in the map)

> © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) ·
> Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid, Seabed 2030) ·
> © OpenStreetMap contributors (ODbL)

## Redistribution terms

- ODbL 1.0 (<https://opendatacommons.org/licenses/odbl/>) applies to the
  OSM-derived mask and to any bathymetry clipped to this coastline;
  the DEM-derived portion keeps CC BY 4.0.
- CC BY 4.0 applies to the Mapterhorn DEM tiles in land-relief.pmtiles
  and to the derived peak color bands in land-peaks.pmtiles.
- The IBCAO/GEBCO depth grids are open data; derived products must
  acknowledge IBCAO/GEBCO Compilation Group.
- Not for navigation: display context and cartographic repair only; no
  safety-of-life claims.
