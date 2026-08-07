import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { parseLibertyStyle, StyleError } from "./liberty-style.ts";
import {
  LAND_BREAKS_M,
  METER_BAND_POLICY,
  OCEAN_BREAKS_M,
  oceanFillColorExpression,
} from "./meter-bands.ts";

export { parseLibertyStyle, StyleError } from "./liberty-style.ts";

/** Same basemap family as today's product map. */
export const LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/** Mapterhorn Terrarium — Klimadatastyrelsen Greenland DEM (CC BY 4.0). */
export const LAND_DEM_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";

/**
 * Land peak color bands (issue #24) — peaks-only color-relief raster
 * derived from the same Mapterhorn DEM the land hillshade uses.
 * Pixels below 500 m are transparent; 500-1000 / 1000-2000 / 2000+ m
 * use landPeakBandColor (meter-bands.ts). z0-z10, 256 px webp — z11+
 * renders overzoomed (same policy as the land relief / corridor pack).
 * Same-origin path so the offline corridor pack can serve the same
 * logical file. Package: web/public/packages/land-peaks
 * (build-land-peaks.py / fetch-land-peaks-assets.sh).
 */
export const LAND_PEAKS_PMTILES_URL =
  "pmtiles:///packages/land-peaks/land-peaks.pmtiles";

export const LAND_PEAKS_MAX_ZOOM = 10;

export const LAND_DEM_ATTRIBUTION =
  "Land DEM © Klimadatastyrelsen / Mapterhorn (CC BY 4.0)";

/**
 * Self-tiled ocean depth (issue #23) — IBCAO v5.2 with GEBCO_2026 fallback,
 * clipped to the shared coastline (OSM ∪ Mapterhorn DEM land) before
 * tiling. Same-origin paths so the offline corridor pack can serve the
 * same logical files. Package: web/public/packages/ocean-depth
 * (build-ocean-depth.py / fetch-ocean-depth-assets.sh).
 */
export const OCEAN_DEPTH_DEM_PMTILES_URL =
  "pmtiles:///packages/ocean-depth/ocean-depth-dem.pmtiles";
export const OCEAN_DEPTH_VECTOR_PMTILES_URL =
  "pmtiles:///packages/ocean-depth/ocean-depth-vector.pmtiles";

/**
 * Ocean depth attribution (IBCAO/GEBCO, open grid). Kept explicit:
 * self-tiled depth is display context, never navigation.
 */
export const OCEAN_DEPTH_ATTRIBUTION =
  "Ocean depth © IBCAO v5.2 (2026) · GEBCO_2026 fallback (open grid, Seabed 2030) — not for navigation";

/** Layer ids in the composed style (peak bands ship since issue #24). */
export const TERRAIN_LAYER_IDS = {
  oceanHillshade: "terrain-ocean-hillshade",
  oceanFills: "terrain-ocean-fills",
  oceanContours: "terrain-ocean-contours",
  oceanContourLabels: "terrain-ocean-contour-labels",
  coastlineMask: "terrain-coastline-mask",
  landHillshade: "terrain-land-hillshade",
  landPeakBands: "terrain-land-peak-bands",
} as const;

/**
 * Complete OSM coastline land polygons (ODbL) served as PMTiles.
 * Same-origin path so the offline corridor pack can serve the same file.
 * Package: web/public/packages/coastline-land (fetch-coastline-mask-assets.sh).
 */
export const COASTLINE_MASK_PMTILES_URL =
  "pmtiles:///packages/coastline-land/land.pmtiles";

/**
 * Offline serving: the full corridor pack mounted in OPFS serves these
 * paths (pack-relative files under packages/qaarsut-kullorsuaq). Same
 * logical tile paths online/offline — only the protocol resolution changes.
 */
export const PACK_PMTILES_URL = (path: string): string =>
  `pmtiles:///packages/qaarsut-kullorsuaq/${path}/{z}/{x}/{y}`;

export const COASTLINE_MASK_ATTRIBUTION =
  "© OpenStreetMap contributors (ODbL) — coastline land polygons";

/** Neutral land base painted above ocean layers; relief/markers stay above. */
export const COASTLINE_MASK_FILL_COLOR = "#e8e0cf";

