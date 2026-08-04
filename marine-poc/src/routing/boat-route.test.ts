import { describe, expect, it } from "vitest";
import {
  planBoatRoute,
  planBoatRoutes,
  pointOnLand,
  extractLandPolygons,
  pathCrossesLand,
  routesAreDistinct,
} from "./boat-route.ts";

const squareLand = (
  west: number,
  south: number,
  east: number,
  north: number,
): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "land" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    },
  ],
});

describe("boat-route", () => {
  it("detects points on land polygons", () => {
    const land = squareLand(-52, 70, -51, 71);
    const polygons = extractLandPolygons(land);
    expect(pointOnLand(-51.5, 70.5, polygons)).toBe(true);
    expect(pointOnLand(-53, 70.5, polygons)).toBe(false);
  });

  it("routes around a land block instead of crossing it", () => {
    // Vertical land wall between start (west) and end (east).
    const land = squareLand(-51.6, 69.5, -51.4, 71.5);
    const polygons = extractLandPolygons(land);
    const route = planBoatRoute(
      { longitude: -52.2, latitude: 70.5 },
      { longitude: -50.8, latitude: 70.5 },
      land,
    );
    expect(route.mode).toBe("water");
    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(
      pathCrossesLand(route.coordinates, polygons, { allowHarborEnds: true }),
    ).toBe(false);
    const straight = 111_000 * 1.4 * Math.cos((70.5 * Math.PI) / 180);
    expect(route.distanceM).toBeGreaterThan(straight * 1.05);
  });

  it("offers distinct north and south corridors around a land wall", () => {
    const land = squareLand(-51.6, 69.5, -51.4, 71.5);
    const plan = planBoatRoutes(
      { longitude: -52.2, latitude: 70.5 },
      { longitude: -50.8, latitude: 70.5 },
      land,
    );
    expect(plan.routes.length).toBeGreaterThanOrEqual(2);
    expect(plan.routes.every((route) => route.mode === "water")).toBe(true);
    expect(
      routesAreDistinct(
        plan.routes[0]!.coordinates,
        plan.routes[1]!.coordinates,
      ),
    ).toBe(true);
  });
});
