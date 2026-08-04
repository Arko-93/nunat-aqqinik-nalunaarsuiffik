export type PlaceScope = "all" | "localities" | "geography";

export type CorridorPlace = {
  globalId: string;
  recordId: number | null;
  officialName: string;
  danishName: string | null;
  oldOfficialName: string | null;
  featureKind: string;
  typeCode: number | null;
  typeLabel: string;
  isLocality: boolean;
  municipalityName: string | null;
  localityCode: string | null;
  longitude: number;
  latitude: number;
};

const asBool = (value: unknown): boolean =>
  value === true || value === "true" || value === 1 || value === "1";

export const corridorPlaceFromFeature = (
  feature: GeoJSON.Feature,
): CorridorPlace | null => {
  if (feature.geometry?.type !== "Point") return null;
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    return null;
  }
  const officialName = String(props.officialName ?? props.name ?? "").trim();
  if (!officialName) return null;
  return {
    globalId: String(props.globalId ?? `${longitude},${latitude}`),
    recordId: typeof props.recordId === "number" ? props.recordId : null,
    officialName,
    danishName:
      typeof props.danishName === "string" && props.danishName.length > 0
        ? props.danishName
        : null,
    oldOfficialName:
      typeof props.oldOfficialName === "string" &&
      props.oldOfficialName.length > 0
        ? props.oldOfficialName
        : null,
    featureKind: String(props.featureKind ?? "other"),
    typeCode: typeof props.typeCode === "number" ? props.typeCode : null,
    typeLabel: String(props.typeLabel ?? ""),
    isLocality: asBool(props.isLocality),
    municipalityName:
      typeof props.municipalityName === "string"
        ? props.municipalityName
        : null,
    localityCode:
      typeof props.localityCode === "string" ? props.localityCode : null,
    longitude,
    latitude,
  };
};

export const placeMatchesScope = (
  place: CorridorPlace,
  scope: PlaceScope,
): boolean => {
  if (scope === "localities") return place.isLocality;
  if (scope === "geography") return !place.isLocality;
  return true;
};

export const filterPlaceCollection = (
  collection: GeoJSON.FeatureCollection,
  scope: PlaceScope,
): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: collection.features.filter((feature) => {
    const place = corridorPlaceFromFeature(feature);
    return place ? placeMatchesScope(place, scope) : false;
  }),
});
