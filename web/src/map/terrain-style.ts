import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import {
  LAND_BREAKS_M,
  METER_BAND_POLICY,
  OCEAN_BREAKS_M,
  oceanFillColorExpression,
} from "./meter-bands.ts";

/** Same basemap family as today's product map. */
export const LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/** Mapterhorn Terrarium — Klimadatastyrelsen Greenland DEM (CC BY 4.0). */
export const LAND_DEM_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";

/**
 * Ocean open-grid interim: Open Waters Seascape (GEBCO mosaic).
 * Production target is self-tiled IBCAO V5.2 with GEBCO fallback.
 * Swap URLs in terrain sources when IBCAO PMTiles are hosted.
 */
export const OCEAN_DEM_URL =
  "https://tiles.openwaters.io/seascape/raster.json";
export const OCEAN_VECTOR_URL =
  "https://tiles.openwaters.io/seascape/vector.json";

export const TERRAIN_LAYER_IDS = {
  oceanHillshade: "terrain-ocean-hillshade",
  oceanFills: "terrain-ocean-fills",
  oceanContours: "terrain-ocean-contours",
  oceanContourLabels: "terrain-ocean-contour-labels",
  landHillshade: "terrain-land-hillshade",
  landPeakBands: "terrain-land-peak-bands",
} as const;

export type TerrainStyleMeta = {
  "nunat:basemap": "terrain-first";
  "nunat:safety": "not-for-navigation";
  "nunat:meter-bands": typeof METER_BAND_POLICY.key;
  "nunat:ocean-source": "open-waters-seascape-interim" | "ibcao-v5.2";
  "nunat:land-source": "mapterhorn-terrarium";
  "nunat:land-peaks-only": true;
  "nunat:ocean-under-land": true;
};

export class StyleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleError";
  }
}

/** Runtime validation for remote Liberty (or equivalent) style JSON. */
export function parseLibertyStyle(raw: unknown): StyleSpecification {
  if (!raw || typeof raw !== "object") {
    throw new StyleError("Style JSON must be an object");
  }
  const style = raw as Record<string, unknown>;
  if (style.version !== 8) {
    throw new StyleError(`Style version must be 8 (got ${String(style.version)})`);
  }
  if (!style.sources || typeof style.sources !== "object") {
    throw new StyleError("Style missing sources object");
  }
  if (!Array.isArray(style.layers)) {
    throw new StyleError("Style missing layers array");
  }
  for (const [i, layer] of style.layers.entries()) {
    if (!layer || typeof layer !== "object") {
      throw new StyleError(`Style layer[${i}] must be an object`);
    }
    const id = (layer as { id?: unknown }).id;
    const type = (layer as { type?: unknown }).type;
    if (typeof id !== "string" || id.length === 0) {
      throw new StyleError(`Style layer[${i}] missing id`);
    }
    if (typeof type !== "string" || type.length === 0) {
      throw new StyleError(`Style layer[${i}] missing type`);
    }
  }
  return style as StyleSpecification;
}

/** First land-like fill id — ocean layers insert before this. */
export function oceanInsertBeforeId(
  layers: ReadonlyArray<LayerSpecification>,
): string | undefined {
  const land = layers.find((layer) => {
    if (layer.type !== "fill") return false;
    return isBasemapLandFillId(layer.id);
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
 * Contour filter: Seascape stores signed `depth_m` and absolute `depth_abs_m`.
 * Hybrid D breaks are positive meters — match `depth_abs_m`, metric ladder only.
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
    lower === "land" ||
    lower.includes("earth")
  );
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
 * Compose terrain-first style: Liberty chrome + land DEM hillshade +
 * hybrid D ocean meter bands under land.
 */
export function composeTerrainStyle(
  liberty: StyleSpecification,
): StyleSpecification {
  const validated = parseLibertyStyle(liberty);
  const style = structuredClone(validated) as StyleSpecification;
  style.sources = {
    ...(style.sources ?? {}),
    "land-relief": {
      type: "raster-dem",
      url: LAND_DEM_TILEJSON,
      tileSize: 512,
      encoding: "terrarium",
      attribution:
        "Land DEM © Klimadatastyrelsen / Mapterhorn (CC BY 4.0)",
    },
    "ocean-depth-dem": {
      type: "raster-dem",
      url: OCEAN_DEM_URL,
      tileSize: 512,
      encoding: "terrarium",
      attribution:
        "Ocean depth (open grid, interim) — not for navigation",
    },
    "ocean-depth-vector": {
      type: "vector",
      url: OCEAN_VECTOR_URL,
      attribution:
        "Ocean depth (open grid, interim) — not for navigation",
    },
  };

  const layers = [...(style.layers ?? [])];
  softenBasemapWater(layers);

  const beforeId = oceanInsertBeforeId(layers);
  const beforeIndex = beforeId
    ? layers.findIndex((layer) => layer.id === beforeId)
    : 1;
  const insertAt = beforeIndex >= 0 ? beforeIndex : 1;

  const oceanHillshade: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.oceanHillshade,
    type: "hillshade",
    source: "ocean-depth-dem",
    paint: {
      "hillshade-exaggeration": 0.45,
      "hillshade-shadow-color": "#062033",
      "hillshade-highlight-color": "#d7e8f4",
      "hillshade-accent-color": "#1a4a66",
    },
  };

  const oceanFills: LayerSpecification = {
    id: TERRAIN_LAYER_IDS.oceanFills,
    type: "fill",
    source: "ocean-depth-vector",
    "source-layer": "depare",
    filter: oceanFillFilter(),
    paint: {
      "fill-color": oceanFillColorExpression() as ExpressionSpecification,
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

  layers.splice(insertAt, 0, oceanHillshade, oceanFills, oceanContours);

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
  const landCoverIdx = layers.findIndex((layer) =>
    isBasemapLandFillId(layer.id),
  );
  const landInsert = landCoverIdx >= 0 ? landCoverIdx : insertAt + 3;
  layers.splice(landInsert, 0, landHillshade);

  layers.push({
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
  });

  style.layers = layers;

  const meta: TerrainStyleMeta = {
    "nunat:basemap": "terrain-first",
    "nunat:safety": "not-for-navigation",
    "nunat:meter-bands": METER_BAND_POLICY.key,
    "nunat:ocean-source": "open-waters-seascape-interim",
    "nunat:land-source": "mapterhorn-terrarium",
    "nunat:land-peaks-only": true,
    "nunat:ocean-under-land": true,
  };
  style.metadata = {
    ...(typeof style.metadata === "object" && style.metadata
      ? style.metadata
      : {}),
    ...meta,
    "nunat:land-breaks-m": [...LAND_BREAKS_M],
    "nunat:ocean-breaks-m": [...OCEAN_BREAKS_M],
    "nunat:ocean-fill": "discrete-step-drval1-metric",
    "nunat:contour-field": "depth_abs_m",
  };

  return style;
}

export async function loadTerrainStyle(
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
  return composeTerrainStyle(parseLibertyStyle(raw));
}
