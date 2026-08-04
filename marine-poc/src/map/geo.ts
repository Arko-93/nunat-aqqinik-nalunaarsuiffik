import { haversineDistanceM, toRadians } from "../domain/trip-metrics.ts";

const EARTH_RADIUS_M = 6_371_000;

/** Destination point given start, bearing degrees, and distance meters. */
export const destinationPoint = (
  latitude: number,
  longitude: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] => {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRadians(bearingDeg);
  const φ1 = toRadians(latitude);
  const λ1 = toRadians(longitude);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
};

/** Geographic accuracy circle as a GeoJSON polygon (meters, not pixels). */
export const accuracyCirclePolygon = (
  latitude: number,
  longitude: number,
  radiusM: number,
  steps = 64,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> => {
  const radius = Math.max(radiusM, 1);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 360;
    ring.push(destinationPoint(latitude, longitude, bearing, radius));
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { radiusM: radius },
        geometry: { type: "Polygon", coordinates: [ring] },
      },
    ],
  };
};

export const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const formatSpeedKn = (speedMps: number | null): string => {
  if (speedMps == null || !Number.isFinite(speedMps)) return "—";
  return `${(speedMps * 1.94384).toFixed(1)} kn`;
};

export const formatCourse = (courseDeg: number | null): string => {
  if (courseDeg == null || !Number.isFinite(courseDeg)) return "—";
  return `${Math.round(courseDeg)}°`;
};

export { haversineDistanceM };
