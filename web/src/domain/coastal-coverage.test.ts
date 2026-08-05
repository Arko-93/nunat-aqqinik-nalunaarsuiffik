import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/coastal-feature-ids.json";
import { COASTAL_TYPE_CODES } from "./coastal-features.ts";
import { gazetteerVisible } from "./layers.ts";
import { enrichCollection, type Placename } from "./placename.ts";
import { searchPlacenames } from "./search.ts";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("coastal feature coverage (web-map preparation seam)", () => {
  it(
    "keeps every fixture GlobalID through enrich + gazetteerVisible exactly once",
    () => {
      const raw = JSON.parse(
        readFileSync(join(webRoot, "public/data/placenames.geojson"), "utf8"),
      ) as GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

      const prepared = enrichCollection(raw);
      const visible = prepared.features.filter((feature) =>
        gazetteerVisible(feature.properties),
      );

      for (const typeCode of COASTAL_TYPE_CODES) {
        const key = String(typeCode) as keyof typeof fixture.globalIdsByType;
        const expected = new Set(fixture.globalIdsByType[key]);
        expect(expected.size).toBe(
          fixture.expectedCounts[
            key as keyof typeof fixture.expectedCounts
          ],
        );

        const seen = new Map<string, number>();
        for (const feature of visible) {
          if (feature.properties.typeCode !== typeCode) continue;
          const id = feature.properties.globalId;
          seen.set(id, (seen.get(id) ?? 0) + 1);
        }

        expect(seen.size, `type ${typeCode} unique count`).toBe(expected.size);
        for (const id of expected) {
          expect(seen.get(id), `missing ${typeCode} ${id}`).toBe(1);
        }
        for (const id of seen.keys()) {
          expect(expected.has(id), `unexpected ${typeCode} ${id}`).toBe(true);
        }
      }

      expect(fixture.documentedLocalityShadowExclusions).toEqual([]);
    },
    60_000,
  );

  it("indexes every coastal type in search after preparation", () => {
    const samples = [
      { typeCode: 143, nameHint: "skerry" },
      { typeCode: 181, nameHint: "island" },
      { typeCode: 182, nameHint: "part" },
      { typeCode: 183, nameHint: "group" },
    ] as const;

    const raw = JSON.parse(
      readFileSync(join(webRoot, "public/data/placenames.geojson"), "utf8"),
    ) as GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;
    const places = enrichCollection(raw).features.map((f) => f.properties);

    for (const sample of samples) {
      const place = places.find(
        (entry) =>
          entry.typeCode === sample.typeCode && !entry.isLocalityShadow,
      );
      expect(place, sample.nameHint).toBeTruthy();
      const hits = searchPlacenames(places, place!.officialName, 24);
      expect(
        hits.some(
          (hit) =>
            hit.place.globalId === place!.globalId &&
            hit.place.typeCode === sample.typeCode,
        ),
      ).toBe(true);
    }
  }, 60_000);
});
