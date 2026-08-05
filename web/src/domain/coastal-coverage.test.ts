import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COASTAL_TYPE_CODES } from "./coastal-features.ts";
import { gazetteerVisible } from "./layers.ts";
import { enrichCollection } from "./placename.ts";
import { scorePlacename, searchPlacenames } from "./search.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SNAPSHOT_DIR = join(
  repoRoot,
  "data/snapshots/nunagis_placenames_midpoint/2026-08-05",
);

type SnapshotManifest = {
  id: string;
  source_dataset_id: string;
  url: string;
  retrieved_at: string;
  checksum: string;
  media_type: string;
  licence_status: string;
  storage_path: string;
  byte_size: number;
  record_count: number;
  payload_file: string;
};

function parseManifest(raw: unknown): SnapshotManifest {
  if (raw == null || typeof raw !== "object") {
    throw new Error("manifest must be an object");
  }
  const m = raw as Record<string, unknown>;
  const required = [
    "id",
    "source_dataset_id",
    "url",
    "retrieved_at",
    "checksum",
    "media_type",
    "licence_status",
    "storage_path",
    "byte_size",
    "record_count",
    "payload_file",
  ] as const;
  for (const key of required) {
    if (m[key] == null) throw new Error(`manifest missing ${key}`);
  }
  return {
    id: String(m.id),
    source_dataset_id: String(m.source_dataset_id),
    url: String(m.url),
    retrieved_at: String(m.retrieved_at),
    checksum: String(m.checksum),
    media_type: String(m.media_type),
    licence_status: String(m.licence_status),
    storage_path: String(m.storage_path),
    byte_size: Number(m.byte_size),
    record_count: Number(m.record_count),
    payload_file: String(m.payload_file),
  };
}

function parsePointCollection(
  raw: unknown,
): GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> {
  if (raw == null || typeof raw !== "object") {
    throw new Error("snapshot payload must be an object");
  }
  const obj = raw as { type?: unknown; features?: unknown };
  if (obj.type !== "FeatureCollection" || !Array.isArray(obj.features)) {
    throw new Error("snapshot payload must be a FeatureCollection");
  }
  const features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[] =
    [];
  for (const feature of obj.features) {
    if (feature == null || typeof feature !== "object") {
      throw new Error("invalid feature");
    }
    const f = feature as {
      type?: unknown;
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: unknown;
    };
    if (f.type !== "Feature" || f.geometry?.type !== "Point") {
      throw new Error("feature must be a Point");
    }
    if (!Array.isArray(f.geometry.coordinates)) {
      throw new Error("point coordinates required");
    }
    if (f.properties == null || typeof f.properties !== "object") {
      throw new Error("feature properties required");
    }
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: f.geometry.coordinates as [number, number],
      },
      properties: f.properties as Record<string, unknown>,
    });
  }
  return { type: "FeatureCollection", features };
}

function loadImmutableCoastalSnapshot(): {
  manifest: SnapshotManifest;
  collection: GeoJSON.FeatureCollection<
    GeoJSON.Point,
    Record<string, unknown>
  >;
} {
  const manifest = parseManifest(
    JSON.parse(readFileSync(join(SNAPSHOT_DIR, "manifest.json"), "utf8")),
  );
  expect(manifest.url).toContain("MapServer/1");
  expect(manifest.retrieved_at.length).toBeGreaterThan(0);
  expect(manifest.checksum.startsWith("sha256:")).toBe(true);
  expect(manifest.byte_size).toBeGreaterThan(0);
  expect(manifest.storage_path).toContain(
    "nunagis_placenames_midpoint/2026-08-05",
  );

  const bytes = readFileSync(join(SNAPSHOT_DIR, manifest.payload_file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(`sha256:${sha256}`, "immutable snapshot checksum").toBe(
    manifest.checksum,
  );
  expect(bytes.byteLength, "immutable snapshot byte size").toBe(
    manifest.byte_size,
  );

  const collection = parsePointCollection(JSON.parse(bytes.toString("utf8")));
  expect(collection.features.length).toBe(manifest.record_count);
  return { manifest, collection };
}

describe("coastal feature coverage (immutable data/snapshots seam)", () => {
  it(
    "keeps every snapshot GlobalID through enrich + gazetteerVisible exactly once",
    () => {
      const { collection } = loadImmutableCoastalSnapshot();
      const expectedByType = new Map<number, Set<string>>();
      for (const typeCode of COASTAL_TYPE_CODES) {
        expectedByType.set(typeCode, new Set());
      }
      for (const feature of collection.features) {
        const typeCode = Number(feature.properties.typeCode);
        const globalId = String(feature.properties.globalId);
        expectedByType.get(typeCode)?.add(globalId);
      }

      expect(expectedByType.get(143)?.size).toBe(237);
      expect(expectedByType.get(181)?.size).toBe(4335);
      expect(expectedByType.get(182)?.size).toBe(20);
      expect(expectedByType.get(183)?.size).toBe(1002);

      const prepared = enrichCollection(collection);
      const visible = prepared.features.filter((feature) =>
        gazetteerVisible(feature.properties),
      );

      for (const typeCode of COASTAL_TYPE_CODES) {
        const expected = expectedByType.get(typeCode)!;
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
    },
    60_000,
  );

  it(
    "indexes every coastal record in search after preparation",
    () => {
      const { collection } = loadImmutableCoastalSnapshot();
      const places = enrichCollection(collection).features.map(
        (f) => f.properties,
      );
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

      const sample = coastal[0]!;
      const hits = searchPlacenames(places, sample.officialName, 24);
      expect(
        hits.some((hit) => hit.place.globalId === sample.globalId),
      ).toBe(true);
    },
    120_000,
  );
});
