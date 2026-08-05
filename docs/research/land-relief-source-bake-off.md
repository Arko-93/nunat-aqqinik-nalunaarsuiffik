# Research: Land relief source bake-off for Greenland

**Ticket:** [#4](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/4) · Map: [#3](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/3)  
**Question:** Which land elevation source should power v1 hillshade / relief on the main `web/` terrain-first map for Greenland (e.g. ArcticDEM vs existing free terrain tiles), considering license, resolution, offline redistribution for the Qaarsut→Kullorsuaq corridor pack, and MapLibre integration effort?  
**Date:** 2026-08-05

## Recommendation (one-liner)

**v1: Mapterhorn Terrarium `raster-dem` tiles** (Greenland land at 2 m from Klimadatastyrelsen’s Elevation model Greenland), online via TileJSON / zxy and offline via `pmtiles extract` corridor packs — not MapTiler Cloud and not a from-scratch ArcticDEM tile bake for v1.

## Candidates compared

| Option | Nominal Greenland land resolution | License / redistribute offline pack | MapLibre effort | Verdict |
|---|---|---|---|---|
| **Mapterhorn** (Terrarium WebP, 512 px) | **2 m** over Greenland (`dkgreenland`)[^mapterhorn][^attr-json] | Source DEM **CC BY 4.0**; code BSD-3; free public tiles + PMTiles downloads[^mapterhorn][^attr-json][^data-access] | Drop-in `raster-dem` + `encoding: "terrarium"`; official MapLibre 3D terrain example uses it[^ml-3d][^mh-readme] | **v1 pick** |
| **Klimadatastyrelsen / ArcticDEM bake yourself** | 2 m mosaic (ArcticDEM + GIMP + TREx)[^df-4780]; ArcticDEM mosaics also 2 / 10 / 32 m[^arcticdem] | ArcticDEM / REMA **CC BY 4.0** (Alaska Jun 2022+ excluded — not our AOI)[^pgc-license][^eocl]; KDS free geo data CC BY 4.0[^attr-json][^df-4780] | High: download GeoTIFF → Terrarium/Mapbox RGB → PMTiles | **v2 / control path** |
| **AWS Mapzen Terrain Tiles** (Terrarium) | ArcticDEM strips in composite; older Joerd build; zooms use ArcticDEM above 60°N[^joerd-src] | Per-source attribution; ArcticDEM historically “use / distribute / modify without permission”[^joerd-attr]; S3 open dataset[^aws-tt] | Low (same Terrarium encoding) | Fallback only — coarser / stale vs Mapterhorn Greenland |
| **MapTiler Terrain-RGB** | Productized Terrain RGB (API key)[^mt-news] | Cloud/API: licensed, not sold; **no redistrib** without written agreement; on-prem Terrain RGB needs paid data package / multi-license for third-party redistrib[^mt-terms][^mt-multi] | Low online; **blocked** for free offline corridor pack | Reject for v1 offline |
| **OpenFreeMap Liberty** (current `web/` style) | No DEM — vector basemap only[^ofm] | MIT project; OSM data attribution[^ofm] | Already wired; `maxPitch: 0` today[^mapcanvas] | Keep as basemap; add DEM source separately |

## License and offline constraints

### What v1 needs

The map ticket requires a Google Maps–like offline corridor pack for Qaarsut→Kullorsuaq.[^issue3] Companion research already chose **PMTiles `raster-dem` Terrarium** as the land-relief file in that pack.[^corridor]

So the DEM source must allow:

1. Public display with attribution.
2. Building / shipping derived Terrarium tiles in a downloadable pack.
3. Reasonable MapLibre wiring in `web/` (no marine-poc merge).[^issue3]

### Mapterhorn + Klimadatastyrelsen Greenland DEM

- Mapterhorn lists **Denmark, Greenland, 2 m** and attributes source `dkgreenland` → [Elevation model Greenland](https://dataforsyningen.dk/data/4780), producer Klimadatastyrelsen, license **CC BY 4.0**.[^mapterhorn][^attr-json]
- Dataforsyningen describes the product as a 2 m × 2 m surface model covering all of Greenland, built from **ArcticDEM, GIMP, and TREx**, free for public sector, private companies, associations, and private use.[^df-4780]
- CC BY 4.0 grants worldwide rights to reproduce, share, and create adapted material (including commercial use), with attribution and no extra downstream restrictions.[^cc-by]
- Mapterhorn publishes Terrarium WebP tiles and **PMTiles archives** with documented `pmtiles extract --bbox=…` for area packs.[^data-access]
- MapLibre’s own 3D terrain example points at `https://tiles.mapterhorn.com/tilejson.json`.[^ml-3d]
- TileJSON reports `"encoding":"terrarium"`, `"tileSize":512`.[^tilejson]

**Attribution for Greenland packs (minimum):** Klimadatastyrelsen Elevation model Greenland (CC BY 4.0) + link to license; retain Mapterhorn / PGC acknowledgements as applicable when the upstream DEM includes ArcticDEM.[^attr-json][^pgc-ack][^df-4780]

### ArcticDEM (PGC) alone

- Full Arctic coverage including Greenland; mosaics at 2 m (50 km tiles), plus 10 m / 32 m and coarser domain mosaics; heights on WGS84 ellipsoid.[^arcticdem]
- Published under **CC BY 4.0**; may be used, distributed, and modified; Alaska Jun 2022–present is the EOCL exception (irrelevant to Greenland corridor).[^pgc-license][^eocl]
- PGC acknowledgement / citation still required for DEM use.[^pgc-ack]
- **Not MapLibre-ready as GeoTIFF.** Must encode Terrain-RGB or Terrarium and host as tiles / PMTiles — days of pipeline work vs hours with Mapterhorn extracts.
- Note: ArcticDEM is a **DSM** (vegetation / structures), with known pits/spikes and no hydrological enforcement.[^pgc-license] The Danish Greenland product is also a surface model and documents errors on some steep peaks >100 m.[^df-4780]

### Mapzen / AWS Terrain Tiles

- Global Terrarium / GeoTIFF / Skadi on `s3://elevation-tiles-prod` (no AWS account).[^aws-tt]
- Greenland land at higher zooms historically from ArcticDEM in the Joerd composite; dataset updates are not on a regular cadence (v1.1 era).[^joerd-src]
- Fine as emergency fallback; worse Greenland detail and freshness than Mapterhorn’s dedicated 2 m Greenland source.

### MapTiler

- Easy `raster-dem` via `api.maptiler.com/tiles/…/tiles.json?key=…`.[^mt-news]
- Terms: products licensed not sold; **may not resell or redistribute** without written agreement.[^mt-terms]
- Redistributing map data to other legal entities / bundling offline needs On-Prem Custom + multi-license.[^mt-multi]
- Conflicts with a free, redistributable corridor pack for family dogfood.

### OpenFreeMap

- Free vector styles (Liberty in use); no terrain DEM product.[^ofm][^mapcanvas]
- Keep for basemap; add a separate DEM source for hillshade / pitch.

## MapLibre integration path (v1)

Current `web/` map: OpenFreeMap Liberty, `maxPitch: 0`.[^mapcanvas]

1. Register PMTiles once (online CDN or offline OPFS), per Protomaps + MapLibre docs:[^pmtiles-ml]

   ```ts
   import { Protocol } from "pmtiles";
   const protocol = new Protocol();
   maplibregl.addProtocol("pmtiles", protocol.tile);
   ```

2. Online nationwide (or Greenland bbox) DEM — same pattern as the MapLibre 3D terrain example:[^ml-3d]

   ```ts
   map.addSource("land-relief", {
     type: "raster-dem",
     url: "https://tiles.mapterhorn.com/tilejson.json",
     // or tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
     // encoding: "terrarium", tileSize: 512
   });
   map.addLayer({
     id: "land-hillshade",
     type: "hillshade",
     source: "land-relief",
     paint: { "hillshade-shadow-color": "#473B24" },
   });
   // Optional later: style.terrain = { source: "land-relief", exaggeration: 1 }
   // and raise maxPitch above 0.
   ```

3. Offline corridor: `pmtiles extract` from Mapterhorn planet / high-zoom PMTiles for the Qaarsut→Kullorsuaq bbox; ship as `land-relief.pmtiles` in the pack; load with `pmtiles://…` + `encoding: "terrarium"`.[^data-access][^pmtiles-ml][^corridor]

4. Attribution control: append Klimadatastyrelsen + CC BY 4.0 (and Mapterhorn / ArcticDEM lineage as required).[^attr-json][^pgc-ack]

Effort estimate: **~0.5–1 day** to wire hillshade online in `web/`; corridor extract + pack hookup follows the offline-pack research (OPFS, not Cache-only).[^corridor]

## Alternatives (when to switch)

| Trigger | Switch to |
|---|---|
| Need ellipsoidal ArcticDEM strips / change detection / own vertical datum control | Bake PGC ArcticDEM mosaics → Terrarium PMTiles yourself[^arcticdem] |
| Mapterhorn CDN unreliable or terms change | Self-host Mapterhorn PMTiles mirrors / Source Cooperative copies[^data-access]; or bake from KDS FTP / ArcticDEM |
| Only need coarse preview, zero new deps | AWS Mapzen Terrarium S3 URLs[^aws-tt][^mh-readme] |
| Paid SLA + no offline redistrib | MapTiler Cloud (online only)[^mt-terms] |

## Open risks

1. **Public-instance durability** — Mapterhorn is donation / NGI0-backed open data; plan to pin a corridor PMTiles extract in our own hosting for the offline pack, not depend on live `tiles.mapterhorn.com` offline.[^mapterhorn][^data-access]
2. **Surface-model artifacts** — steep-peak errors in the Danish Greenland DEM; ArcticDEM DSM pits/spikes; hillshade-only v1 should label relief as visual context, not survey grade.[^df-4780][^pgc-license]
3. **Vertical datum** — ArcticDEM mosaics are ellipsoidal WGS84; Esri services may show geoid heights; confirm meter labels if we ever show spot elevations (hillshade alone is relative lighting).[^arcticdem]
4. **Attribution completeness** — Greenland DEM fuses ArcticDEM + GIMP + TREx; keep KDS attribution and PGC acknowledgements where ArcticDEM lineage applies.[^df-4780][^pgc-ack]
5. **Pack size** — 2 m source implies aggressive maxzoom / bbox discipline for the corridor; size budget still open on the map ticket.[^issue3][^corridor]
6. **Pitch / 3D** — enabling `terrain` requires raising `maxPitch`; v1 can ship 2D hillshade first.[^mapcanvas][^ml-3d]

## Sources

[^arcticdem]: Polar Geospatial Center — [ArcticDEM](https://www.pgc.umn.edu/data/arcticdem/) (mosaic resolutions, ellipsoid heights, public access except Alaska post–Jun 2022).
[^pgc-license]: PGC — [DEM Products – ArcticDEM, REMA, and EarthDEM](https://www.pgc.umn.edu/guides/stereo-derived-elevation-models/pgc-dem-products-arcticdem-rema-and-earthdem/) (CC BY 4.0; DSM limitations; Greenland in ArcticDEM domain).
[^eocl]: PGC — [EOCL License & PGC – FAQ](https://www.pgc.umn.edu/guides/commercial-imagery/eocl-license-pgc-faq/) (ArcticDEM/REMA public except Alaska).
[^pgc-ack]: PGC — [Acknowledgement Policy](https://www.pgc.umn.edu/guides/user-services/acknowledgement-policy/) (required DEM acknowledgements / citations).
[^mapterhorn]: Mapterhorn — [Home](https://mapterhorn.com/) (Greenland 2 m; BSD-3 code; open-data terrain).
[^attr-json]: Mapterhorn — [`attribution.json`](https://download.mapterhorn.com/attribution.json) (`dkgreenland`, CC BY 4.0, Klimadatastyrelsen).
[^data-access]: Mapterhorn — [Data Access](https://mapterhorn.com/data-access/) (zxy, TileJSON, PMTiles extract).
[^mh-readme]: Mapterhorn — [README](https://raw.githubusercontent.com/mapterhorn/mapterhorn/main/README.md) (migrate from AWS Terrarium; tileSize 512).
[^tilejson]: Mapterhorn — [`tilejson.json`](https://tiles.mapterhorn.com/tilejson.json).
[^df-4780]: Klimadatastyrelsen / Dataforsyningen — [Højdemodel Grønland (data/4780)](https://dataforsyningen.dk/data/4780) (2 m surface model; ArcticDEM+GIMP+TREx; free use statement).
[^cc-by]: Creative Commons — [CC BY 4.0 Legal Code](https://creativecommons.org/licenses/by/4.0/legalcode.en).
[^ml-3d]: MapLibre GL JS — [3D Terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/) (Mapterhorn TileJSON + hillshade + terrain).
[^ml-raster-dem]: MapLibre Style Spec — [`raster-dem` source](https://maplibre.org/maplibre-style-spec/sources/#raster-dem) (Terrarium / Mapbox encodings).
[^pmtiles-ml]: Protomaps — [PMTiles for MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre/) (`addProtocol`; Terrarium `raster-dem`).
[^aws-tt]: AWS Open Data — [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (`elevation-tiles-prod`).
[^joerd-src]: Tilezen Joerd — [data-sources.md](https://raw.githubusercontent.com/tilezen/joerd/master/docs/data-sources.md) (ArcticDEM above 60°N; update cadence).
[^joerd-attr]: Tilezen Joerd — [attribution.md](https://raw.githubusercontent.com/tilezen/joerd/master/docs/attribution.md) (ArcticDEM redistribute language / NSF citation).
[^mt-terms]: MapTiler — [Terms](https://www.maptiler.com/terms/) (license only; no redistrib without agreement).
[^mt-multi]: MapTiler Docs — [What is a Multi-license](https://docs.maptiler.com/guides/self-hosting/self-hosted-maps/what-is-a-multi-license-and-when-do-i-need-it/).
[^mt-news]: MapTiler — [MapLibre v2 3D terrain](https://www.maptiler.com/news/2022/05/maplibre-v2-add-3d-terrain-to-your-map/) (Terrain-RGB API pattern).
[^ofm]: OpenFreeMap — [Home](https://openfreemap.org/) (vector styles; OSM; no DEM).
[^mapcanvas]: Repo — `web/src/ui/MapCanvas.tsx` (OpenFreeMap Liberty, `maxPitch: 0`).
[^issue3]: GitHub — [Terrain-first Decision Geography map (#3)](https://github.com/Arko-93/nunat-aqqinik-nalunaarsuiffik/issues/3).
[^corridor]: Repo — [`docs/research/offline-corridor-pack-pattern.md`](./offline-corridor-pack-pattern.md) (PMTiles Terrarium land-relief pack shape).