export type TerrainStyleMeta = {
  "nunat:basemap": "terrain-first";
  "nunat:safety": "not-for-navigation";
  "nunat:meter-bands": typeof METER_BAND_POLICY.key;
  "nunat:ocean-source": "ibcao-v5.2";
  /** GEBCO_2026 fills where IBCAO has no data (south of 64N, gaps). */
  "nunat:ocean-fallback": "gebco-2026";
  "nunat:land-source": "mapterhorn-terrarium";
  /** Discrete peak bands at 500/1000/2000 m (elev < 500 m transparent). */
  "nunat:land-peak-bands": "500-1000-2000";
  /** Product policy: land meter bands paint high peaks only, never a full wash. */
  "nunat:land-peaks-only": true;
  /**
   * Gap labelling (issue #26): the UI shows a quiet chrome note when land
   * DEM or ocean depth tiles resolve absent for the current viewport.
   */
  "nunat:tile-gap-labels": "visible";
  "nunat:ocean-under-land": true;
  "nunat:coastline-source": "osm-land-polygons";
  "nunat:coastline-licence": "ODbL";
  /** NunaGIS officialName is the sole primary geography label. */
  "nunat:name-ownership": "official-kalaallisut-primary";
  /** Offline pack serving: land + depth vector from OPFS, mask from OPFS. */
  "nunat:tile-serving": "remote" | "opfs-pack";
  /** The ocean hillshade raster is not in the pack (vector depth is). */
  "nunat:ocean-hillshade-offline": "dropped" | "served";
};

/** First land-like fill id — ocean layers insert before this. */
export function oceanInsertBeforeId(
  layers: ReadonlyArray<LayerSpecification>,
): string | undefined {
  const land = layers.find((layer) => {
    return isBasemapLandFillLayer(layer);
  });
  if (land) return land.id;
  const water = layers.find(
    (layer) =>
      !layer.id.startsWith("terrain-") &&
      layer.id.toLowerCase().includes("water"),
  );
  return water?.id;
}

/**
 * Contour filter: self-tiled contours store signed `depth_m` and absolute
 * `depth_abs_m`. Hybrid D breaks are positive meters — match
 * `depth_abs_m`, metric ladder only (no `sys` field needed).
 */
export function contourBreakFilter(
  breaks: ReadonlyArray<number>,
): FilterSpecification {
  return [
    "all",
    ["in", ["get", "depth_abs_m"], ["literal", [...breaks]]],
    ["any", ["!", ["has", "sys"]], ["!=", ["get", "sys"], "ft"]],
  ];
}

/** Metric depth-area polygons only (exclude overlapping fathom ladder). */
export function oceanFillFilter(): FilterSpecification {
  return [
    "all",
    ["has", "drval1"],
    [">=", ["get", "drval1"], 0],
    ["any", ["!", ["has", "sys"]], ["==", ["get", "sys"], "m"]],
  ];
}

function isBasemapLandFillId(id: string): boolean {
  if (id.startsWith("terrain-")) return false;
  const lower = id.toLowerCase();
  return (
    lower.includes("landcover") ||
    lower.includes("landuse") ||
    lower === "land"
  );
}

/** Land-fill detection on layer objects — rasters (e.g. `natural_earth`) never count. */
function isBasemapLandFillLayer(layer: LayerSpecification): boolean {
  return layer.type === "fill" && isBasemapLandFillId(layer.id);
}

function oceanLayerIds(): string[] {
  return [
    TERRAIN_LAYER_IDS.oceanHillshade,
    TERRAIN_LAYER_IDS.oceanFills,
    TERRAIN_LAYER_IDS.oceanContours,
    TERRAIN_LAYER_IDS.oceanContourLabels,
  ];
}

/**
 * Coastline-mask order contract: the complete land mask sits above every
 * ocean layer — hillshade, depth fills, contours, and contour labels — so
 * no depth geometry or label can paint on land.
 */
export function assertMaskAboveOcean(
  layerIds: ReadonlyArray<string>,
): { ok: true } | { ok: false; reason: string } {
  const maskIdx = layerIds.indexOf(TERRAIN_LAYER_IDS.coastlineMask);
  if (maskIdx < 0) {
    return {
      ok: false,
      reason: `${TERRAIN_LAYER_IDS.coastlineMask} is missing — ocean layers are unmasked`,
    };
  }
  for (const oceanId of oceanLayerIds()) {
    const idx = layerIds.indexOf(oceanId);
    if (idx >= 0 && idx >= maskIdx) {
      return {
        ok: false,
        reason: `${oceanId} sits above the coastline mask (index ${idx} >= ${maskIdx})`,
      };
    }
  }
  return { ok: true };
}

