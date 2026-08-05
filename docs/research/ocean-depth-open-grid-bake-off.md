# Ocean depth open-grid bake-off for West Greenland

**Ticket:** [#5](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/5) · **Map:** [#3](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/3)  
**Date:** 2026-08-05  
**Question:** Which open bathymetry grid should power v1 ocean meter bands on West Greenland (IBCAO vs GEBCO vs alternatives), for Siku-like readable depth topography that is explicitly not a navigation chart, including nearshore usefulness Qaarsut→Kullorsuaq, license, and MapLibre tiling path?

## Recommendation (one-liner)

**Use IBCAO V5.2 (100 m Polar Stereographic) as the v1 open grid for West Greenland ocean meter bands and hillshade; treat GEBCO_2026 as the coarser Arctic fallback already embedded in IBCAO’s Seabed 2030 geographic product; keep official hydro as a separate follow-on (#7).**

## Decision summary

| Criterion | Winner | Why |
|---|---|---|
| Native resolution (Arctic) | **IBCAO V5.2** | 100×100 m polar grid vs GEBCO 15″ (~450 m) geographic grid |
| West Greenland coverage | **IBCAO** | Domain is north of 64°N; Qaarsut→Kullorsuaq is fully inside |
| Nearshore Greenland | **IBCAO (via BedMachine blend)** | IBCAO uses BedMachine primarily along the Greenland coast; still mixed quality |
| License for self-tiling | **IBCAO ODC-By** / **GEBCO public domain** | Both allow adaptation + commercial use with attribution; both forbid navigation use |
| Pre-tiled convenience | Open Waters Seascape | Ready MapLibre tiles, but Greenland is GEBCO-scale until IBCAO is ingested |
| Chart-grade authority | None of the open grids | Official hydro is #7, not a v1 gate |

## Candidates compared

### 1. IBCAO V5.2 (recommended)

Primary sources:

- [GEBCO IBCAO product page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean) — V5.2 released June 2026; 100 m / 200 m / 400 m GeoTIFF downloads; EPSG:3996; TID + SID grids.
- [Bolin Centre IBCAO 5.2 dataset record](https://bolin.su.se/data/ibcao-5.2) — DOI [10.17043/ibcao-5.2](https://doi.org/10.17043/ibcao-5.2); license **Open Data Commons Attribution (ODC-By)**; citation and file list.
- [Jakobsson et al. 2024, *Scientific Data*](https://doi.org/10.1038/s41597-024-04278-w) — IBCAO Version 5.0 methods, BedMachine coastal role, TID/SID quality guidance.

Facts that matter for v1:

- Goal: digital grid of available bathymetry **north of 64°N** for mapmakers and researchers ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean)).
- Native product: **100×100 m** Polar Stereographic (EPSG:3996, true scale 75°N), WGS 84 horizontal; vertical assumed MSL with older-source datum caveats ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean); [Bolin 5.2](https://bolin.su.se/data/ibcao-5.2)).
- IBCAO is the Arctic regional compilation **included in the global GEBCO grid** ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean); [Bolin 5.2](https://bolin.su.se/data/ibcao-5.2)).
- V5.2 changelog: “Moderate increase in seafloor data in the **Greenland coastal waters**…” plus BedMachine / Mareano / NONNA updates ([Bolin 5.2 version history](https://bolin.su.se/data/ibcao-5.2)).
- Companion **TID** (measurement method) and **SID** (source id) grids ship with the DTM ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean)).
- Explicit disclaimer: **must NOT be used for navigation or safety at sea**; grid resolution may greatly exceed underlying sounding density ([GEBCO IBCAO disclaimer](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean); [Bolin comments](https://bolin.su.se/data/ibcao-5.2)).

### 2. GEBCO_2026 (coarser global / Arctic geographic form)

Primary sources:

- [GEBCO gridded bathymetry data](https://www.gebco.net/data-products/gridded-bathymetry-data) — GEBCO_2026 published 23 Apr 2026; 15 arc-second global grid + TID.
- [GEBCO terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use) — public domain; free to copy/adapt/commercially exploit; attribution required; **not for navigation**.
- Attribution form on the download page: *GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid…* doi:[10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa](https://doi.org/10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa).

Facts that matter for v1:

- Global land+ocean terrain at **15″** (~450 m cell spacing at the equator; longitudinally tighter at high latitude, but still much coarser than IBCAO’s 100 m polar product) ([GEBCO download page](https://www.gebco.net/data-products/gridded-bathymetry-data)).
- Arctic contribution comes from the IBCAO/Seabed 2030 regional centre; IBCAO also publishes a **15″ geographic** Arctic extract for GEBCO ([Bolin 5.2](https://bolin.su.se/data/ibcao-5.2); [Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w)).
- Same “not for navigation / as-is / interpolated resolution ≠ sounding resolution” disclaimer as other GEBCO products ([terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)).

**Bake-off verdict vs IBCAO:** For West Greenland dogfood, GEBCO alone leaves readable seafloor topography on the table. Prefer the native IBCAO 100 m grid, then downsample for low zoom if needed. Use GEBCO_2026 only if a nationwide south-of-64°N band is required later without stitching a second Arctic product.

### 3. Alternatives (not v1 winners)

| Alternative | Role | Why not v1 primary |
|---|---|---|
| **BedMachine Greenland alone** (NSIDC IDBMG4 v6, 150 m; DOI [10.5067/6B6B225B8V2D](https://doi.org/10.5067/6B6B225B8V2D)) | Coastal/fjord + ice-sheet bed compilation already **folded into IBCAO** near the coast ([Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w)) | Not a full shelf/ocean product; NASA Earthdata login; dual-use under IBCAO is cleaner |
| **Open Waters Seascape** tiles ([README](https://github.com/openwatersio/seascape)) | Pre-tiled Terrarium DEM + vector contours for MapLibre; CC BY 4.0 tiles; GEBCO base | Greenland has **no finer regional source ingested**; IBCAO is still an open candidate blocked on licence ambiguity ([sources catalog](https://github.com/openwatersio/seascape/blob/main/sources/README.md) #38). Useful as online reference (as in `marine-poc`), not as max-resolution West Greenland owner |
| **EMODnet Bathymetry** | ~115 m European seas; in Seascape | Does not replace IBCAO for West Greenland coastal waters |
| **CHS NONNA / Siku stack** | Canadian community+CHS depth | No free Greenland equivalent; out of scope for open-grid v1 |
| **Official Danish/Greenlandic hydro charts / ENC** | Chart-grade authority | Explicit follow-on [#7](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/7); not a v1 gate |

## Nearshore usefulness — Qaarsut→Kullorsuaq

Corridor facts:

- Both ends lie well **north of 64°N**, so the corridor is inside the IBCAO domain ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean)).
- West Greenland fjords around Uummannaq/Qaarsut have historically received multibeam and campaign data that BedMachine and later IBCAO versions absorb (e.g. Weinrebe et al. / OMG-era compilations described in [Morlighem et al. 2017](https://doi.org/10.1002/2017GL074954)); coverage is still uneven.

What IBCAO authors say about Greenland coasts:

1. **BedMachine is the primary coastal filler.** In IBCAO 5.0, BedMachine Greenland is used **primarily along the Greenland coast**; beyond about **>50 km from the coast**, the IBCAO compilation algorithm takes over ([Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w)).
2. **“Mapped” ≠ every cell has a sounding.** IBCAO 5.0 stopped counting BedMachine extent as mapped and instead counts underlying source soundings, so large interpolated areas remain ([Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w)). Only ~25.5% of the Seabed 2030 Arctic area was mapped by that stricter rule at V5.0.
3. **Narrow fjords can be algorithmically steered.** Steering points are sometimes inserted so sparsely sounded fjords do not “landfill” during spline gridding ([Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w)). Readable water shape ≠ survey density.
4. **BedMachine itself mixes measured and synthetic fjord bathymetry.** Poorly charted fjords used synthetic parabolic profiles ([Morlighem et al. 2017](https://doi.org/10.1002/2017GL074954)); true resolution “varies between 150 m and 5 km” ([NSIDC BedMachine v6 user guide](https://nsidc.org/sites/default/files/documents/user-guide/idbmg4-v006-userguide.pdf)).
5. **Quality is inspectable.** Use the IBCAO **TID grid with the DTM** to see whether a cell is multibeam, singlebeam, chart-derived, pre-generated grid, or interpolation ([Jakobsson et al. 2024](https://doi.org/10.1038/s41597-024-04278-w); TID codes in same paper Table 2).

Implications for meter bands on the corridor:

- Expect **Siku-like readable shelf/fjord topography** where soundings or BedMachine constraints exist.
- Expect **smooth, uncertain bands** in sparsely sounded pockets — label gaps using TID (and optionally SID), do not present as chart soundings.
- Vertical datum is approximately MSL; older chart-derived inputs may sit on chart datum ([GEBCO IBCAO page](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean)). Do not claim LAT/chart-datum shoal clearance.

## License and attribution

### IBCAO V5.2

- License: **ODC-By** ([Bolin 5.2](https://bolin.su.se/data/ibcao-5.2); [ODC-By 1.0](https://opendatacommons.org/licenses/by/1-0/)).
- Practical requirements: attribute the source; do not misrepresent; share-alike does **not** apply (ODC-By is attribution-only).
- Suggested citation (dataset): Jakobsson et al. (2026), IBCAO Version 5.2, DOI [10.17043/ibcao-5.2](https://doi.org/10.17043/ibcao-5.2); methods paper DOI [10.1038/s41597-024-04278-w](https://doi.org/10.1038/s41597-024-04278-w).
- Hard constraint from distributor: **not for navigation / safety at sea** ([GEBCO IBCAO disclaimer](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean)).

### GEBCO_2026

- Placed in the **public domain**; free to copy, adapt, commercially exploit ([terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)).
- Must acknowledge source; must not imply GEBCO/IHO/IOC endorsement ([terms of use](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)).
- Same navigation ban.

### Open Waters Seascape (reference tiles only)

- Tile compilation: **CC BY 4.0** with Open Waters attribution; underlying grids keep their own terms ([Seascape README](https://github.com/openwatersio/seascape)).
- Also: **not for navigational use** ([Seascape README](https://github.com/openwatersio/seascape)).

## MapLibre tiling path (v1)

Target UX (from map #3): hillshade + ocean **meter bands**, nationwide where tiles exist, plus offline corridor pack Qaarsut→Kullorsuaq. Reimplement in `web/`; do not merge `marine-poc/`.

### A. Preferred production path — self-tile IBCAO

1. **Download** IBCAO V5.2 100 m bathymetry GeoTIFF (and matching TID) from [GEBCO IBCAO downloads](https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean) or [Bolin 5.2](https://bolin.su.se/data/ibcao-5.2). Prefer the “without Greenland Ice Sheet surface” / depth product for ocean work; keep ice-surface variant only if land relief is co-tiled from the same file.
2. **Clip** West Greenland / corridor extent; keep depths as elevation (negative down) or invert consistently for encoding.
3. **Warp** to a tiling CRS suitable for Web Mercator clients (`gdalwarp` → EPSG:3857 or EPSG:4326 intermediate, as required by the encoder).
4. **Encode raster-dem tiles** as Terrarium or Mapbox Terrain-RGB:
   - MapLibre `raster-dem` supports `encoding: "terrarium" | "mapbox" | "custom"` ([MapLibre Style Spec — sources](https://maplibre.org/maplibre-style-spec/sources/)).
   - Default encoding is **mapbox**; open Terrarium tiles must set `"encoding": "terrarium"` explicitly ([same spec](https://maplibre.org/maplibre-style-spec/sources/); [RasterDEMTileSource](https://maplibre.org/maplibre-gl-js/docs/API/classes/RasterDEMTileSource/)).
   - Tooling: [`rio-rgbify`](https://github.com/mapbox/rio-rgbify) → MBTiles, or a Terrarium-capable encoder → PMTiles.
5. **Package** as PMTiles/XYZ for online CDN and for the offline corridor pack.
6. **Style in MapLibre:**
   - `hillshade` layer on the `raster-dem` source (same pattern as `marine-poc` Seascape usage, but with owned tiles).
   - **Meter bands:** either (a) precompute vector isobaths (`gdal_contour` / similar → Tippecanoe/PMTiles MVT with depth properties) and fill/line-style by breaks, or (b) client-side stepped color-relief from decoded DEM if the stack supports it. Contour MVT matches the Seascape reference UX without depending on their mosaic.
7. **Gap labeling:** tile a low-res TID (and optional SID) overlay or bake “measured vs interpolated” masks so the UI can mark sparse cells — aligns with Jakobsson et al.’s guidance to read TID with the DTM.
8. **Attribution + safety copy** in the style `attribution` and UI disclaimer (see below).

Suggested zoom budget for 100 m source: about **z0–z11** useful detail (overzoom with care); corridor pack can bias storage to z7–z12 over the Qaarsut→Kullorsuaq bbox.

### B. Bootstrap / reference path — Seascape online only

`marine-poc` already composes OpenFreeMap Liberty + Seascape Terrarium DEM + contour MVT (`marine-poc/src/map/basemap.ts`). Keep that as a visual reference. For West Greenland it is effectively **GEBCO-scale** until Seascape ingests IBCAO ([sources README #38](https://github.com/openwatersio/seascape/blob/main/sources/README.md)). Do not merge marine-poc into `web/`.

### C. Nationwide note

IBCAO stops being the dedicated polar product south of its domain; Greenland’s southern tip needs GEBCO_2026 (or a future multi-resolution GEBCO product) if nationwide ocean bands are required. V1 dogfood corridor does not need that stitch.

## “Not for navigation” implications

These are product requirements, not optional footnotes:

1. **UI copy:** state clearly that ocean depth is open-grid topography for orientation, **not** a nautical chart; users must use official charts for navigation (IBCAO + GEBCO + Seascape disclaimers all require this).
2. **No chart semantics in v1:** no safety contour as a navigation warning, no spot-sounding authority, no hazard/obstruction layers claimed from the open grid.
3. **Do not imply endorsement** by GEBCO, IHO, IOC, or IBCAO ([GEBCO terms](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)).
4. **Keep official hydro on the #7 track** so chart-grade licensing can land later without rewriting the open-grid tile pipeline.
5. **Gap labels are honesty features**, not polish: interpolated TID cells and synthetic-fjord heritage mean some meter bands will look continuous and still be weakly constrained.

## What v1 should ship

1. IBCAO V5.2–derived `raster-dem` (Terrarium) + hillshade in `web/`.
2. Vector or classified **meter bands** from the same clipped grid.
3. Offline PMTiles corridor for Qaarsut→Kullorsuaq.
4. Visible attribution (IBCAO/GEBCO) + not-for-navigation disclaimer.
5. Optional TID-informed “sparse/interpolated” labeling where practical.

## Sources (primary)

1. GEBCO — International Bathymetric Chart of the Arctic Ocean (IBCAO): https://www.gebco.net/data-products/gridded-bathymetry-data/arctic-ocean  
2. Bolin Centre — IBCAO Version 5.2 dataset: https://bolin.su.se/data/ibcao-5.2 · DOI https://doi.org/10.17043/ibcao-5.2  
3. Jakobsson, M. et al. (2024). The International Bathymetric Chart of the Arctic Ocean Version 5.0. *Scientific Data* 11, 1420. https://doi.org/10.1038/s41597-024-04278-w  
4. GEBCO — Gridded Bathymetry Data (GEBCO_2026): https://www.gebco.net/data-products/gridded-bathymetry-data  
5. GEBCO — Terms of use for the GEBCO Grid: https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use  
6. Open Data Commons Attribution License (ODC-By) 1.0: https://opendatacommons.org/licenses/by/1-0/  
7. MapLibre Style Specification — Sources (`raster-dem`, encodings): https://maplibre.org/maplibre-style-spec/sources/  
8. MapLibre GL JS — `RasterDEMTileSource`: https://maplibre.org/maplibre-gl-js/docs/API/classes/RasterDEMTileSource/  
9. Morlighem, M. et al. (2017). BedMachine v3… *Geophysical Research Letters*. https://doi.org/10.1002/2017GL074954  
10. NSIDC — IceBridge BedMachine Greenland, Version 6: https://nsidc.org/data/idbmg4/versions/6 · User guide PDF  
11. Open Waters Seascape — README + sources catalog: https://github.com/openwatersio/seascape  
12. mapbox/rio-rgbify: https://github.com/mapbox/rio-rgbify  
