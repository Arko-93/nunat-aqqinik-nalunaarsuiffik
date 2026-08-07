import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  LAND_BREAKS_M,
  METER_BAND_POLICY,
  OCEAN_BREAKS_M,
  OCEAN_CONTOUR_DETAIL_BREAKS_M,
  OCEAN_CONTOUR_DETAIL_MIN_ZOOM,
  OCEAN_CONTOUR_OVERVIEW_BREAKS_M,
  oceanFillColorExpression,
} from "./meter-bands.ts";
import {
  assertMaskAboveOcean,
  assertOceanUnderLand,
  COASTLINE_MASK_ATTRIBUTION,
  COASTLINE_MASK_PMTILES_URL,
  LAND_DEM_ATTRIBUTION,
  LAND_DEM_TILEJSON,
  LAND_PEAKS_MAX_ZOOM,
  LAND_PEAKS_PMTILES_URL,
  LAND_RELIEF_PACK_MAX_ZOOM,
  LAND_RELIEF_PACK_TILE_SIZE,
  OCEAN_DEPTH_ATTRIBUTION,
  OCEAN_DEPTH_DEM_MAX_ZOOM,
  OCEAN_DEPTH_DEM_PMTILES_URL,
  OCEAN_DEPTH_VECTOR_MAX_ZOOM,
  OCEAN_DEPTH_VECTOR_PMTILES_URL,
  composeNameOwnedLibertyStyle,
  composeTerrainStyle,
  contourBreakFilter,
  expressionPrefersEnglishFirstName,
  hasEnglishFirstGeographyLabels,
  oceanFillFilter,
  oceanInsertBeforeId,
  parseLibertyStyle,
  TERRAIN_LAYER_IDS,
} from "./terrain-style.ts";

/** Liberty-like coalesce that prefers English before native name. */
const englishFirstTextField = [
  "coalesce",
  ["get", "name_en"],
  ["get", "name"],
] as const;

const libertyStub = {
  version: 8,
  sources: {
    openmaptiles: { type: "vector", url: "https://example.test/tiles" },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f8f4f0" },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#9ebdff", "fill-opacity": 1 },
    },
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: { "fill-color": "#d8e8c8", "fill-opacity": 0.6 },
    },
    {
      id: "label_other",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: { "text-field": [...englishFirstTextField] },
    },
    {
      id: "water_name_point_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      layout: { "text-field": [...englishFirstTextField] },
    },
    {
      id: "waterway_line_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "waterway",
      layout: { "text-field": [...englishFirstTextField] },
    },
    {
      id: "mountain_peak_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      layout: { "text-field": [...englishFirstTextField] },
    },
    {
      id: "highway-name-major",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      layout: { "text-field": [...englishFirstTextField] },
    },
  ],
} as StyleSpecification;

