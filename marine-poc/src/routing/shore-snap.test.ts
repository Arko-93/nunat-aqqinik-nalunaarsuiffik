import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractLandMask,
  nearestWaterPoint,
  pointOnLand,
} from "./boat-route.ts";

describe("nearestWaterPoint", () => {
  it("moves Qaarsut town midpoint off land onto water", () => {
    const land = JSON.parse(
      readFileSync("public/packages/greenland/land.geojson", "utf8"),
    ) as GeoJSON.FeatureCollection;
    const mask = extractLandMask(land);
    const town = {
      longitude: -52.690672726999935,
      latitude: 70.73553919800008,
    };
    expect(pointOnLand(town.longitude, town.latitude, mask)).toBe(true);
    const shore = nearestWaterPoint(town.longitude, town.latitude, mask);
    expect(shore).not.toBeNull();
    expect(pointOnLand(shore!.longitude, shore!.latitude, mask)).toBe(false);
    expect(
      Math.hypot(
        shore!.longitude - town.longitude,
        shore!.latitude - town.latitude,
      ),
    ).toBeLessThan(0.2);
  });
});
