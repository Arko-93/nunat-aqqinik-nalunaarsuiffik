import { describe, expect, it } from "vitest";
import { CORRIDOR_BBOX, MAX_PACK_BYTES } from "../map/meter-bands.ts";
import {
  assertCorridorBbox,
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
};

describe("corridor pack manifest contracts", () => {
  it("accepts the Qaarsut→Kullorsuaq fixture manifest", () => {
    const parsed = parseManifest(fixtureManifest);
    expect(parsed.id).toContain("qaarsut_kullorsuaq");
    expect(assertCorridorBbox(parsed.bbox)).toBe(true);
    expect(parsed.bytes).toBeLessThanOrEqual(MAX_PACK_BYTES);
    expect(parsed.notForNavigation).toBe(true);
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
