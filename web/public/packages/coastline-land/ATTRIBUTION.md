# Coastline land mask — attribution and redistribution

The web product map hides ocean depth layers under a complete land mask
built from OpenStreetMap coastline land polygons.

## Source

- Data: OpenStreetMap land polygons (full coastline) — `land-polygons-split-4326`
  from osmdata.openstreetmap.de.
- URL: <https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip>
- Publisher: OpenStreetMap contributors.
- Build: `web/scripts/build-coastline-mask.py` clips to Greenland, lightens
  to ~5 m, and tiles with tippecanoe (`land.pmtiles`, zooms 0–13).

## Attribution (required)

> © OpenStreetMap contributors (ODbL) — coastline land polygons

The map style carries this text in the `coastline-land` source attribution
so the MapLibre attribution control shows it.

## Redistribution terms

- Licence: Open Database License (ODbL) 1.0 —
  <https://opendatacommons.org/licenses/odbl/>.
- Share-alike: derived data (including this mask and any bathymetry clipped
  to this coastline) must be distributed under ODbL with the same
  attribution.
- Not for navigation: this mask is display context and cartographic repair;
  it is not a nautical chart and carries no safety-of-life claims.
- Asiaq geometry may replace OSM for the shared shoreline when authoritative
  distributable geometry arrives (see issue #16); the licence section of this
  file must be updated together with that swap.
