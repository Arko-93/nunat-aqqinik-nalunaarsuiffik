import { MUNICIPALITY_BY_CODE } from "./placename.ts";
import type { Placename } from "./placename.ts";

/** Map content lens — inhabited places are the default decision surface. */
export type ContentLens = "inhabited" | "geography";

export type GeographyGroup = "waters" | "islands" | "landforms";

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
  municipalityCode: number | null;
};

export const defaultLayerState = (): LayerState => ({
  lens: "inhabited",
  geography: new Set<GeographyGroup>(["waters", "islands"]),
  municipalityCode: null,
});

export const MUNICIPALITY_OPTIONS: ReadonlyArray<{
  code: number | null;
  label: string;
}> = [
  { code: null, label: "All municipalities" },
  ...Object.entries(MUNICIPALITY_BY_CODE)
    .map(([code, label]) => ({ code: Number(code), label }))
    .sort((a, b) => a.label.localeCompare(b.label, "da")),
];

export const placeVisible = (
  place: Placename,
  layers: LayerState,
): boolean => {
  if (place.isLocalityShadow) return false;

  if (
    layers.municipalityCode != null &&
    place.municipalityCode !== layers.municipalityCode
  ) {
    return false;
  }

  if (layers.lens === "inhabited") {
    return place.isLocality;
  }

  if (place.isLocality) return true;
  const group = geographyGroupFor(place);
  return group != null && layers.geography.has(group);
};
