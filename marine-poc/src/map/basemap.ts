import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type BasemapMode = "realistic" | "offline";

export type ResolvedBasemap = {
  style: StyleSpecification;
  mode: BasemapMode;
};

/** Same basemap family as the main nunat web map. */
export const LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/** Open Waters Seascape — GEBCO/EMODnet mosaic (context only). */
export const SEASCAPE_DEM_URL =
  "https://tiles.openwaters.io/seascape/raster.json";
export const SEASCAPE_VECTOR_URL =
  "https://tiles.openwaters.io/seascape/vector.json";

const withTimeout = async (
  input: RequestInfo,
  ms: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

/**
 * OpenFreeMap Liberty (land relief + familiar cartography) plus Seascape
 * bathymetry hillshade/contours. Online only — not for navigation.
 */
export const composeRealisticMarineStyle = (
  liberty: StyleSpecification,
): StyleSpecification => {
  const style = structuredClone(liberty) as StyleSpecification;
  style.sources = {
    ...(style.sources ?? {}),
    "bathymetry-dem": {
      type: "raster-dem",
      url: SEASCAPE_DEM_URL,
      tileSize: 512,
      encoding: "terrarium",
      attribution:
        "Bathymetry © Open Waters (GEBCO/EMODnet mosaic) — context only",
    },
    "bathymetry-contours": {
      type: "vector",
      url: SEASCAPE_VECTOR_URL,
      attribution:
        "Bathymetry © Open Waters (GEBCO/EMODnet mosaic) — context only",
    },
  };

  const layers = [...(style.layers ?? [])];

  // Soften Liberty water so depth relief reads through.
  for (const layer of layers) {
    if (layer.type !== "fill") continue;
    const id = layer.id.toLowerCase();
    if (!id.includes("water") && !id.includes("ocean")) continue;
    const paint = { ...(layer.paint ?? {}) } as Record<string, unknown>;
    paint["fill-opacity"] = 0.35;
    paint["fill-color"] = "#9eb8d8";
    (layer as { paint?: Record<string, unknown> }).paint = paint;
  }

  const hillshade: LayerSpecification = {
    id: "nunat-bathymetry-hillshade",
    type: "hillshade",
    source: "bathymetry-dem",
    paint: {
      "hillshade-exaggeration": 0.55,
      "hillshade-shadow-color": "#062033",
      "hillshade-highlight-color": "#d7e8f4",
      "hillshade-accent-color": "#1a4a66",
      "hillshade-illumination-direction": 315,
      "hillshade-illumination-anchor": "viewport",
    },
  };

  const contours: LayerSpecification = {
    id: "nunat-bathymetry-contours",
    type: "line",
    source: "bathymetry-contours",
    "source-layer": "contours",
    minzoom: 5,
    paint: {
      "line-color": "#2f6f88",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        0.3,
        10,
        0.7,
        14,
        1.1,
      ],
      "line-opacity": 0.45,
    },
  };

  // Place depth under vector water / land so coast stays readable.
  const waterIdx = layers.findIndex((layer) =>
    layer.id.toLowerCase().includes("water"),
  );
  const insertAt = waterIdx >= 0 ? waterIdx : 1;
  layers.splice(insertAt, 0, hillshade, contours);
  style.layers = layers;

  style.metadata = {
    ...(typeof style.metadata === "object" && style.metadata
      ? style.metadata
      : {}),
    "nunat:basemap": "liberty+seascape",
    "nunat:safety": "not-for-navigation",
    "nunat:bathymetry": "open-waters-seascape-context-only",
  };

  return style;
};

export const resolveMarineBasemap = async (
  packageStyle: StyleSpecification | null,
): Promise<ResolvedBasemap> => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (packageStyle) return { style: packageStyle, mode: "offline" };
    throw new Error("Offline and no package style");
  }

  try {
    const response = await withTimeout(LIBERTY_STYLE_URL, 5000);
    if (!response.ok) {
      throw new Error(`Liberty style HTTP ${response.status}`);
    }
    const liberty = (await response.json()) as StyleSpecification;
    return {
      style: composeRealisticMarineStyle(liberty),
      mode: "realistic",
    };
  } catch {
    if (packageStyle) return { style: packageStyle, mode: "offline" };
    throw new Error("Basemap unavailable");
  }
};
