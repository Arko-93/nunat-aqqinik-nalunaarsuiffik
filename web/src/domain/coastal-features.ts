/**
 * Single typed registry for NunaGIS coastal gazetteer types.
 * Do not infer physical size or chart hazards from these markers.
 */

export type CoastalMarkerKind =
  | "skerry"
  | "island"
  | "island_part"
  | "island_group";

export type CoastalMarkerShape = "cross" | "circle" | "dot" | "ring";

export type CoastalTypeLabelKey =
  | "typeLabelSkerry"
  | "typeLabelIsland"
  | "typeLabelIslandPart"
  | "typeLabelIslandGroup";

export type CoastalFeatureMeta = {
  readonly kind: CoastalMarkerKind;
  readonly typeCode: 143 | 181 | 182 | 183;
  readonly minZoom: number;
  readonly glyph: string;
  readonly markerShape: CoastalMarkerShape;
  /** Official NunaGIS Danish register label — also used for KL until native review. */
  readonly registerLabelDa: string;
  readonly typeLabelKey: CoastalTypeLabelKey;
  readonly importance: number;
  /** Circle radius for circle/dot/ring shapes; unused for cross. */
  readonly circleRadius: number;
  readonly circleStrokeWidth: number;
  readonly circleFillOpacity: number;
};

/** Draw order: groups first, skerries last (on top among coastal markers). */
export const COASTAL_KINDS: ReadonlyArray<CoastalMarkerKind> = [
  "island_group",
  "island",
  "island_part",
  "skerry",
];

/** Passive legend order (× · ○ · · · ◎). */
export const COASTAL_LEGEND_ORDER: ReadonlyArray<CoastalMarkerKind> = [
  "skerry",
  "island",
  "island_part",
  "island_group",
];

export const COASTAL_REGISTRY: Readonly<
  Record<CoastalMarkerKind, CoastalFeatureMeta>
> = {
  island_group: {
    kind: "island_group",
    typeCode: 183,
    minZoom: 5.8,
    glyph: "◎",
    markerShape: "ring",
    registerLabelDa: "Øgruppe",
    typeLabelKey: "typeLabelIslandGroup",
    importance: 720,
    circleRadius: 4.2,
    circleStrokeWidth: 1.6,
    circleFillOpacity: 0,
  },
  island: {
    kind: "island",
    typeCode: 181,
    minZoom: 7.0,
    glyph: "○",
    markerShape: "circle",
    registerLabelDa: "Ø",
    typeLabelKey: "typeLabelIsland",
    importance: 600,
    circleRadius: 3.4,
    circleStrokeWidth: 0.75,
    circleFillOpacity: 0.78,
  },
  island_part: {
    kind: "island_part",
    typeCode: 182,
    minZoom: 9.0,
    glyph: "·",
    markerShape: "dot",
    registerLabelDa: "Del af ø",
    typeLabelKey: "typeLabelIslandPart",
    importance: 380,
    circleRadius: 2.0,
    circleStrokeWidth: 0.5,
    circleFillOpacity: 0.7,
  },
  skerry: {
    kind: "skerry",
    typeCode: 143,
    minZoom: 9.6,
    glyph: "×",
    markerShape: "cross",
    registerLabelDa: "Skær",
    typeLabelKey: "typeLabelSkerry",
    importance: 300,
    circleRadius: 0,
    circleStrokeWidth: 0,
    circleFillOpacity: 0,
  },
};

export const COASTAL_TYPE_CODES: ReadonlyArray<number> = COASTAL_KINDS.map(
  (kind) => COASTAL_REGISTRY[kind].typeCode,
);

/** Provenance for every coastal (and other) NunaGIS midpoint feature. */
export const NUNAGIS_MIDPOINT_PROVENANCE = {
  sourceKind: "nunagis_midpoint" as const,
  layerUrl:
    "https://kort.nunagis.gl/refserver/rest/services/PlacenamesRegister/PlacenamesRegisterSearch/MapServer/1",
  registerName: "Nunat Aqqinik Nalunaarsuiffik",
  geometryKind: "midpoint" as const,
} as const;

export const coastalMetaForKind = (
  kind: CoastalMarkerKind,
): CoastalFeatureMeta => COASTAL_REGISTRY[kind];

export const coastalMetaForType = (
  typeCode: number,
): CoastalFeatureMeta | null => {
  for (const kind of COASTAL_KINDS) {
    const meta = COASTAL_REGISTRY[kind];
    if (meta.typeCode === typeCode) return meta;
  }
  return null;
};

export const isCoastalGazetteerType = (typeCode: number): boolean =>
  coastalMetaForType(typeCode) != null;

export const coastalMarkerKind = (
  typeCode: number,
): CoastalMarkerKind | null => coastalMetaForType(typeCode)?.kind ?? null;

export const coastalMarkerMinZoomForType = (
  typeCode: number,
): number | null => coastalMetaForType(typeCode)?.minZoom ?? null;

/** Locality-shadow must not hide these types without explicit review. */
export const coastalTypeExemptFromLocalityShadow = (
  typeCode: number,
): boolean => isCoastalGazetteerType(typeCode);

/** Convenience views derived from the registry (one source of truth). */
export const COASTAL_TYPE = {
  skerry: COASTAL_REGISTRY.skerry.typeCode,
  island: COASTAL_REGISTRY.island.typeCode,
  islandPart: COASTAL_REGISTRY.island_part.typeCode,
  islandGroup: COASTAL_REGISTRY.island_group.typeCode,
} as const;

export const COASTAL_MARKER_MIN_ZOOM: Readonly<
  Record<CoastalMarkerKind, number>
> = {
  island_group: COASTAL_REGISTRY.island_group.minZoom,
  island: COASTAL_REGISTRY.island.minZoom,
  island_part: COASTAL_REGISTRY.island_part.minZoom,
  skerry: COASTAL_REGISTRY.skerry.minZoom,
};

export const COASTAL_MARKER_GLYPH: Readonly<
  Record<CoastalMarkerKind, string>
> = {
  island_group: COASTAL_REGISTRY.island_group.glyph,
  island: COASTAL_REGISTRY.island.glyph,
  island_part: COASTAL_REGISTRY.island_part.glyph,
  skerry: COASTAL_REGISTRY.skerry.glyph,
};
