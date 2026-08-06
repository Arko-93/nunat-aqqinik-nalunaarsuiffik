import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CORRIDOR_BBOX, MAX_PACK_BYTES } from "./corridor-policy.ts";
import {
  assertCorridorBbox,
  isTerrainOfflineReady,
  parseManifest,
  sha256Hex,
  verifyPackFiles,
} from "./manifest.ts";

const fixtureManifest = {
  id: "corridor_qaarsut_kullorsuaq_fixture_2026-08-05",
  slug: "qaarsut-kullorsuaq",
  title: {
    kl: "Qaarsut–Kullorsuaq (fixture)",
    da: "Qaarsut–Kullorsuaq (fixture)",
    en: "Qaarsut–Kullorsuaq (fixture)",
  },
  bbox: [...CORRIDOR_BBOX] as [number, number, number, number],
  bytes: 22,
  createdAt: "2026-08-05T00:00:00Z",
  kind: "stub" as const,
  files: [
    {
      path: "localities.geojson",
      bytes: 22,
      sha256:
        "e9f838dc5320ce31ce76ee05a451d634defa01f5e119d7041773a2fb8d4ba7c7",
    },
  ],
  storage: {
    opfs: ["localities.geojson"],
    cache: ["manifest.json"],
  },
  notForNavigation: true as const,
  notes: "Tiny Vitest fixture — not terrain-offline capable.",
};

