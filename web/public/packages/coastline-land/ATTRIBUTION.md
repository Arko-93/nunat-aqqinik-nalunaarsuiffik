# Coastline land mask — attribution and redistribution

The web product map hides ocean depth layers under a complete land mask
built from OpenStreetMap coastline land polygons unioned with Mapterhorn
DEM land (elevation > ~1 m in a z12 coastal band). The DEM union closes
shoreline gaps where the land hillshade renders land the OSM coastline
misses (issue #19) — the mask matches the rendered land by construction.

## Sources

- Data: OpenStreetMap land polygons (full coastline) — `land-polygons-split-4326`
  from osmdata.openstreetmap.de.
- URL: <https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip>
- Publisher: OpenStreetMap contributors.
- DEM land: Mapterhorn Terrarium tiles (Klimadatastyrelsen Greenland DEM),
  <https://tiles.mapterhorn.com/> — CC BY 4.0.
- Build: `web/scripts/build-coastline-mask.py` clips to Greenland, lightens
  to ~5 m, unions polygonized DEM land, and tiles with tippecanoe
  (`land.pmtiles`, zooms 0–13, no densest-drop; z14 renders overzoomed).

## Attribution (required)

> © OpenStreetMap contributors (ODbL) · © Klimadatastyrelsen / Mapterhorn (CC BY 4.0)

The map style carries this text in the `coastline-land` source attribution
so the MapLibre attribution control shows it.
