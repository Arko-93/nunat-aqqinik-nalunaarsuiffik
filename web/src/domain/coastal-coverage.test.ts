import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/coastal-feature-ids.json";
import { COASTAL_TYPE_CODES } from "./coastal-features.ts";
import { gazetteerVisible } from "./layers.ts";
import { enrichCollection, type Placename } from "./placename.ts";
import { scorePlacename, searchPlacenames } from "./search.ts";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadChecksummedSnapshot(): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  Placename
> {
  const sourcePath = join(webRoot, fixture.source.path);
  const bytes = readFileSync(sourcePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(sha256, "immutable snapshot checksum").toBe(fixture.source.sha256);
  expect(bytes.byteLength, "immutable snapshot byte size").toBe(
    fixture.source.byteSize,
  );
  expect(fixture.source.upstreamLayerUrl).toContain("MapServer/1");
  return JSON.parse(bytes.toString("utf8")) as GeoJSON.FeatureCollection<
    GeoJSON.Point,
    Placename
  >;
}

describe("coastal feature coverage (web-map preparation seam)", () => {
  it(
    "keeps every fixture GlobalID through enrich + gazetteerVisible exactly once",
    () => {
      const raw = loadChecksummedSnapshot();
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

  it(
    "indexes every coastal record in search after preparation",
    () => {
      const raw = loadChecksummedSnapshot();
      const places = enrichCollection(raw).features.map((f) => f.properties);
      const coastal = places.filter((place) =>
        COASTAL_TYPE_CODES.includes(place.typeCode),
      );
      expect(coastal.length).toBe(237 + 4335 + 20 + 1002);

      const missing: string[] = [];
      for (const place of coastal) {
        const scored = scorePlacename(place, place.officialName);
        if (scored == null) {
          missing.push(`${place.typeCode}:${place.globalId}`);
          continue;
        }
        expect(scored.place.globalId).toBe(place.globalId);
        expect(scored.place.typeCode).toBe(place.typeCode);
      }
      expect(missing).toEqual([]);

      // Spot-check ranked search still returns the exact identity.
      const sample = coastal[0]!;
      const hits = searchPlacenames(places, sample.officialName, 24);
      expect(
        hits.some((hit) => hit.place.globalId === sample.globalId),
      ).toBe(true);
    },
    120_000,
  );
});
