import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FilterSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import {
  COASTAL_KINDS,
  COASTAL_REGISTRY,
  COASTAL_TYPE_CODES,
  coastalMetaForKind,
  type CoastalMarkerKind,
} from "../domain/coastal-features.ts";
import type { ZoomBand } from "../domain/importance.ts";

export const PLACENAMES_SOURCE_ID = "placenames";
export const SELECTED_SOURCE_ID = "placenames-selected";

export const coastalMarkerLayerId = (kind: CoastalMarkerKind): string =>
  `placenames-marker-${kind}`;

export const coastalLabelLayerId = (kind: CoastalMarkerKind): string =>
  `placenames-label-${kind}`;

export const selectedCoastalMarkerLayerId = (
  kind: CoastalMarkerKind,
): string => `placenames-selected-marker-${kind}`;

export const bandCircleLayerId = (band: ZoomBand): string =>
  `placenames-circle-${band}`;

export const bandLabelLayerId = (band: ZoomBand): string =>
  `placenames-label-${band}`;

/** Exclude coastal types from generic band circles (they have dedicated markers). */
export const nonCoastalBandFilter = (
  band: ZoomBand,
): FilterSpecification => [
  "all",
  ["==", ["get", "zoomBand"], band],
  [
    "!",
    ["in", ["get", "typeCode"], ["literal", [...COASTAL_TYPE_CODES]]],
  ],
];

export const coastalTypeFilter = (
  kind: CoastalMarkerKind,
): FilterSpecification => [
  "==",
  ["get", "typeCode"],
  COASTAL_REGISTRY[kind].typeCode,
];

export type GazetteerMarkerLayer =
  | CircleLayerSpecification
  | SymbolLayerSpecification;

const GEO_COLOR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "importance"],
  180,
  "#8eb9c6",
  700,
  "#d9e7ee",
];

const selectedFalse: ExpressionSpecification = [
  "boolean",
  ["feature-state", "selected"],
  false,
];

const inactiveFalse: ExpressionSpecification = [
  "boolean",
  ["feature-state", "inactive"],
  false,
];

function coastalLabelLayer(
  kind: CoastalMarkerKind,
): SymbolLayerSpecification {
  const meta = coastalMetaForKind(kind);
  return {
    id: coastalLabelLayerId(kind),
    type: "symbol",
    source: PLACENAMES_SOURCE_ID,
    minzoom: meta.minZoom,
    filter: coastalTypeFilter(kind),
    layout: {
      "text-field": ["get", "officialName"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-variable-anchor": [
        "top",
        "bottom",
        "right",
        "left",
        "top-right",
        "top-left",
        "bottom-right",
        "bottom-left",
      ],
      "text-radial-offset": 0.85,
      "text-optional": true,
      "text-padding": 10,
      "text-max-width": 8,
      "symbol-sort-key": ["get", "importance"],
      "text-allow-overlap": false,
      // Passive coastal labels must not reserve space ahead of town/settlement labels.
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "case",
        selectedFalse,
        "rgba(244, 247, 248, 0)",
        "#f4f7f8",
      ],
      "text-halo-color": "#0d2a38",
      "text-halo-width": ["case", selectedFalse, 0, 1.45],
      "text-opacity": [
        "case",
        selectedFalse,
        0,
        inactiveFalse,
        0.48,
        0.92,
      ],
    },
  };
}

function coastalMarkerLayer(
  kind: CoastalMarkerKind,
): GazetteerMarkerLayer {
  const meta = coastalMetaForKind(kind);
  const filter = coastalTypeFilter(kind);

  if (meta.markerShape === "cross") {
    const marker: SymbolLayerSpecification = {
      id: coastalMarkerLayerId(kind),
      type: "symbol",
      source: PLACENAMES_SOURCE_ID,
      minzoom: meta.minZoom,
      filter,
      layout: {
        "text-field": meta.glyph,
        "text-font": ["Noto Sans Bold", "Noto Sans Regular"],
        "text-size": 14,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["get", "importance"],
      },
      paint: {
        "text-color": [
          "case",
          selectedFalse,
          "rgba(244, 247, 248, 0)",
          "#e8f0f4",
        ],
        "text-halo-color": "#0d2a38",
        "text-halo-width": 1.2,
        "text-opacity": [
          "case",
          selectedFalse,
          0,
          inactiveFalse,
          0.45,
          0.95,
        ],
      },
    };
    return marker;
  }

  const fillColor: ExpressionSpecification | string =
    meta.markerShape === "dot"
      ? "#9aa7ad"
      : meta.markerShape === "ring"
        ? "transparent"
        : GEO_COLOR;

  const marker: CircleLayerSpecification = {
    id: coastalMarkerLayerId(kind),
    type: "circle",
    source: PLACENAMES_SOURCE_ID,
    minzoom: meta.minZoom,
    filter,
    paint: {
      "circle-radius": ["case", selectedFalse, 0, meta.circleRadius],
      "circle-stroke-width": [
        "case",
        selectedFalse,
        0,
        meta.circleStrokeWidth,
      ],
      "circle-color": fillColor,
      "circle-opacity": [
        "case",
        selectedFalse,
        0,
        inactiveFalse,
        0.42,
        meta.circleFillOpacity,
      ],
      "circle-stroke-color":
        meta.markerShape === "ring" ? "#d9e7ee" : "#102029",
      "circle-stroke-opacity": [
        "case",
        selectedFalse,
        0,
        meta.markerShape === "ring" ? 0.9 : 1,
      ],
    },
  };
  return marker;
}

