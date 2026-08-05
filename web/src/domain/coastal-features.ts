/**
 * NunaGIS coastal gazetteer types — keep source codes distinct.
 * Do not infer physical size or chart hazards from these markers.
 */

export const COASTAL_TYPE = {
  skerry: 143,
  island: 181,
  islandPart: 182,
  islandGroup: 183,
} as const;

export type CoastalMarkerKind =
  | "skerry"
  | "island"
  | "island_part"
  | "island_group";

/** Marker progressive disclosure (issue #12). Independent of label collision. */
export const COASTAL_MARKER_MIN_ZOOM: Readonly<
  Record<CoastalMarkerKind, number>
> = {
  island_group: 5.8,
  island: 7.0,
  island_part: 9.0,
  skerry: 9.6,
};

/** Passive legend glyphs — not chart symbology. */
export const COASTAL_MARKER_GLYPH: Readonly<
  Record<CoastalMarkerKind, string>
> = {
  skerry: "×",
  island: "○",
  island_part: "·",
  island_group: "◎",
};

export const COASTAL_TYPE_CODES: ReadonlyArray<number> = [
  COASTAL_TYPE.skerry,
  COASTAL_TYPE.island,
  COASTAL_TYPE.islandPart,
  COASTAL_TYPE.islandGroup,
];

export const isCoastalGazetteerType = (typeCode: number): boolean =>
  typeCode === COASTAL_TYPE.skerry ||
  typeCode === COASTAL_TYPE.island ||
  typeCode === COASTAL_TYPE.islandPart ||
  typeCode === COASTAL_TYPE.islandGroup;

export const coastalMarkerKind = (
  typeCode: number,
): CoastalMarkerKind | null => {
  if (typeCode === COASTAL_TYPE.skerry) return "skerry";
  if (typeCode === COASTAL_TYPE.island) return "island";
  if (typeCode === COASTAL_TYPE.islandPart) return "island_part";
  if (typeCode === COASTAL_TYPE.islandGroup) return "island_group";
  return null;
};

export const coastalMarkerMinZoomForType = (typeCode: number): number | null => {
  const kind = coastalMarkerKind(typeCode);
  return kind == null ? null : COASTAL_MARKER_MIN_ZOOM[kind];
};

/** Locality-shadow must not hide these types without explicit review. */
export const coastalTypeExemptFromLocalityShadow = (
  typeCode: number,
): boolean => isCoastalGazetteerType(typeCode);
