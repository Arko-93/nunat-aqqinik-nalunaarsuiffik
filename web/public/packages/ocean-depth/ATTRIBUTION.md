# Ocean depth (IBCAO/GEBCO) — attribution and redistribution

The web product map's ocean layers (depth fills, contours, contour labels,
hillshade) are self-tiled from the IBCAO v5.2 bathymetric grid with the
GEBCO_2026 grid as fallback. This replaces the interim Open Waters Seascape
source (issue #23).

## Sources

- IBCAO v5.2 (2026) 400 m grid: <https://data.ceda.ac.uk/bodc/gebco/ibcao/ibcao_v5.2/no_greenland_ice_sheet_elevation_data/400mx400m_grid_cell_spacing/single_complete_bathymetric_grid/ibcao_v5_2_2026_depth_400m.zip>
  Bathymetry north of 64N, EPSG:3996, elevation in metres (sea negative,
  Greenland ice sheet elevation excluded). Publisher: IBCAO (International
  Bathymetric Chart of the Arctic Ocean), part of the Nippon
  Foundation-GEBCO Seabed 2030 project. Licence: Open Government Licence
  v3.0 (<https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>).
- GEBCO_2026 grid (15 arc-sec global ice-surface elevation):
  <https://www.gebco.net/data_and_products/gridded_bathymetry_data/>
  Used as fallback where IBCAO has no data (seas south of 64N, coastal
  gaps). Publisher: GEBCO Compilation Group.
- Shared coastline for clipping: OpenStreetMap coastline land polygons
  (ODbL) unioned with Mapterhorn DEM land (Klimadatastyrelsen, CC BY 4.0) —
  the same shoreline the display mask uses (see packages/coastline-land).
- Build: `web/scripts/build-ocean-depth.py` warps both grids to a WGS84
  15 arc-sec Greenland grid, merges (IBCAO wins where valid), clips land
  cells to the shared coastline, and tiles: raster-dem terrarium webp
  (256 px, z0-10) + MVT depth bands/contours (z0-11), both clipped before
  tiling and verified at build time.

## Attribution (required, shown in the map)

> Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid,
> Seabed 2030) — not for navigation

## Redistribution terms

- IBCAO/GEBCO grids: IBCAO v5.2 under the Open Government Licence v3.0
  (free use with attribution); GEBCO_2026 free to use with attribution to
  the GEBCO Compilation Group. Derived products must acknowledge
  IBCAO/GEBCO Compilation Group.
- The coastline-derived portions (clipping shoreline) carry OSM ODbL
  share-alike obligations; the DEM-derived shoreline portions keep
  CC BY 4.0 (Klimadatastyrelsen / Mapterhorn).
- Not for navigation: display context and cartographic signal only; no
  safety-of-life claims. This is not a chart.