/** Selected-state coastal markers — preserve each source shape. */
export function selectedCoastalMarkerLayer(
  kind: CoastalMarkerKind,
): GazetteerMarkerLayer {
  const meta = coastalMetaForKind(kind);
  const filter = coastalTypeFilter(kind);

  if (meta.markerShape === "cross") {
    const marker: SymbolLayerSpecification = {
      id: selectedCoastalMarkerLayerId(kind),
      type: "symbol",
      source: SELECTED_SOURCE_ID,
      filter,
      layout: {
        "text-field": meta.glyph,
        "text-font": ["Noto Sans Bold", "Noto Sans Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          16,
          8,
          20,
          12,
          22,
        ],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#f4f7f8",
        "text-halo-color": "#0d2a38",
        "text-halo-width": 2,
      },
    };
    return marker;
  }

  const selectedRadius =
    meta.markerShape === "ring"
      ? meta.circleRadius + 1.5
      : meta.markerShape === "dot"
        ? meta.circleRadius + 1.2
        : meta.circleRadius + 2;
  const selectedStroke =
    meta.markerShape === "ring" ? 2.5 : meta.circleStrokeWidth + 0.8;

  const marker: CircleLayerSpecification = {
    id: selectedCoastalMarkerLayerId(kind),
    type: "circle",
    source: SELECTED_SOURCE_ID,
    filter,
    paint: {
      "circle-radius": selectedRadius,
      "circle-stroke-width": selectedStroke,
      "circle-color":
        meta.markerShape === "ring"
          ? "transparent"
          : meta.markerShape === "dot"
            ? "#c4a882"
            : "#c45c26",
      "circle-opacity": meta.markerShape === "ring" ? 0 : 1,
      "circle-stroke-color": "#f4f7f8",
      "circle-stroke-opacity": 0.95,
    },
  };
  return marker;
}

export function coastalMarkerLayers(
  kind: CoastalMarkerKind,
): ReadonlyArray<GazetteerMarkerLayer> {
  return [coastalMarkerLayer(kind), coastalLabelLayer(kind)];
}

/** All coastal marker + label layers in draw order (groups first, skerries last). */
export function allCoastalMarkerLayers(): ReadonlyArray<GazetteerMarkerLayer> {
  return COASTAL_KINDS.flatMap((kind) => coastalMarkerLayers(kind));
}

export function allSelectedCoastalMarkerLayers(): ReadonlyArray<GazetteerMarkerLayer> {
  return COASTAL_KINDS.map((kind) => selectedCoastalMarkerLayer(kind));
}

export function coastalInteractiveLayerIds(): ReadonlyArray<string> {
  return COASTAL_KINDS.flatMap((kind) => [
    coastalMarkerLayerId(kind),
    coastalLabelLayerId(kind),
  ]);
}

export function selectedCoastalInteractiveLayerIds(): ReadonlyArray<string> {
  return COASTAL_KINDS.map((kind) => selectedCoastalMarkerLayerId(kind));
}

export function markerKindAppearsAtZoom(
  kind: CoastalMarkerKind,
  zoom: number,
): boolean {
  return zoom >= COASTAL_REGISTRY[kind].minZoom;
}

/** Non-coastal selected marker (towns / other geography). */
export function selectedNonCoastalDotLayer(): CircleLayerSpecification {
  return {
    id: "placenames-selected-dot",
    type: "circle",
    source: SELECTED_SOURCE_ID,
    filter: [
      "!",
      ["in", ["get", "typeCode"], ["literal", [...COASTAL_TYPE_CODES]]],
    ],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        6.5,
        8,
        8.5,
        12,
        9.5,
      ],
      "circle-color": "#c45c26",
      "circle-opacity": 1,
      "circle-stroke-width": 1.8,
      "circle-stroke-color": "#0d2a38",
    },
  };
}