/**
 * Layer-order contract: ocean hillshade + fills + contours under basemap land.
 * Contour labels may sit above land so meter numbers stay readable.
 */
export function assertOceanUnderLand(
  layerIds: ReadonlyArray<string>,
): { ok: true } | { ok: false; reason: string } {
  const oceanIds = [
    TERRAIN_LAYER_IDS.oceanHillshade,
    TERRAIN_LAYER_IDS.oceanFills,
    TERRAIN_LAYER_IDS.oceanContours,
  ];
  const landIdx = layerIds.findIndex(isBasemapLandFillId);
  if (landIdx < 0) {
    const waterIdx = layerIds.findIndex(
      (id) => !id.startsWith("terrain-") && id.toLowerCase().includes("water"),
    );
    if (waterIdx < 0) return { ok: true };
    for (const oceanId of oceanIds) {
      const idx = layerIds.indexOf(oceanId);
      if (idx >= 0 && idx >= waterIdx) {
        return {
          ok: false,
          reason: `${oceanId} must be under water/land (index ${idx} >= ${waterIdx})`,
        };
      }
    }
    return { ok: true };
  }
  for (const oceanId of oceanIds) {
    const idx = layerIds.indexOf(oceanId);
    if (idx >= 0 && idx >= landIdx) {
      return {
        ok: false,
        reason: `${oceanId} must be under land (index ${idx} >= ${landIdx})`,
      };
    }
  }
  return { ok: true };
}

function softenBasemapWater(layers: LayerSpecification[]): void {
  for (const layer of layers) {
    if (layer.type !== "fill") continue;
    const id = layer.id.toLowerCase();
    if (!id.includes("water") && !id.includes("ocean")) continue;
    const paint = { ...(layer.paint ?? {}) } as Record<string, unknown>;
    paint["fill-opacity"] = 0.28;
    paint["fill-color"] = "#9eb8d8";
    (layer as { paint?: Record<string, unknown> }).paint = paint;
  }
}

/**
 * OpenMapTiles source-layers whose symbol labels compete with NunaGIS
 * geography names (places, islands, water, waterways, peaks/landforms).
 * Road / transportation_name labels are intentionally kept.
 */
export const COMPETING_GEOGRAPHY_SOURCE_LAYERS = [
  "place",
  "water_name",
  "waterway",
  "mountain_peak",
] as const;

export type CompetingGeographySourceLayer =
  (typeof COMPETING_GEOGRAPHY_SOURCE_LAYERS)[number];

const competingSourceLayerSet = new Set<string>(
  COMPETING_GEOGRAPHY_SOURCE_LAYERS,
);

/** True when a Liberty symbol layer would paint competing geography names. */
export function isCompetingGeographyLabelLayer(
  layer: LayerSpecification,
): boolean {
  if (layer.type !== "symbol") return false;
  const sourceLayer =
    "source-layer" in layer ? layer["source-layer"] : undefined;
  if (typeof sourceLayer !== "string") return false;
  if (!competingSourceLayerSet.has(sourceLayer)) return false;
  const layout = layer.layout as { "text-field"?: unknown } | undefined;
  return layout?.["text-field"] != null;
}

/**
 * True when a MapLibre text-field expression prefers English (`name_en`)
 * over native/local `name` — the Liberty default we must not keep for
 * geography labels NunaGIS owns.
 */
export function expressionPrefersEnglishFirstName(
  textField: unknown,
): boolean {
  if (typeof textField === "string") {
    // Liberty token forms only — bare get-keys are handled via coalesce order.
    return /\{name_en\}|\{name:en\}/.test(textField);
  }
  if (!Array.isArray(textField) || textField.length === 0) return false;

  const op = textField[0];
  // Field references are not preferences by themselves.
  if (op === "get" || op === "has") return false;
  if (op === "coalesce") {
    const keys: string[] = [];
    for (let i = 1; i < textField.length; i++) {
      const arg = textField[i];
      if (
        Array.isArray(arg) &&
        arg[0] === "get" &&
        typeof arg[1] === "string"
      ) {
        keys.push(arg[1]);
      }
    }
    const enIdx = keys.findIndex(
      (key) => key === "name_en" || key === "name:en",
    );
    if (enIdx < 0) {
      /* fall through to recurse */
    } else {
      const nativeIdx = keys.findIndex(
        (key) =>
          key === "name" ||
          key === "name:latin" ||
          key === "name:nonlatin",
      );
      if (nativeIdx < 0 || enIdx < nativeIdx) return true;
    }
  }

  return textField.some(
    (child, index) =>
      index > 0 && expressionPrefersEnglishFirstName(child),
  );
}