describe("composeTerrainStyle (hybrid D)", () => {
  it("adds land DEM + ocean sources with safety metadata", () => {
    const style = composeTerrainStyle(libertyStub);
    expect(style.sources?.["land-relief"]).toBeTruthy();
    expect(style.sources?.["ocean-depth-dem"]).toBeTruthy();
    expect(style.sources?.["ocean-depth-vector"]).toBeTruthy();
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:basemap"]).toBe("terrain-first");
    expect(meta["nunat:safety"]).toBe("not-for-navigation");
    expect(meta["nunat:meter-bands"]).toBe(METER_BAND_POLICY.key);
    expect(meta["nunat:land-peak-bands"]).toBe("500-1000-2000");
    expect(meta["nunat:land-peaks-only"]).toBe(true);
    expect(meta["nunat:tile-gap-labels"]).toBe("visible");
    expect(meta["nunat:ocean-under-land"]).toBe(true);
    expect(JSON.stringify(style.layers)).toContain("peak-bands");
    expect(meta["nunat:contour-field"]).toBe("depth_abs_m");
    expect(meta["nunat:land-peak-fill"]).toBe("discrete-color-relief-mapterhorn");
    expect(meta["nunat:land-peak-resampling"]).toBe("nearest");
    expect(meta["nunat:ocean-fill"]).toBe("discrete-step-drval1-metric");
    expect(meta["nunat:land-breaks-m"]).toEqual([...LAND_BREAKS_M]);
    // Product ocean source is self-tiled IBCAO/GEBCO, never Seascape.
    expect(meta["nunat:ocean-source"]).toBe("ibcao-v5.2");
    expect(meta["nunat:ocean-fallback"]).toBe("gebco-2026");
    expect(JSON.stringify(style)).not.toContain("openwaters");
    expect(JSON.stringify(style)).not.toContain("seascape");
  });

  it("serves the product ocean from hosted IBCAO/GEBCO PMTiles (no Seascape)", () => {
    const style = composeTerrainStyle(libertyStub);
    const sources = style.sources as Record<string, Record<string, unknown>>;
    const dem = sources["ocean-depth-dem"];
    expect(dem["type"]).toBe("raster-dem");
    expect(dem["tiles"]).toEqual([
      `${OCEAN_DEPTH_DEM_PMTILES_URL}/{z}/{x}/{y}`,
    ]);
    expect(dem["tileSize"]).toBe(256);
    expect(dem["maxzoom"]).toBe(OCEAN_DEPTH_DEM_MAX_ZOOM);
    expect(dem["encoding"]).toBe("terrarium");
    expect(dem["url"]).toBeUndefined();
    const vector = sources["ocean-depth-vector"];
    expect(vector["type"]).toBe("vector");
    expect(vector["tiles"]).toEqual([
      `${OCEAN_DEPTH_VECTOR_PMTILES_URL}/{z}/{x}/{y}`,
    ]);
    expect(vector["maxzoom"]).toBe(OCEAN_DEPTH_VECTOR_MAX_ZOOM);
    expect(vector["url"]).toBeUndefined();
    // The Seascape interim sources are gone from the product path.
    expect(JSON.stringify(style.sources)).not.toContain("openwaters.io");
    expect(JSON.stringify(style.sources)).not.toContain("raster.json");
    expect(JSON.stringify(style.sources)).not.toContain("vector.json");
    const attribution = String(vector["attribution"]);
    expect(attribution).toContain("IBCAO");
    expect(attribution).toContain("GEBCO");
    expect(attribution).toContain("not for navigation");
    expect(attribution).toBe(OCEAN_DEPTH_ATTRIBUTION);
  });

  it("keeps ocean hillshade and fills under land", () => {
    const style = composeTerrainStyle(libertyStub);
    const ids = (style.layers ?? []).map((layer) => layer.id);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanHillshade);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanFills);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContours);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContoursDetail);
    expect(ids).toContain(TERRAIN_LAYER_IDS.landHillshade);
    expect(assertOceanUnderLand(ids)).toEqual({ ok: true });
    expect(ids.indexOf(TERRAIN_LAYER_IDS.oceanFills)).toBeLessThan(
      ids.indexOf("landcover"),
    );
  });

  it("fades DEM hillshade and keeps soft major contours at detail zoom", () => {
    const style = composeTerrainStyle(libertyStub);
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:ocean-contour-thinning"]).toBe("zoom-major");
    expect(meta["nunat:ocean-contour-hierarchy"]).toBe("index-intermediate");
    expect(meta["nunat:ocean-contour-overview-breaks-m"]).toEqual([
      ...OCEAN_CONTOUR_OVERVIEW_BREAKS_M,
    ]);
    expect(meta["nunat:ocean-contour-detail-breaks-m"]).toEqual([
      ...OCEAN_CONTOUR_DETAIL_BREAKS_M,
    ]);
    expect(meta["nunat:ocean-contour-detail-minzoom"]).toBe(
      OCEAN_CONTOUR_DETAIL_MIN_ZOOM,
    );

    const hillshade = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanHillshade,
    ) as
      | {
          paint?: { "hillshade-exaggeration"?: unknown };
        }
      | undefined;
    const exaggeration = JSON.stringify(
      hillshade?.paint?.["hillshade-exaggeration"],
    );
    expect(exaggeration).toContain("interpolate");
    expect(exaggeration).toContain("0");

    const fills = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanFills,
    ) as
      | {
          maxzoom?: number;
          paint?: { "fill-outline-color"?: string };
        }
      | undefined;
    expect(fills?.maxzoom).toBe(OCEAN_CONTOUR_DETAIL_MIN_ZOOM);
    expect(fills?.paint?.["fill-outline-color"]).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)/);

    const overview = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanContours,
    ) as
      | {
          filter?: unknown;
          maxzoom?: number;
          paint?: {
            "line-opacity"?: unknown;
            "line-width"?: unknown;
            "line-color"?: unknown;
          };
        }
      | undefined;
    expect(overview?.maxzoom).toBe(OCEAN_CONTOUR_DETAIL_MIN_ZOOM);
    expect(JSON.stringify(overview?.filter)).toContain("100");
    expect(JSON.stringify(overview?.filter)).toContain("1000");
    expect(JSON.stringify(overview?.filter)).not.toContain('"5"');
    expect(JSON.stringify(overview?.paint?.["line-width"])).toContain("match");
    expect(JSON.stringify(overview?.paint?.["line-color"])).toContain("match");

    const detail = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanContoursDetail,
    ) as
      | {
          filter?: unknown;
          minzoom?: number;
          paint?: {
            "line-opacity"?: unknown;
            "line-width"?: unknown;
            "line-color"?: unknown;
          };
        }
      | undefined;
    expect(detail?.minzoom).toBe(OCEAN_CONTOUR_DETAIL_MIN_ZOOM);
    const detailFilter = JSON.stringify(detail?.filter);
    // Full Hybrid D at detail — shallow 5 m through 1000 m.
    expect(detailFilter).toContain("5");
    expect(detailFilter).toContain("10");
    expect(detailFilter).toContain("50");
    expect(detailFilter).toContain("100");
    expect(detailFilter).toContain("1000");
    const detailWidth = JSON.stringify(detail?.paint?.["line-width"]);
    expect(detailWidth).toContain("match");
    // Quiet hierarchy: index thicker than shallow, neither chart-bold.
    expect(detailWidth.indexOf("1.2")).toBeGreaterThan(-1);
    expect(detailWidth.indexOf("0.4")).toBeGreaterThan(-1);
    expect(JSON.stringify(detail?.paint?.["line-opacity"])).toContain("match");
    expect(JSON.stringify(detail?.paint?.["line-color"])).toContain("#4a7f96");

    const labels = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanContourLabels,
    ) as
      | {
          filter?: unknown;
          layout?: { "text-size"?: unknown; "symbol-spacing"?: unknown };
        }
      | undefined;
    const labelFilter = JSON.stringify(labels?.filter);
    expect(labelFilter).toContain("case");
    expect(labelFilter).toContain("100");
    expect(labelFilter).toContain("1000");
    // Shallow labels gated to close zoom in the case ladder.
    expect(labelFilter).toContain("11");
    // Layout only allows zoom expressions (not feature match).
    expect(JSON.stringify(labels?.layout?.["text-size"])).toContain(
      "interpolate",
    );
    expect(JSON.stringify(labels?.layout?.["symbol-spacing"])).toContain(
      "interpolate",
    );
  });

  it("sits the complete coastline mask above every ocean layer", () => {
    const style = composeTerrainStyle(libertyStub);
    const ids = (style.layers ?? []).map((layer) => layer.id);
    const maskIdx = ids.indexOf(TERRAIN_LAYER_IDS.coastlineMask);
    expect(maskIdx).toBeGreaterThanOrEqual(0);
    for (const oceanId of [
      TERRAIN_LAYER_IDS.oceanHillshade,
      TERRAIN_LAYER_IDS.oceanFills,
      TERRAIN_LAYER_IDS.oceanContours,
      TERRAIN_LAYER_IDS.oceanContoursDetail,
      TERRAIN_LAYER_IDS.oceanContourLabels,
    ]) {
      expect(ids.indexOf(oceanId)).toBeLessThan(maskIdx);
    }
    // Land relief stays visible above the mask.
    expect(ids.indexOf(TERRAIN_LAYER_IDS.landHillshade)).toBeGreaterThan(
      maskIdx,
    );
    expect(assertMaskAboveOcean(ids)).toEqual({ ok: true });
  });

  it("serves peaks-only color-relief bands above mask + hillshade, below labels", () => {
    const style = composeTerrainStyle(libertyStub);
    const sources = style.sources as Record<string, Record<string, unknown>>;
    const peaks = sources["land-peaks"];
    // Raster (not raster-dem: colors are baked at build time) served from
    // the same-origin package with explicit z/x/y tile URLs, 256 px,
    // capped at the archive maxzoom so z11+ overzooms.
    expect(peaks["type"]).toBe("raster");
    expect(peaks["tiles"]).toEqual([`${LAND_PEAKS_PMTILES_URL}/{z}/{x}/{y}`]);
    expect(peaks["tileSize"]).toBe(256);
    expect(peaks["maxzoom"]).toBe(LAND_PEAKS_MAX_ZOOM);
    expect(peaks["url"]).toBeUndefined();
    expect(String(peaks["attribution"])).toBe(LAND_DEM_ATTRIBUTION);
    expect(String(peaks["attribution"])).toContain("CC BY 4.0");

    const layer = style.layers?.find(
      (candidate) => candidate.id === TERRAIN_LAYER_IDS.landPeakBands,
    ) as
      | {
          type?: string;
          source?: string;
          paint?: { "raster-resampling"?: string };
        }
      | undefined;
    expect(layer?.type).toBe("raster");
    expect(layer?.source).toBe("land-peaks");
    expect(layer?.paint?.["raster-resampling"]).toBe("nearest");

    // Order: above the coastline mask + opaque land hillshade (a raster
    // under the hillshade would be invisible), below the basemap land
    // fills and every label. Peaks never sit under the mask.
    const ids = (style.layers ?? []).map((candidate) => candidate.id);
    const peaksIdx = ids.indexOf(TERRAIN_LAYER_IDS.landPeakBands);
    expect(peaksIdx).toBeGreaterThan(
      ids.indexOf(TERRAIN_LAYER_IDS.coastlineMask),
    );
    expect(peaksIdx).toBeGreaterThan(ids.indexOf(TERRAIN_LAYER_IDS.landHillshade));
    expect(peaksIdx).toBeLessThan(ids.indexOf("landcover"));
    const firstSymbol = ids.findIndex((id) => {
      if (id.startsWith("terrain-")) return false;
      const candidate = style.layers?.find((layerEntry) => layerEntry.id === id);
      return candidate?.type === "symbol";
    });
    expect(peaksIdx).toBeLessThan(firstSymbol);
    expect(assertMaskAboveOcean(ids)).toEqual({ ok: true });
  });

  it("adds the OSM coastline PMTiles mask source with ODbL attribution", () => {
    const style = composeTerrainStyle(libertyStub);
    const source = style.sources?.["coastline-land"] as
      | { type?: string; url?: string; attribution?: string }
      | undefined;
    expect(source?.type).toBe("vector");
    expect(source?.url).toBe(COASTLINE_MASK_PMTILES_URL);
    expect(COASTLINE_MASK_PMTILES_URL).toMatch(/^pmtiles:\/\//);
    expect(source?.attribution).toContain("OpenStreetMap");
    expect(source?.attribution).toContain("ODbL");
    const maskLayer = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.coastlineMask,
    ) as
      | { type?: string; source?: string; "source-layer"?: string }
      | undefined;
    expect(maskLayer?.type).toBe("fill");
    expect(maskLayer?.source).toBe("coastline-land");
    expect(maskLayer?.["source-layer"]).toBe("land");
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:coastline-source"]).toBe("osm-land-polygons");
    expect(meta["nunat:coastline-licence"]).toBe("ODbL");
    expect(meta["nunat:ocean-under-land"]).toBe(true);
  });

  it("composes the offline pack style: same source ids, pack tile paths", () => {
    const style = composeTerrainStyle(libertyStub, { offline: true });
    const sources = style.sources as Record<string, Record<string, unknown>>;

    // Land relief: pack archive, native Mapterhorn 512 px through z10.
    const land = sources["land-relief"];
    expect(land["type"]).toBe("raster-dem");
    expect(land["tiles"]).toEqual([
      "pmtiles:///packages/qaarsut-kullorsuaq/land-relief.pmtiles/{z}/{x}/{y}",
    ]);
    expect(land["tileSize"]).toBe(LAND_RELIEF_PACK_TILE_SIZE);
    expect(land["tileSize"]).toBe(512);
    expect(land["maxzoom"]).toBe(LAND_RELIEF_PACK_MAX_ZOOM);
    expect(land["encoding"]).toBe("terrarium");
    expect(land["url"]).toBeUndefined();

    // Land peak bands: pack color-relief archive, same 256 px tile policy.
    const peaks = sources["land-peaks"];
    expect(peaks["type"]).toBe("raster");
    expect(peaks["tiles"]).toEqual([
      "pmtiles:///packages/qaarsut-kullorsuaq/land-peaks.pmtiles/{z}/{x}/{y}",
    ]);
    expect(peaks["tileSize"]).toBe(256);
    expect(peaks["maxzoom"]).toBe(LAND_PEAKS_MAX_ZOOM);
    expect(peaks["url"]).toBeUndefined();

    // Ocean depth: the pack carries the vector source (fills/contours) and
    // the raster DEM (ocean hillshade restored offline, issue #23).
    const oceanDem = sources["ocean-depth-dem"];
    expect(oceanDem["type"]).toBe("raster-dem");
    expect(oceanDem["tiles"]).toEqual([
      "pmtiles:///packages/qaarsut-kullorsuaq/ocean-depth-dem.pmtiles/{z}/{x}/{y}",
    ]);
    expect(oceanDem["tileSize"]).toBe(256);
    expect(oceanDem["maxzoom"]).toBe(OCEAN_DEPTH_DEM_MAX_ZOOM);
    expect(oceanDem["encoding"]).toBe("terrarium");
    expect(oceanDem["url"]).toBeUndefined();
    const ocean = sources["ocean-depth-vector"];
    expect(ocean["type"]).toBe("vector");
    expect(ocean["tiles"]).toEqual([
      "pmtiles:///packages/qaarsut-kullorsuaq/ocean-depth-vector.pmtiles/{z}/{x}/{y}",
    ]);
    expect(ocean["maxzoom"]).toBe(OCEAN_DEPTH_VECTOR_MAX_ZOOM);

    // Coastline mask: same logical path, pack-scoped.
    const mask = sources["coastline-land"];
    expect(mask["type"]).toBe("vector");
    expect(mask["tiles"]).toEqual([
      "pmtiles:///packages/qaarsut-kullorsuaq/coastline-land/land.pmtiles/{z}/{x}/{y}",
    ]);
    expect(String(mask["attribution"])).toContain("ODbL");

    const ids = (style.layers ?? []).map((layer) => layer.id);
    // Ocean hillshade is served offline from the pack raster; the
    // mask-above-ocean and ocean-under-land contracts still hold.
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanHillshade);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanFills);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContours);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContoursDetail);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContourLabels);
    expect(ids).toContain(TERRAIN_LAYER_IDS.coastlineMask);
    expect(ids).toContain(TERRAIN_LAYER_IDS.landHillshade);
    expect(ids).toContain(TERRAIN_LAYER_IDS.landPeakBands);
    expect(assertMaskAboveOcean(ids)).toEqual({ ok: true });
    expect(assertOceanUnderLand(ids)).toEqual({ ok: true });

    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:tile-serving"]).toBe("opfs-pack");
    expect(meta["nunat:ocean-hillshade-offline"]).toBe("served");
    expect(meta["nunat:ocean-source"]).toBe("ibcao-v5.2");
    expect(meta["nunat:ocean-fallback"]).toBe("gebco-2026");
    expect(meta["nunat:ocean-contour-thinning"]).toBe("zoom-major");
    expect(meta["nunat:safety"]).toBe("not-for-navigation");
  });

  it("keeps the online style remote until a pack is installed", () => {
    const style = composeTerrainStyle(libertyStub);
    const sources = style.sources as Record<string, Record<string, unknown>>;
    expect(sources["land-relief"]["url"]).toBe(LAND_DEM_TILEJSON);
    // Peaks online are same-origin (built from the same Mapterhorn DEM):
    // explicit z/x/y URLs, never the bare archive path.
    expect(sources["land-peaks"]["tiles"]).toEqual([
      `${LAND_PEAKS_PMTILES_URL}/{z}/{x}/{y}`,
    ]);
    expect(sources["land-peaks"]["maxzoom"]).toBe(LAND_PEAKS_MAX_ZOOM);
    expect(sources["ocean-depth-dem"]["tiles"]).toEqual([
      `${OCEAN_DEPTH_DEM_PMTILES_URL}/{z}/{x}/{y}`,
    ]);
    expect(sources["ocean-depth-dem"]["maxzoom"]).toBe(OCEAN_DEPTH_DEM_MAX_ZOOM);
    expect(sources["ocean-depth-vector"]["tiles"]).toEqual([
      `${OCEAN_DEPTH_VECTOR_PMTILES_URL}/{z}/{x}/{y}`,
    ]);
    expect(sources["ocean-depth-vector"]["maxzoom"]).toBe(
      OCEAN_DEPTH_VECTOR_MAX_ZOOM,
    );
    expect(sources["coastline-land"]["url"]).toBe(COASTLINE_MASK_PMTILES_URL);
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:tile-serving"]).toBe("remote");
    expect(meta["nunat:ocean-hillshade-offline"]).toBe("served");
  });

  it("fails the style-order contract when any ocean layer sits above the mask", () => {
    const base = [
      "background",
      TERRAIN_LAYER_IDS.oceanHillshade,
      TERRAIN_LAYER_IDS.oceanFills,
      TERRAIN_LAYER_IDS.oceanContours,
      TERRAIN_LAYER_IDS.oceanContoursDetail,
      TERRAIN_LAYER_IDS.oceanContourLabels,
      TERRAIN_LAYER_IDS.coastlineMask,
      "landcover",
    ];
    expect(assertMaskAboveOcean(base)).toEqual({ ok: true });
    // Missing mask → fail (ocean layers would be unmasked).
    expect(
      assertMaskAboveOcean(base.filter((id) => id !== TERRAIN_LAYER_IDS.coastlineMask)),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining("missing"),
    });
    // Each ocean layer above the mask → fail.
    for (const oceanId of [
      TERRAIN_LAYER_IDS.oceanHillshade,
      TERRAIN_LAYER_IDS.oceanFills,
      TERRAIN_LAYER_IDS.oceanContours,
      TERRAIN_LAYER_IDS.oceanContoursDetail,
      TERRAIN_LAYER_IDS.oceanContourLabels,
    ]) {
      const shifted = base.filter((id) => id !== oceanId);
      shifted.push(oceanId);
      expect(assertMaskAboveOcean(shifted)).toEqual({
        ok: false,
        reason: expect.stringContaining("above the coastline mask"),
      });
    }
  });

  it("reports the mask source attribution for the attribution control", () => {
    expect(COASTLINE_MASK_ATTRIBUTION).toMatch(/OpenStreetMap contributors/);
    expect(COASTLINE_MASK_ATTRIBUTION).toContain("ODbL");
  });

  it("filters contours on depth_abs_m (not signed depth_m)", () => {
    expect(contourBreakFilter(OCEAN_CONTOUR_OVERVIEW_BREAKS_M)).toEqual([
      "all",
      [
        "in",
        ["get", "depth_abs_m"],
        ["literal", [...OCEAN_CONTOUR_OVERVIEW_BREAKS_M]],
      ],
      ["any", ["!", ["has", "sys"]], ["!=", ["get", "sys"], "ft"]],
    ]);
    // Fills still use the full Hybrid D ladder.
    expect(OCEAN_BREAKS_M).toEqual([5, 10, 20, 50, 100, 200, 500, 1000]);
    const style = composeTerrainStyle(libertyStub);
    const labels = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanContourLabels,
    ) as { layout?: { "text-field"?: unknown }; filter?: unknown } | undefined;
    expect(JSON.stringify(labels?.layout?.["text-field"])).toContain(
      "depth_abs_m",
    );
    expect(JSON.stringify(labels?.layout?.["text-field"])).not.toContain(
      '"depth_m"',
    );
    expect(JSON.stringify(labels?.filter)).toContain("100");
    expect(JSON.stringify(labels?.filter)).not.toContain('"5"');
  });

  it("uses discrete metric-only fill bands on drval1", () => {
    const fillExpr = oceanFillColorExpression();
    expect(fillExpr[0]).toBe("step");
    expect(fillExpr[1]).toEqual(["get", "drval1"]);
    expect(fillExpr).not.toContain("interpolate");

    const style = composeTerrainStyle(libertyStub);
    const fills = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanFills,
    ) as {
      filter?: unknown;
      paint?: { "fill-color"?: unknown };
    };
    expect(fills?.filter).toEqual(oceanFillFilter());
    expect(fills?.paint?.["fill-color"]).toEqual(fillExpr);
    expect(oceanFillFilter()).toEqual([
      "all",
      ["has", "drval1"],
      [">=", ["get", "drval1"], 0],
      ["any", ["!", ["has", "sys"]], ["==", ["get", "sys"], "m"]],
    ]);
  });

  it("validates remote style JSON at the load seam", () => {
    expect(() => parseLibertyStyle({ version: 7, sources: {}, layers: [] })).toThrow(
      /version must be 8/,
    );
    expect(() => parseLibertyStyle({ version: 8, sources: {} })).toThrow(
      /layers/,
    );
    expect(() =>
      parseLibertyStyle({
        version: 8,
        sources: { bad: { type: "mystery" } },
        layers: [],
      }),
    ).toThrow(/Unsupported source type/);
    expect(() =>
      parseLibertyStyle({
        version: 8,
        sources: { openmaptiles: { type: "vector" } },
        layers: [],
      }),
    ).toThrow(/requires url or tiles/);
    expect(() =>
      parseLibertyStyle({
        version: 8,
        sources: {},
        layers: [{ id: "x", type: "fill" }],
      }),
    ).toThrow(/requires source/);
    expect(parseLibertyStyle(libertyStub).version).toBe(8);
  });

  it("softens basemap water so meter bands read through", () => {
    const style = composeTerrainStyle(libertyStub);
    const water = style.layers?.find((layer) => layer.id === "water");
    expect(
      (water as { paint?: { "fill-opacity"?: number } } | undefined)?.paint?.[
        "fill-opacity"
      ],
    ).toBe(0.28);
  });

  it("inserts ocean before the first land fill", () => {
    expect(oceanInsertBeforeId(libertyStub.layers ?? [])).toBe("landcover");
  });

  it("suppresses competing geography labels and keeps road labels", () => {
    const style = composeTerrainStyle(libertyStub);
    const ids = (style.layers ?? []).map((layer) => layer.id);
    expect(ids).not.toContain("label_other");
    expect(ids).not.toContain("water_name_point_label");
    expect(ids).not.toContain("waterway_line_label");
    expect(ids).not.toContain("mountain_peak_label");
    expect(ids).toContain("highway-name-major");
    expect(hasEnglishFirstGeographyLabels(style.layers ?? [])).toBe(false);
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:name-ownership"]).toBe("official-kalaallisut-primary");
  });

  it("rejects English-first text fields on geography label layers", () => {
    expect(expressionPrefersEnglishFirstName([...englishFirstTextField])).toBe(
      true,
    );
    expect(
      expressionPrefersEnglishFirstName([
        "coalesce",
        ["get", "name"],
        ["get", "name_en"],
      ]),
    ).toBe(false);
    // Raw Liberty stub still has English-first geography labels…
    expect(hasEnglishFirstGeographyLabels(libertyStub.layers ?? [])).toBe(true);
    // …but composed / name-owned styles must not.
    expect(
      hasEnglishFirstGeographyLabels(
        composeTerrainStyle(libertyStub).layers ?? [],
      ),
    ).toBe(false);
    expect(
      hasEnglishFirstGeographyLabels(
        composeNameOwnedLibertyStyle(libertyStub).layers ?? [],
      ),
    ).toBe(false);
  });
});
