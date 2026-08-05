import type {
  CircleLayerSpecification,
  FilterSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import {
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
  COASTAL_TYPE,
  type CoastalMarkerKind,
} from "../domain/coastal-features.ts";
import type { ZoomBand } from "../domain/importance.ts";

export const PLACENAMES_SOURCE_ID = "placenames";

const COASTAL_KINDS: ReadonlyArray<CoastalMarkerKind> = [
  "island_group",
  "island",
  "island_part",
  "skerry",
];

const TYPE_FOR_KIND: Readonly<Record<CoastalMarkerKind, number>> = {
  skerry: COASTAL_TYPE.skerry,
  island: COASTAL_TYPE.island,
  island_part: COASTAL_TYPE.islandPart,
  island_group: COASTAL_TYPE.islandGroup,
};

export const coastalMarkerLayerId = (kind: CoastalMarkerKind): string =>
  `placenames-marker-${kind}`;

export const coastalLabelLayerId = (kind: CoastalMarkerKind): string =>
  `placenames-label-${kind}`;

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
  ["!", ["in", ["get", "typeCode"], ["literal", [143, 181, 182, 183]]]],
];

export const coastalTypeFilter = (
  kind: CoastalMarkerKind,
): FilterSpecification => [
  "==",
  ["get", "typeCode"],
  TYPE_FOR_KIND[kind],
];

export type GazetteerMarkerLayer =
  | CircleLayerSpecification
  | SymbolLayerSpecification;

const GEO_COLOR = [
  "interpolate",
  ["linear"],
  ["get", "importance"],
  180,
  "#8eb9c6",
  700,
  "#d9e7ee",
] as unknown as NonNullable<
  NonNullable<CircleLayerSpecification["paint"]>["circle-color"]
>;

export function coastalMarkerLayers(
  kind: CoastalMarkerKind,
): ReadonlyArray<GazetteerMarkerLayer> {
  const minzoom = COASTAL_MARKER_MIN_ZOOM[kind];
  const filter = coastalTypeFilter(kind);
  const label: SymbolLayerSpecification = {
    id: coastalLabelLayerId(kind),
    type: "symbol",
    source: PLACENAMES_SOURCE_ID,
    minzoom,
    filter,
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
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "rgba(244, 247, 248, 0)",
        "#f4f7f8",
      ],
      "text-halo-color": "#0d2a38",
      "text-halo-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        1.45,
      ],
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        ["boolean", ["feature-state", "inactive"], false],
        0.48,
        0.92,
      ],
    },
  };

  if (kind === "skerry") {
    const marker: SymbolLayerSpecification = {
      id: coastalMarkerLayerId(kind),
      type: "symbol",
      source: PLACENAMES_SOURCE_ID,
      minzoom,
      filter,
      layout: {
        "text-field": COASTAL_MARKER_GLYPH.skerry,
        "text-font": ["Noto Sans Bold", "Noto Sans Regular"],
        "text-size": 14,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "symbol-sort-key": ["get", "importance"],
      },
      paint: {
        "text-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "rgba(244, 247, 248, 0)",
          "#e8f0f4",
        ],
        "text-halo-color": "#0d2a38",
        "text-halo-width": 1.2,
        "text-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0,
          ["boolean", ["feature-state", "inactive"], false],
          0.45,
          0.95,
        ],
      },
    };
    return [marker, label];
  }

  const radius =
    kind === "island" ? 3.4 : kind === "island_group" ? 4.2 : 2.0;
  const strokeWidth =
    kind === "island_group" ? 1.6 : kind === "island_part" ? 0.5 : 0.75;
  const fillOpacity =
    kind === "island_group" ? 0 : kind === "island_part" ? 0.7 : 0.78;
  const marker: CircleLayerSpecification = {
    id: coastalMarkerLayerId(kind),
    type: "circle",
    source: PLACENAMES_SOURCE_ID,
    minzoom,
    filter,
    paint: {
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        radius,
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        strokeWidth,
      ],
      "circle-color":
        kind === "island_part"
          ? "#9aa7ad"
          : kind === "island_group"
            ? "transparent"
            : GEO_COLOR,
      "circle-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        ["boolean", ["feature-state", "inactive"], false],
        0.42,
        fillOpacity,
      ],
      "circle-stroke-color":
        kind === "island_group" ? "#d9e7ee" : "#102029",
      "circle-stroke-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        kind === "island_group" ? 0.9 : 1,
      ],
    },
  };

  return [marker, label];
}

/** All coastal marker + label layers in draw order (groups first, skerries last). */
export function allCoastalMarkerLayers(): ReadonlyArray<GazetteerMarkerLayer> {
  return COASTAL_KINDS.flatMap((kind) => coastalMarkerLayers(kind));
}

export function coastalInteractiveLayerIds(): ReadonlyArray<string> {
  return COASTAL_KINDS.flatMap((kind) => [
    coastalMarkerLayerId(kind),
    coastalLabelLayerId(kind),
  ]);
}

export function markerKindAppearsAtZoom(
  kind: CoastalMarkerKind,
  zoom: number,
): boolean {
  return zoom >= COASTAL_MARKER_MIN_ZOOM[kind];
}