/** Drop Liberty symbol layers that duplicate NunaGIS geography labels. */
export function suppressCompetingGeographyLabels(
  layers: ReadonlyArray<LayerSpecification>,
): LayerSpecification[] {
  return layers.filter((layer) => !isCompetingGeographyLabelLayer(layer));
}

/**
 * True when any remaining competing geography symbol layer still prefers
 * English-first text fields (should be empty after suppression).
 */
export function hasEnglishFirstGeographyLabels(
  layers: ReadonlyArray<LayerSpecification>,
): boolean {
  for (const layer of layers) {
    if (!isCompetingGeographyLabelLayer(layer)) continue;
    const layout = layer.layout as { "text-field"?: unknown } | undefined;
    if (expressionPrefersEnglishFirstName(layout?.["text-field"])) return true;
  }
  return false;
}

/**
 * Compose terrain-first style: Liberty chrome + land DEM hillshade +
 * hybrid D ocean meter bands under land.
 */
export type ComposeTerrainStyleOptions = {
  /**
   * Serve terrain sources from the installed OPFS corridor pack (same
   * logical tile paths as online — the pmtiles protocol resolves them
   * locally). Online stays on remote Mapterhorn + same-origin ocean-depth
   * / coastline-land PMTiles until a full pack is installed and verified.
   * Offline: land relief (tileSize 256, the pack's re-encoded archives),
   * vector ocean depth + ocean hillshade raster (the pack carries both),
   * coastline mask.
   */
  offline?: boolean;
};

