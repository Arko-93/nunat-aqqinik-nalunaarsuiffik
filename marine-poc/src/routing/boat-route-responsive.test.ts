import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractLandMask, planBoatRoutes } from "./boat-route.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const land = JSON.parse(
  readFileSync(join(root, "public/packages/greenland/land.geojson"), "utf8"),
) as GeoJSON.FeatureCollection;

describe("responsive boat routing", () => {
  it("keeps short hops on water within a couple of seconds", () => {
    const mask = extractLandMask(land);
    const t0 = performance.now();
    const plan = planBoatRoutes(
      { longitude: -52.13, latitude: 70.68 },
      { longitude: -52.69, latitude: 70.74 },
      mask,
      { biases: ["shortest"], budgetMs: 5000, precise: true },
    );
    const ms = performance.now() - t0;
    expect(plan.routes[0]?.mode).toBe("water");
    expect(ms).toBeLessThan(3000);
  });

  it("routes Qaarsut–Naajaat on water in under 5s", () => {
    const mask = extractLandMask(land);
    const t0 = performance.now();
    const plan = planBoatRoutes(
      { longitude: -52.69067, latitude: 70.73554 },
      { longitude: -55.81009, latitude: 73.14215 },
      mask,
      { biases: ["shortest"], budgetMs: 12_000, precise: true },
    );
    const ms = performance.now() - t0;
    expect(plan.routes[0]?.mode).toBe("water");
    expect(ms).toBeLessThan(5000);
  });

  it(
    "returns a route for long hops without hanging",
    () => {
      const mask = extractLandMask(land);
      const budgetMs = 6000;
      const t0 = performance.now();
      const plan = planBoatRoutes(
        { longitude: -51.72, latitude: 64.18 }, // Nuuk
        { longitude: -52.69, latitude: 70.74 }, // Qaarsut
        mask,
        { biases: ["shortest"], budgetMs, precise: false },
      );
      const ms = performance.now() - t0;
      expect(plan.routes.length).toBeGreaterThan(0);
      expect(plan.routes[0]?.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(ms).toBeLessThan(budgetMs + 2000);
    },
    15_000,
  );
});
