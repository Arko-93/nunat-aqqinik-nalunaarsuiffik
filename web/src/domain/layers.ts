import {
  MUNICIPALITY_BY_CODE,
  NON_MUNICIPALITY_CODES,
} from "./placename.ts";
import type { Placename } from "./placename.ts";

/** Map content lens — inhabited places are the default decision surface. */
export type ContentLens = "inhabited" | "geography";

export type GeographyGroup = "waters" | "islands" | "landforms";

/** null = all; number = kommune; "outside" = national park / non-municipal. */
export type MunicipalityFilter = number | "outside" | null;

const WATER_TYPES = new Set([
  10, 18, 56, 57, 86, 166, 164, 167, 170, 178, 186,
]);
const ISLAND_TYPES = new Set([73, 181, 182, 183]);
const LANDFORM_TYPES = new Set([
  12, 13, 35, 44, 49, 54, 59, 101, 105, 117, 118, 143, 187,
]);

export const geographyGroupFor = (
  place: Placename,
): GeographyGroup | null => {
  if (place.isLocality) return null;
  if (WATER_TYPES.has(place.typeCode)) return "waters";
  if (ISLAND_TYPES.has(place.typeCode)) return "islands";
  if (LANDFORM_TYPES.has(place.typeCode)) return "landforms";
  return "landforms";
};

export type LayerState = {
  lens: ContentLens;
  geography: ReadonlySet<GeographyGroup>;
  municipalityFilter: MunicipalityFilter;
};

export const defaultLayerState = (): LayerState => ({
  lens: "inhabited",
  geography: new Set<GeographyGroup>(["waters", "islands", "landforms"]),
  municipalityFilter: null,
});

export const MUNICIPALITY_OPTIONS: ReadonlyArray<{
  value: MunicipalityFilter;
  label: string;
}> = [
  { value: null, label: "All areas" },
  ...Object.entries(MUNICIPALITY_BY_CODE)
    .map(([code, label]) => ({
      value: Number(code) as MunicipalityFilter,
      label,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "da")),
  { value: "outside", label: "Outside municipalities" },
];

/**
 * Map-first gazetteer: all names discoverable by zoom/browse.
 * Locality shadow duplicates stay hidden.
 */
export const gazetteerVisible = (place: Placename): boolean =>
  !place.isLocalityShadow;

/** @deprecated Lens filters removed from map-first UI; prefer gazetteerVisible. */
export const placeVisible = (
  place: Placename,
  layers: LayerState,
): boolean => {
  if (place.isLocalityShadow) return false;

  const filter = layers.municipalityFilter;
  if (typeof filter === "number") {
    if (place.municipalityCode !== filter) return false;
  } else if (filter === "outside") {
    if (
      place.municipalityCode == null ||
      !NON_MUNICIPALITY_CODES.has(place.municipalityCode)
    ) {
      return false;
    }
  }

  if (layers.lens === "inhabited") {
    return place.isLocality;
  }

  // Geography lens: keep towns as anchors; show named geography groups.
  // Settlements stay on the inhabited lens so the modes feel different.
  if (place.featureKind === "town") return true;
  if (place.isLocality) return false;
  const group = geographyGroupFor(place);
  return group != null && layers.geography.has(group);
};