export function composeTerrainStyle(
  liberty: StyleSpecification,
  options: ComposeTerrainStyleOptions = {},
): StyleSpecification {
  const offline = options.offline === true;
  const validated = parseLibertyStyle(liberty);
  const style: StyleSpecification = {
    version: 8,
    sources: { ...validated.sources },
    layers: [...validated.layers],
    ...(validated.name != null ? { name: validated.name } : {}),
    ...(validated.sprite != null ? { sprite: validated.sprite } : {}),
    ...(validated.glyphs != null ? { glyphs: validated.glyphs } : {}),
    ...(validated.metadata != null ? { metadata: validated.metadata } : {}),
    ...(validated.center != null ? { center: validated.center } : {}),
    ...(validated.zoom != null ? { zoom: validated.zoom } : {}),
    ...(validated.bearing != null ? { bearing: validated.bearing } : {}),
    ...(validated.pitch != null ? { pitch: validated.pitch } : {}),
  };

  style.sources = {
    ...style.sources,
    ...(offline
      ? {
          "land-relief": {
            type: "raster-dem",
            tiles: [PACK_PMTILES_URL("land-relief.pmtiles")],
            // The pack re-encodes Mapterhorn 512 px tiles at 256 px.
            tileSize: 256,
            encoding: "terrarium",
            attribution: LAND_DEM_ATTRIBUTION,
          },
          "land-peaks": {
            type: "raster",
            tiles: [PACK_PMTILES_URL("land-peaks.pmtiles")],
            tileSize: 256,
            maxzoom: LAND_PEAKS_MAX_ZOOM,
            attribution: LAND_DEM_ATTRIBUTION,
          },
          "ocean-depth-dem": {
            type: "raster-dem",
            tiles: [PACK_PMTILES_URL("ocean-depth-dem.pmtiles")],
            tileSize: 256,
            encoding: "terrarium",
            attribution: OCEAN_DEPTH_ATTRIBUTION,
          },
          "ocean-depth-vector": {
            type: "vector",
            tiles: [PACK_PMTILES_URL("ocean-depth-vector.pmtiles")],
            attribution: OCEAN_DEPTH_ATTRIBUTION,
          },
          "coastline-land": {
            type: "vector",
            tiles: [PACK_PMTILES_URL("coastline-land/land.pmtiles")],
            attribution: COASTLINE_MASK_ATTRIBUTION,
          },
        }
      : {
          "land-relief": {
            type: "raster-dem",
            url: LAND_DEM_TILEJSON,
            tileSize: 512,
            encoding: "terrarium",
            attribution: LAND_DEM_ATTRIBUTION,
          },
          "land-peaks": {
            type: "raster",
            // Explicit {z}/{x}/{y}: the pmtiles protocol resolves each
            // request from the archive (bare archive URLs are only valid
            // for `url:` sources that fetch a tilejson first).
            tiles: [`${LAND_PEAKS_PMTILES_URL}/{z}/{x}/{y}`],
            tileSize: 256,
            maxzoom: LAND_PEAKS_MAX_ZOOM,
            attribution: LAND_DEM_ATTRIBUTION,
          },
          "ocean-depth-dem": {
            type: "raster-dem",
            tiles: [OCEAN_DEPTH_DEM_PMTILES_URL],
            tileSize: 256,
            encoding: "terrarium",
            attribution: OCEAN_DEPTH_ATTRIBUTION,
          },
          "ocean-depth-vector": {
            type: "vector",
            tiles: [OCEAN_DEPTH_VECTOR_PMTILES_URL],
            attribution: OCEAN_DEPTH_ATTRIBUTION,
          },
          "coastline-land": {
            type: "vector",
            url: COASTLINE_MASK_PMTILES_URL,
            attribution: COASTLINE_MASK_ATTRIBUTION,
          },
        }),
  };

  const layers = suppressCompetingGeographyLabels(style.layers ?? []);
  softenBasemapWater(layers);

  const beforeId = oceanInsertBeforeId(layers);
  const beforeIndex = beforeId
    ? layers.findIndex((layer) => layer.id === beforeId)
    : 1;
  const insertAt = beforeIndex >= 0 ? beforeIndex : 1;

  const oceanLayers: LayerSpecification[] = [
    {
      id: TERRAIN_LAYER_IDS.oceanHillshade,
      type: "hillshade",
      source: "ocean-depth-dem",
      paint: {
        "hillshade-exaggeration": 0.45,
        "hillshade-shadow-color": "#062033",
        "hillshade-highlight-color": "#d7e8f4",
        "hillshade-accent-color": "#1a4a66",
      },
    },
  ];

  const oceanFills: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.oceanFills,
    type: "fill",
    source: "ocean-depth-vector",
    "source-layer": "depare",
    filter: oceanFillFilter(),
    paint: {
      "fill-color": oceanFillColorExpression(),
      "fill-opacity": 0.48,
    },
  };

  const oceanContours: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.oceanContours,
    type: "line",
    source: "ocean-depth-vector",
    "source-layer": "contours",
    filter: contourBreakFilter(OCEAN_BREAKS_M),
    paint: {
      "line-color": "#2f6f88",
      "line-width": 1.2,
      "line-opacity": 0.8,
    },
  };

  const oceanContourLabels: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.oceanContourLabels,
    type: "symbol",
    source: "ocean-depth-vector",
    "source-layer": "contours",
    filter: contourBreakFilter(OCEAN_BREAKS_M),
    minzoom: 6,
    layout: {
      "symbol-placement": "line",
      "text-field": ["concat", ["to-string", ["get", "depth_abs_m"]], " m"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "#0c2438",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  };

  const coastlineMask: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.coastlineMask,
    type: "fill",
    source: "coastline-land",
    "source-layer": "land",
    paint: {
      "fill-color": COASTLINE_MASK_FILL_COLOR,
      "fill-opacity": 1,
    },
  };

  // Order: ocean hillshade, fills, contours, contour labels, then the
  // complete coastline mask, then land relief. The mask hides every ocean
  // layer on land while land hillshade and NunaGIS markers stay above.
  // (The hillshade raster is served online and from the pack offline.)
  layers.splice(
    insertAt,
    0,
    ...oceanLayers,
    oceanFills,
    oceanContours,
    oceanContourLabels,
    coastlineMask,
  );

  const landHillshade: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.landHillshade,
    type: "hillshade",
    source: "land-relief",
    paint: {
      "hillshade-exaggeration": 0.55,
      "hillshade-shadow-color": "#3a3228",
      "hillshade-highlight-color": "#f0e6d4",
      "hillshade-accent-color": "#6b5e4a",
    },
  };
  // Peak color bands (issue #24): the color-relief raster sits above the
  // opaque land hillshade — MapLibre hillshade cannot color by elevation,
  // and a raster under it would be hidden. Bands are baked flat band
  // colors (transparent below 500 m), so sub-500 m land keeps full
  // hillshade relief while tinted peaks are the crisp elevation surface.
  // The semi-transparent Liberty land fills keep their normal position
  // above both, and place labels/markers stay above everything.
  const landPeakBands: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.landPeakBands,
    type: "raster",
    source: "land-peaks",
    paint: {
      // Discrete bands: nearest keeps band edges crisp (linear would
      // blur the 500/1000/2000 m boundaries into fringes).
      "raster-resampling": "nearest",
      "raster-opacity": 1,
    },
  };
  const landCoverIdx = layers.findIndex(isBasemapLandFillLayer);
  const landInsert = landCoverIdx >= 0 ? landCoverIdx : insertAt + 5;
  layers.splice(landInsert, 0, landHillshade, landPeakBands);

  style.layers = layers;

  const meta: TerrainStyleMeta = {
    "nunat:basemap": "terrain-first",
    "nunat:safety": "not-for-navigation",
    "nunat:meter-bands": METER_BAND_POLICY.key,
    "nunat:ocean-source": "ibcao-v5.2",
    "nunat:ocean-fallback": "gebco-2026",
    "nunat:land-source": "mapterhorn-terrarium",
    "nunat:land-peak-bands": "500-1000-2000",
    "nunat:land-peaks-only": true,
    "nunat:tile-gap-labels": "visible",
    "nunat:ocean-under-land": true,
    "nunat:coastline-source": "osm-land-polygons",
    "nunat:coastline-licence": "ODbL",
    "nunat:name-ownership": "official-kalaallisut-primary",
    "nunat:tile-serving": offline ? "opfs-pack" : "remote",
    "nunat:ocean-hillshade-offline": "served",
  };
  style.metadata = {
    ...(typeof style.metadata === "object" && style.metadata
      ? style.metadata
      : {}),
    ...meta,
    "nunat:land-breaks-m": [...LAND_BREAKS_M],
    "nunat:land-peak-fill": "discrete-color-relief-mapterhorn",
    "nunat:land-peak-resampling": "nearest",
    "nunat:ocean-breaks-m": [...OCEAN_BREAKS_M],
    "nunat:ocean-fill": "discrete-step-drval1-metric",
    "nunat:contour-field": "depth_abs_m",
  };

  return style;
}

