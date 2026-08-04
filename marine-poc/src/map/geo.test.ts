import { describe, expect, it } from "vitest";
import { accuracyCirclePolygon, destinationPoint } from "./geo.ts";

describe("geo accuracy circle", () => {
  it("builds a closed polygon around a point", () => {
    const collection = accuracyCirclePolygon(70.67, -52.12, 50, 32);
    const ring = collection.features[0]?.geometry.coordinates[0];
    expect(ring).toBeDefined();
    expect(ring!.length).toBe(33);
    expect(ring![0]).toEqual(ring![ring!.length - 1]);
  });

  it("moves roughly north by distance", () => {
    const [lon, lat] = destinationPoint(70.0, -52.0, 0, 1000);
    expect(lon).toBeCloseTo(-52.0, 3);
    expect(lat).toBeGreaterThan(70.0);
  });
});
