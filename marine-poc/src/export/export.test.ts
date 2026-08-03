import { describe, expect, it } from "vitest";
import type { TrackPoint, Waypoint } from "../domain/types.ts";
import { tripToGeoJson, type TripGeoJson } from "./geojson.ts";
import { tripToGpx } from "./gpx.ts";

const points: TrackPoint[] = [
  {
    tripId: "t1",
    sequence: 1,
    latitude: 70.7,
    longitude: -52.1,
    horizontalAccuracyM: 8,
    altitudeM: 2,
    verticalAccuracyM: null,
    speedMps: 1.2,
    courseDeg: 90,
    recordedAt: "2026-08-03T12:00:00Z",
    provider: "web",
    mocked: false,
    quality: "good",
  },
  {
    tripId: "t1",
    sequence: 2,
    latitude: 70.701,
    longitude: -52.11,
    horizontalAccuracyM: 12,
    altitudeM: null,
    verticalAccuracyM: null,
    speedMps: null,
    courseDeg: null,
    recordedAt: "2026-08-03T12:01:00Z",
    provider: "web",
    mocked: false,
    quality: "good",
  },
];

const waypoints: Waypoint[] = [
  {
    id: "w1",
    tripId: "t1",
    category: "landing",
    kind: "personal_waypoint",
    note: "Qaarsut landing",
    latitude: 70.732,
    longitude: -52.696,
    recordedAt: "2026-08-03T12:02:00Z",
    visibility: { type: "private" },
  },
];

describe("export", () => {
  it("emits GPX 1.1 with timestamps and waypoints", () => {
    const gpx = tripToGpx("trip-1", points, waypoints);
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain("<trkpt lat=");
    expect(gpx).toContain("<time>2026-08-03T12:00:00Z</time>");
    expect(gpx).toContain("<wpt lat=");
    expect(gpx).toContain("Qaarsut landing");
  });

  it("emits GeoJSON with lon,lat order and accuracy", () => {
    const geojson = tripToGeoJson("t1", points, waypoints);
    const track = geojson.features.find(
      (feature: TripGeoJson["features"][number]) => feature.properties?.kind === "track",
    );
    expect(track?.geometry.type).toBe("LineString");
    if (track?.geometry.type === "LineString") {
      expect(track.geometry.coordinates[0]).toEqual([-52.1, 70.7]);
    }
    const pointFeature = geojson.features.find(
      (feature: TripGeoJson["features"][number]) => feature.properties?.kind === "track_point",
    );
    expect(pointFeature?.properties?.horizontalAccuracyM).toBe(8);
  });
});
