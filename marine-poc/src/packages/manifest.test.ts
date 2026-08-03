import { describe, expect, it } from "vitest";
import { ChecksumError, PackageError } from "../domain/errors.ts";
import {
  parseManifest,
  sha256Hex,
  verifyPackageBytes,
} from "./manifest.ts";

const sample = {
  id: "corridor_uummannaq_qaarsut_2026-08-01",
  bbox: [-52.3, 70.5, -50.7, 71.0],
  minZoom: 4,
  maxZoom: 14,
  bytes: 4,
  sha256: "a".repeat(64),
  createdAt: "2026-08-01T00:00:00Z",
  layers: [
    {
      id: "places",
      source: "test",
      licence: "test",
      dataAsOf: "2026-08-01",
    },
  ],
  style: "style.json",
  attributions: ["a"],
  warnings: ["w"],
};

describe("manifest", () => {
  it("parses a valid manifest", () => {
    const manifest = parseManifest(sample);
    expect(manifest.id).toContain("uummannaq");
    expect(manifest.bbox[0]).toBe(-52.3);
  });

  it("rejects bad sha256", () => {
    expect(() => parseManifest({ ...sample, sha256: "nope" })).toThrow(
      PackageError,
    );
  });

  it("verifies package bytes", async () => {
    const data = new TextEncoder().encode("test");
    const digest = await sha256Hex(data.buffer);
    const manifest = parseManifest({
      ...sample,
      bytes: data.byteLength,
      sha256: digest,
    });
    await expect(verifyPackageBytes(manifest, data.buffer)).resolves.toBeUndefined();
    await expect(
      verifyPackageBytes(
        parseManifest({ ...sample, bytes: 3, sha256: digest }),
        data.buffer,
      ),
    ).rejects.toBeInstanceOf(ChecksumError);
  });
});
