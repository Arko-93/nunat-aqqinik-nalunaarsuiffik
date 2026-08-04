import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  extractLandMask,
  pathCrossesLand,
  planBoatRoutes,
  type LandMask,
  type LonLat,
} from "./boat-route.ts";

type PlaceRow = { name: string; lon: number; lat: number };

const loadLocalities = (): PlaceRow[] => {
  const places = JSON.parse(
    readFileSync("public/packages/greenland/places.geojson", "utf8"),
  ) as GeoJSON.FeatureCollection;
  const rows: PlaceRow[] = [];
  for (const feature of places.features) {
    const props = feature.properties as {
      officialName?: string;
      isLocality?: boolean;
    } | null;
    if (!props?.isLocality || !props.officialName) continue;
    if (feature.geometry?.type !== "Point") continue;
    const [lon, lat] = feature.geometry.coordinates;
    rows.push({ name: props.officialName, lon: Number(lon), lat: Number(lat) });
  }
  return rows;
};

const byName = (rows: PlaceRow[]) => {
  const map = new Map<string, LonLat>();
  for (const row of rows) {
    if (!map.has(row.name)) {
      map.set(row.name, { longitude: row.lon, latitude: row.lat });
    }
  }
  return map;
};

const pairs: Array<[string, string]> = [
  ["Qaarsut", "Naajaat"],
  ["Uummannaq", "Qaarsut"],
  ["Upernavik", "Naajaat"],
  ["Ilulissat", "Aasiaat"],
  ["Nuuk", "Maniitsoq"],
  ["Qaqortoq", "Narsaq"],
  ["Tasiilaq", "Kulusuk"],
];

describe("locality A→B sea routes", () => {
  let mask: LandMask;
  let places: Map<string, LonLat>;

  beforeAll(() => {
    const land = JSON.parse(
      readFileSync("public/packages/greenland/land.geojson", "utf8"),
    ) as GeoJSON.FeatureCollection;
    mask = extractLandMask(land);
    places = byName(loadLocalities());
  });

  for (const [aName, bName] of pairs) {
    it(
      `${aName} → ${bName} stays in water`,
      () => {
        const from = places.get(aName);
        const to = places.get(bName);
        expect(from, `missing ${aName}`).toBeTruthy();
        expect(to, `missing ${bName}`).toBeTruthy();
        const plan = planBoatRoutes(from!, to!, mask, { biases: ["shortest"] });
        const route = plan.routes[0]!;
        expect(route.mode, `${aName}→${bName}`).toBe("water");
        expect(route.coordinates.length, `${aName}→${bName}`).toBeGreaterThan(2);
        expect(
          pathCrossesLand(route.coordinates, mask, { allowHarborEnds: true }),
          `${aName}→${bName} cut land`,
        ).toBe(false);
        expect(route.distanceM, `${aName}→${bName}`).toBeGreaterThan(1_000);
      },
      60_000,
    );
  }
});
