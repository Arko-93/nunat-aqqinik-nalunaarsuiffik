import type { FeatureCollection, LineString, Point } from "geojson";
import { ExportError } from "../domain/errors.ts";
import type { TrackPoint, Waypoint } from "../domain/types.ts";

export type TripGeoJson = FeatureCollection<
  LineString | Point,
  Record<string, unknown>
>;

export const tripToGeoJson = (
  tripId: string,
  points: ReadonlyArray<TrackPoint>,
  waypoints: ReadonlyArray<Waypoint>,
): TripGeoJson => {
  if (points.length === 0 && waypoints.length === 0) {
    throw new ExportError("Cannot export empty trip");
  }

  const accepted = points.filter((point) => point.quality !== "rejected");
  const features: TripGeoJson["features"] = [];

  if (accepted.length >= 2) {
    features.push({
      type: "Feature",
      properties: {
        tripId,
        kind: "track",
        pointCount: accepted.length,
        timestamps: accepted.map((point) => point.recordedAt),
        horizontalAccuracyM: accepted.map((point) => point.horizontalAccuracyM),
      },
      geometry: {
        type: "LineString",
        coordinates: accepted.map((point) => [
          point.longitude,
          point.latitude,
        ]),
      },
    });
  }

  for (const point of accepted) {
    features.push({
      type: "Feature",
      properties: {
        tripId,
        kind: "track_point",
        sequence: point.sequence,
        recordedAt: point.recordedAt,
        horizontalAccuracyM: point.horizontalAccuracyM,
        speedMps: point.speedMps,
        courseDeg: point.courseDeg,
        provider: point.provider,
        quality: point.quality,
      },
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
    });
  }

  for (const waypoint of waypoints) {
    features.push({
      type: "Feature",
      properties: {
        tripId: waypoint.tripId,
        kind: "waypoint",
        category: waypoint.category,
        note: waypoint.note,
        recordedAt: waypoint.recordedAt,
        visibility: waypoint.visibility.type,
      },
      geometry: {
        type: "Point",
        coordinates: [waypoint.longitude, waypoint.latitude],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

export const tripToGeoJsonString = (
  tripId: string,
  points: ReadonlyArray<TrackPoint>,
  waypoints: ReadonlyArray<Waypoint>,
): string => JSON.stringify(tripToGeoJson(tripId, points, waypoints), null, 2);
