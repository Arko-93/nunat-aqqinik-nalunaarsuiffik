import type { CorridorPlace } from "./place.ts";

export type TravelSource = "place" | "gps" | "map";

/** A→B endpoint: place, live GPS, or free map pin. */
export type TravelEndpoint = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  source: TravelSource;
  typeLabel?: string;
  /** Place centroid before shore snap (NunaGIS midpoint). */
  placeLongitude?: number;
  placeLatitude?: number;
  placeGlobalId?: string;
};

export const travelEndpointFromPlace = (
  place: CorridorPlace,
): TravelEndpoint => ({
  id: `place:${place.globalId}`,
  label: place.officialName,
  longitude: place.longitude,
  latitude: place.latitude,
  source: "place",
  typeLabel: place.typeLabel || place.featureKind,
  placeLongitude: place.longitude,
  placeLatitude: place.latitude,
  placeGlobalId: place.globalId,
});

export const travelEndpointFromGps = (
  longitude: number,
  latitude: number,
  label: string,
): TravelEndpoint => ({
  id: `gps:${longitude.toFixed(5)},${latitude.toFixed(5)}`,
  label,
  longitude,
  latitude,
  source: "gps",
  typeLabel: "GPS",
});

export const travelEndpointFromMap = (
  longitude: number,
  latitude: number,
  label: string,
): TravelEndpoint => ({
  id: `map:${longitude.toFixed(5)},${latitude.toFixed(5)}`,
  label,
  longitude,
  latitude,
  source: "map",
  typeLabel: "Map",
});

export const withShorePosition = (
  point: TravelEndpoint,
  longitude: number,
  latitude: number,
): TravelEndpoint => ({
  ...point,
  longitude,
  latitude,
});