/**
 * Liberty style with competing geography labels removed — used when full
 * terrain compose fails so name ownership still holds.
 */
export function composeNameOwnedLibertyStyle(
  liberty: StyleSpecification,
): StyleSpecification {
  const validated = parseLibertyStyle(liberty);
  const layers = suppressCompetingGeographyLabels(validated.layers ?? []);
  return {
    ...validated,
    layers,
    metadata: {
      ...(typeof validated.metadata === "object" && validated.metadata
        ? validated.metadata
        : {}),
      "nunat:name-ownership": "official-kalaallisut-primary",
    },
  };
}

export async function loadTerrainStyle(
  fetchImpl: typeof fetch = fetch,
  options: ComposeTerrainStyleOptions = {},
): Promise<StyleSpecification> {
  const response = await fetchImpl(LIBERTY_STYLE_URL);
  if (!response.ok) {
    throw new StyleError(`Liberty style HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new StyleError("Liberty style response is not JSON");
  }
  return composeTerrainStyle(parseLibertyStyle(raw), options);
}

/** Fetch Liberty and strip competing geography labels (no terrain sources). */
export async function loadNameOwnedLibertyStyle(
  fetchImpl: typeof fetch = fetch,
): Promise<StyleSpecification> {
  const response = await fetchImpl(LIBERTY_STYLE_URL);
  if (!response.ok) {
    throw new StyleError(`Liberty style HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new StyleError("Liberty style response is not JSON");
  }
  return composeNameOwnedLibertyStyle(parseLibertyStyle(raw));
}
