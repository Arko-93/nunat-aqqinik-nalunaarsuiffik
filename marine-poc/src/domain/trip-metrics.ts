import type { TrackPoint, TrackPointQuality, TripSummary } from "./types.ts";

const EARTH_RADIUS_M = 6_371_000;

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineDistanceM = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

export const trackDistanceM = (points: ReadonlyArray<TrackPoint>): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (prev.quality === "rejected" || curr.quality === "rejected") continue;
    total += haversineDistanceM(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude,
    );
  }
  return total;
};

export const durationSec = (startedAt: string, endedAt: string): number => {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
};

export type Gap = {
  fromSequence: number;
  toSequence: number;
  gapSec: number;
};

export const detectGaps = (
  points: ReadonlyArray<TrackPoint>,
  thresholdSec: number,
): ReadonlyArray<Gap> => {
  const gaps: Gap[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const gapSec =
      (Date.parse(curr.recordedAt) - Date.parse(prev.recordedAt)) / 1000;
    if (Number.isFinite(gapSec) && gapSec > thresholdSec) {
      gaps.push({
        fromSequence: prev.sequence,
        toSequence: curr.sequence,
        gapSec,
      });
    }
  }
  return gaps;
};

export const largestGapSec = (
  points: ReadonlyArray<TrackPoint>,
  thresholdSec = 0,
): number => {
  const gaps = detectGaps(points, thresholdSec);
  if (gaps.length === 0) return 0;
  return Math.max(...gaps.map((gap) => gap.gapSec));
};

const percentile = (
  sorted: ReadonlyArray<number>,
  p: number,
): number | null => {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
};

export const accuracyDistribution = (
  points: ReadonlyArray<TrackPoint>,
): { p50: number | null; p90: number | null } => {
  const values = points
    .map((point) => point.horizontalAccuracyM)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    p50: percentile(values, 50),
    p90: percentile(values, 90),
  };
};

export const summarizeTrip = (
  tripId: string,
  startedAt: string,
  endedAt: string,
  points: ReadonlyArray<TrackPoint>,
  gapThresholdSec = 30,
): TripSummary => {
  const accuracy = accuracyDistribution(points);
  return {
    tripId,
    startedAt,
    endedAt,
    durationSec: durationSec(startedAt, endedAt),
    distanceM: trackDistanceM(points),
    pointCount: points.length,
    largestGapSec: largestGapSec(points, gapThresholdSec),
    accuracyP50M: accuracy.p50,
    accuracyP90M: accuracy.p90,
    rejectedCount: points.filter((point) => point.quality === "rejected")
      .length,
    weakCount: points.filter((point) => point.quality === "weak").length,
    goodCount: points.filter((point) => point.quality === "good").length,
  };
};

export const classifyAccuracy = (
  horizontalAccuracyM: number | null,
): TrackPointQuality => {
  if (horizontalAccuracyM === null) return "weak";
  if (horizontalAccuracyM <= 25) return "good";
  if (horizontalAccuracyM <= 80) return "weak";
  return "rejected";
};