describe("corridor pack manifest contracts", () => {
  it("accepts the Qaarsut→Kullorsuaq fixture manifest as a stub", () => {
    const parsed = parseManifest(fixtureManifest);
    expect(parsed.id).toContain("qaarsut_kullorsuaq");
    expect(assertCorridorBbox(parsed.bbox)).toBe(true);
    expect(parsed.bytes).toBeLessThanOrEqual(MAX_PACK_BYTES);
    expect(parsed.notForNavigation).toBe(true);
    expect(parsed.kind).toBe("stub");
    expect(isTerrainOfflineReady(parsed)).toBe(false);
  });

  it("rejects packs over the 250 MB cap", () => {
    expect(() =>
      parseManifest({
        ...fixtureManifest,
        bytes: MAX_PACK_BYTES + 1,
      }),
    ).toThrow(/exceeds/);
  });

  it("rejects manifests that omit not-for-navigation", () => {
    const { notForNavigation: _, ...rest } = fixtureManifest;
    expect(() => parseManifest(rest)).toThrow(/notForNavigation/);
  });

  it("rejects invalid title/sha256/storage fields", () => {
    expect(() =>
      parseManifest({ ...fixtureManifest, title: { kl: "x" } }),
    ).toThrow(/title/);
    expect(() =>
      parseManifest({
        ...fixtureManifest,
        files: [{ path: "a", bytes: 1, sha256: "nope" }],
      }),
    ).toThrow(/sha256/);
    expect(() =>
      parseManifest({ ...fixtureManifest, storage: { opfs: [], cache: 1 } }),
    ).toThrow(/storage/);
  });

  it("rejects kind=full without terrain PMTiles", () => {
    expect(() =>
      parseManifest({ ...fixtureManifest, kind: "full" }),
    ).toThrow(/land-relief\.pmtiles/);
    // The coastline mask file is part of the offline terrain contract and
    // must be named in the error (online path: packages/coastline-land/land.pmtiles).
    expect(() =>
      parseManifest({ ...fixtureManifest, kind: "full" }),
    ).toThrow(/coastline-land\/land\.pmtiles/);
  });

  it("accepts kind=full when all terrain files are present", () => {
    const files = [
      ...fixtureManifest.files,
      { path: "land-relief.pmtiles", bytes: 1, sha256: "a".repeat(64) },
      { path: "ocean-depth-dem.pmtiles", bytes: 1, sha256: "b".repeat(64) },
      { path: "ocean-depth-vector.pmtiles", bytes: 1, sha256: "c".repeat(64) },
      { path: "coastline-land/land.pmtiles", bytes: 1, sha256: "d".repeat(64) },
    ];
    const parsed = parseManifest({
      ...fixtureManifest,
      kind: "full",
      files,
    });
    expect(parsed.kind).toBe("full");
    expect(isTerrainOfflineReady(parsed)).toBe(true);
  });

  it("never claims terrain-offline for a stub even with terrain files listed", () => {
    // A stub that lists the terrain paths but stays kind=stub must not
    // flip the UI to ready — only kind=full + all files qualifies.
    const files = [
      ...fixtureManifest.files,
      { path: "land-relief.pmtiles", bytes: 1, sha256: "a".repeat(64) },
      { path: "ocean-depth-dem.pmtiles", bytes: 1, sha256: "b".repeat(64) },
      { path: "ocean-depth-vector.pmtiles", bytes: 1, sha256: "c".repeat(64) },
      { path: "coastline-land/land.pmtiles", bytes: 1, sha256: "d".repeat(64) },
    ];
    const parsed = parseManifest({
      ...fixtureManifest,
      kind: "stub",
      files,
    });
    expect(parsed.kind).toBe("stub");
    expect(isTerrainOfflineReady(parsed)).toBe(false);
  });

  it("accepts the shipped full pack manifest from public/packages", () => {
    let raw: string;
    try {
      raw = readFileSync(
        resolve(
          process.cwd(),
          "public/packages/qaarsut-kullorsuaq/manifest.json",
        ),
        "utf-8",
      );
    } catch (cause) {
      throw new Error(
        "Missing shipped manifest — run web/scripts/build-corridor-pack.py",
        { cause },
      );
    }
    let parsedManifest: ReturnType<typeof parseManifest>;
    try {
      parsedManifest = parseManifest(JSON.parse(raw));
    } catch (cause) {
      throw new Error("Shipped manifest is invalid", { cause });
    }
    const parsed = parsedManifest;
    expect(parsed.kind).toBe("full");
    expect(parsed.id).toContain("corridor_qaarsut_kullorsuaq");
    expect(assertCorridorBbox(parsed.bbox)).toBe(true);
    expect(parsed.bytes).toBeLessThanOrEqual(MAX_PACK_BYTES);
    expect(parsed.notForNavigation).toBe(true);
    expect(isTerrainOfflineReady(parsed)).toBe(true);
    const paths = parsed.files.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "land-relief.pmtiles",
        "ocean-depth-dem.pmtiles",
        "ocean-depth-vector.pmtiles",
        "coastline-land/land.pmtiles",
        "localities.geojson",
      ]),
    );
    // Honest notes: the pack must say what is NOT offline, not overclaim.
    expect(parsed.notes?.toLowerCase()).toContain("not for navigation");
    expect(parsed.notes).toContain("256 px");
  });

  it("ships non-empty corridor localities in the full pack", () => {
    // A kind=full pack must carry its corridor's localities — an empty
    // localities.geojson is a stub artifact, not a full pack. The build
    // script refuses to emit an empty file; this test guards the shipped
    // file so a regression fails here.
    let raw: string;
    try {
      raw = readFileSync(
        resolve(
          process.cwd(),
          "public/packages/qaarsut-kullorsuaq/localities.geojson",
        ),
        "utf-8",
      );
    } catch (cause) {
      throw new Error(
        "Missing shipped localities — run web/scripts/build-corridor-pack.py",
        { cause },
      );
    }
    let collection: {
      type: string;
      features: Array<{
        geometry: { type: string; coordinates: [number, number] };
        properties: { featureKind: string; officialName: string };
      }>;
    };
    try {
      collection = JSON.parse(raw) as typeof collection;
    } catch (cause) {
      throw new Error("Shipped localities are invalid JSON", { cause });
    }
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features.length).toBeGreaterThan(0);

    const [w, s, e, n] = CORRIDOR_BBOX;
    const kinds = new Set<string>();
    for (const feature of collection.features) {
      const [lon, lat] = feature.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(w);
      expect(lon).toBeLessThanOrEqual(e);
      expect(lat).toBeGreaterThanOrEqual(s);
      expect(lat).toBeLessThanOrEqual(n);
      kinds.add(feature.properties.featureKind);
      expect(feature.properties.officialName.length).toBeGreaterThan(0);
    }
    // Inhabited corridor places: settlements (and towns) only.
    expect([...kinds].every((kind) => kind === "settlement" || kind === "town")).toBe(true);
  });

  it("verifies fixture file checksums", async () => {
    const bytes = new TextEncoder().encode("tiny-corridor-fixture\n");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    expect(await sha256Hex(buffer)).toBe(fixtureManifest.files[0]!.sha256);
    await expect(
      verifyPackFiles(
        parseManifest(fixtureManifest),
        new Map([["localities.geojson", buffer]]),
      ),
    ).resolves.toBeUndefined();
  });
});
