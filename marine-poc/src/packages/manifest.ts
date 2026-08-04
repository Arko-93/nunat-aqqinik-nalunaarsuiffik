import { ChecksumError, PackageError } from "../domain/errors.ts";
import type { CorridorPackageManifest } from "../domain/types.ts";
import { sha256HexSync } from "./sha256.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const parseManifest = (value: unknown): CorridorPackageManifest => {
  if (!isRecord(value)) {
    throw new PackageError("Manifest must be an object");
  }

  const bbox = value.bbox;
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((n) => typeof n === "number")
  ) {
    throw new PackageError("Manifest bbox must be [west, south, east, north]");
  }

  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new PackageError("Manifest id is required");
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    throw new PackageError("Manifest sha256 must be 64 hex characters");
  }
  if (typeof value.bytes !== "number" || value.bytes < 0) {
    throw new PackageError("Manifest bytes must be a non-negative number");
  }
  if (!Array.isArray(value.layers)) {
    throw new PackageError("Manifest layers must be an array");
  }

  const layers = value.layers.map((layer, index) => {
    if (!isRecord(layer)) {
      throw new PackageError(`Layer ${index} must be an object`);
    }
    if (typeof layer.id !== "string" || typeof layer.source !== "string") {
      throw new PackageError(`Layer ${index} missing id/source`);
    }
    if (typeof layer.licence !== "string" || typeof layer.dataAsOf !== "string") {
      throw new PackageError(`Layer ${index} missing licence/dataAsOf`);
    }
    return {
      id: layer.id,
      source: layer.source,
      licence: layer.licence,
      dataAsOf: layer.dataAsOf,
      ...(typeof layer.file === "string" ? { file: layer.file } : {}),
      ...(typeof layer.safety === "string" ? { safety: layer.safety } : {}),
    };
  });

  if (!isStringArray(value.attributions) || !isStringArray(value.warnings)) {
    throw new PackageError("attributions and warnings must be string arrays");
  }

  return {
    id: value.id,
    bbox: bbox as [number, number, number, number],
    minZoom: Number(value.minZoom ?? 0),
    maxZoom: Number(value.maxZoom ?? 14),
    bytes: value.bytes,
    sha256: value.sha256.toLowerCase(),
    createdAt: String(value.createdAt ?? ""),
    layers,
    style: String(value.style ?? "style.json"),
    attributions: value.attributions,
    warnings: value.warnings,
  };
};

export const bytesToHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Works on HTTP Tailscale previews where `crypto.subtle` is unavailable. */
export const sha256Hex = async (data: ArrayBuffer): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", data);
    return bytesToHex(digest);
  }
  return sha256HexSync(data);
};

export const verifyPackageBytes = async (
  manifest: CorridorPackageManifest,
  data: ArrayBuffer,
): Promise<void> => {
  if (data.byteLength !== manifest.bytes) {
    throw new ChecksumError(
      `Package size mismatch: expected ${manifest.bytes}, got ${data.byteLength}`,
    );
  }
  const digest = await sha256Hex(data);
  if (digest !== manifest.sha256.toLowerCase()) {
    throw new ChecksumError(
      `Package checksum mismatch: expected ${manifest.sha256}, got ${digest}`,
    );
  }
};

export const loadManifestFromJson = async (
  response: Response,
): Promise<CorridorPackageManifest> => {
  if (!response.ok) {
    throw new PackageError(`Failed to load manifest (${response.status})`);
  }
  return parseManifest(await response.json());
};
