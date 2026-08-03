import { describe, expect, it } from "vitest";
import {
  detectGaps,
  haversineDistanceM,
  summarizeTrip,
  trackDistanceM,
} from "./trip-metrics.ts";
import type { TrackPoint } from "./types.ts";

const point = (
  sequence: number,
  lat: number,
  lon: number,
  recordedAt: string,
  accuracy: number | null = 10,
): TrackPoint => ({
  tripId: "trip_1",
  sequence,
  latitude: lat,
  longitude: lon,
  horizontalAccuracyM: accuracy,
  altitudeM: null,
  verticalAccuracyM: null,
  speedMps: null,
  courseDeg: null,
  recordedAt,
  provider: "web",
  mocked: false,
  quality: accuracy !== null && accuracy > 80 ? "rejected" : "good",
});

describe("trip-metrics", () => {
  it("computes haversine distance for a short segment", () => {
    const metres = haversineDistanceM(70.7, -52.1, 70.71, -52.1);
    expect(metres).toBeGreaterThan(1000);
    expect(metres).toBeLessThan(1200);
  });

  it("sums track distance and ignores rejected hops", () => {
    const points = [
      point(1, 70.7, -52.1, "2026-08-03T12:00:00Z"),
      point(2, 70.71, -52.1, "2026-08-03T12:01:00Z"),
      point(3, 71.5, -52.1, "2026-08-03T12:02:00Z", 120),
    ];
    const distance = trackDistanceM(points);
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1500);
  });

  it("detects gaps above threshold", () => {
    const points = [
      point(1, 70.7, -52.1, "2026-08-03T12:00:00Z"),
      point(2, 70.7, -52.11, "2026-08-03T12:05:00Z"),
    ];
    const gaps = detectGaps(points, 30);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapSec).toBe(300);
  });

  it("builds a trip summary", () => {
    const points = [
      point(1, 70.7, -52.1, "2026-08-03T12:00:00Z"),
      point(2, 70.701, -52.1, "2026-08-03T12:01:00Z"),
    ];
    const summary = summarizeTrip(
      "trip_1",
      "2026-08-03T12:00:00Z",
      "2026-08-03T12:10:00Z",
      points,
    );
    expect(summary.durationSec).toBe(600);
    expect(summary.pointCount).toBe(2);
    expect(summary.goodCount).toBe(2);
    expect(summary.distanceM).toBeGreaterThan(0);
  });
});
