# Qaarsut–Kullorsuaq corridor offline pack — attribution

The corridor pack serves the same tile sources as the online terrain-first
map, clipped to the corridor bbox (-58.5, 70.4,
-50.5, 74.9 W,S,E,N). Not for navigation.

## Sources

- Land relief (`land-relief.pmtiles`): Mapterhorn Terrarium tiles,
  <https://tiles.mapterhorn.com/> — Klimadatastyrelsen Greenland DEM,
  CC BY 4.0 (<https://mapterhorn.com/attribution>).
  z0–z10, every tile re-encoded at 256 px
  (offline tileSize 256); z11+ renders overzoomed. The archive
  is the same data the online style serves.
- Ocean depth (`ocean-depth.pmtiles`): Open Waters Seascape vector tiles,
  <https://tiles.openwaters.io/seascape/> — open-grid GEBCO mosaic,
  interim product, © Open Waters (<https://openwaters.io/charts/seascape#license>).
  Not for navigation; not a chart.
- Coastline mask (`coastline-land/land.pmtiles`): OpenStreetMap land
  polygons (full coastline, ODbL) unioned with Mapterhorn DEM land
  (Klimadatastyrelsen, CC BY 4.0) — the shared V1 interim shoreline used
  by the display mask. Derived mask published under ODbL share-alike.
- Localities (`localities.geojson`): NunaGIS PlacenamesRegister midpoint
  layer (Type 21/23) via the web data release — see data/source/ provenance.

## Attribution (required, shown in the map)

> © Klimadatastyrelsen / Mapterhorn (CC BY 4.0) · © Open Waters ·
> © OpenStreetMap contributors (ODbL)

## Redistribution terms

- ODbL 1.0 (<https://opendatacommons.org/licenses/odbl/>) applies to the
  OSM-derived mask and to any bathymetry clipped to this coastline;
  the DEM-derived portion keeps CC BY 4.0.
- CC BY 4.0 applies to the Mapterhorn DEM tiles in land-relief.pmtiles.
- The Seascape open-grid depth data carries Open Waters' licence terms.
- Not for navigation: display context and cartographic repair only; no
  safety-of-life claims.
