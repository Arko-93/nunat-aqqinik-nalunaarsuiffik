import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractLandMask,
  pathCrossesLand,
  planBoatRoutes,
  pointOnLand,
} from "./boat-route.ts";

describe("qaarsut-naajaat sea route", () => {
  it("routes through water around land, not a straight line", () => {
    const land = JSON.parse(
      readFileSync("public/packages/greenland/land.geojson", "utf8"),
    ) as GeoJSON.FeatureCollection;
    const mask = extractLandMask(land);
    expect(mask.polygons.length).toBeGreaterThan(1000);

    const from = {
      longitude: -52.690672726999935,
      latitude: 70.73553919800008,
    };
    const to = {
      longitude: -55.81008683699997,
      latitude: 73.14215463800008,
    };
    expect(pointOnLand(from.longitude, from.latitude, mask)).toBe(true);
    expect(pointOnLand(to.longitude, to.latitude, mask)).toBe(true);

    const plan = planBoatRoutes(from, to, mask, {
      biases: ["shortest"],
      budgetMs: 15_000,
      precise: true,
    });
    const route = plan.routes[0]!;
    expect(route.mode).toBe("water");
    expect(route.coordinates.length).toBeGreaterThan(2);
    expect(route.distanceM).toBeGreaterThan(320_000);
    expect(
      pathCrossesLand(route.coordinates, mask, { allowHarborEnds: true }),
    ).toBe(false);
  }, 90_000);
});
