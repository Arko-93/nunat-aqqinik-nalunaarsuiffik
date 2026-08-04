import { ChecksumError, PackageError } from "../domain/errors.ts";
import type {
  CorridorPackageManifest,
  PackageFile,
} from "../domain/types.ts";
import { sha256HexSync } from "./sha256.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const parseFiles = (value: unknown): ReadonlyArray<PackageFile> | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new PackageError("Manifest files must be an array");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new PackageError(`files[${index}] must be an object`);
    }
    if (typeof entry.path !== "string" || entry.path.length === 0) {
      throw new PackageError(`files[${index}].path is required`);
    }
    if (typeof entry.bytes !== "number" || entry.bytes < 0) {
      throw new PackageError(`files[${index}].bytes is invalid`);
    }
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(entry.sha256)
    ) {
      throw new PackageError(`files[${index}].sha256 is invalid`);
    }
    return {
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256.toLowerCase(),
    };
  });
};

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

  const files = parseFiles(value.files);

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
    ...(files ? { files } : {}),
    ...(typeof value.primaryFile === "string"
      ? { primaryFile: value.primaryFile }
      : {}),
    ...(typeof value.primaryBytes === "number"
      ? { primaryBytes: value.primaryBytes }
      : {}),
    ...(typeof value.primarySha256 === "string"
      ? { primarySha256: value.primarySha256.toLowerCase() }
      : {}),
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

/** Legacy single-blob verify (places.geojson / primary file). */
export const verifyPackageBytes = async (
  manifest: CorridorPackageManifest,
  data: ArrayBuffer,
): Promise<void> => {
  const expectedBytes = manifest.primaryBytes ?? manifest.bytes;
  const expectedSha = manifest.primarySha256 ?? manifest.sha256;
  if (data.byteLength !== expectedBytes) {
    throw new ChecksumError(
      `Package size mismatch: expected ${expectedBytes}, got ${data.byteLength}`,
    );
  }
  const digest = await sha256Hex(data);
  if (digest !== expectedSha.toLowerCase()) {
    throw new ChecksumError(
      `Package checksum mismatch: expected ${expectedSha}, got ${digest}`,
    );
  }
};

export const verifyPackageFiles = async (
  manifest: CorridorPackageManifest,
  buffers: ReadonlyMap<string, ArrayBuffer>,
): Promise<void> => {
  if (!manifest.files || manifest.files.length === 0) {
    const primary = manifest.primaryFile ?? "places.geojson";
    const data = buffers.get(primary);
    if (!data) {
      throw new PackageError(`Missing primary package file ${primary}`);
    }
    await verifyPackageBytes(manifest, data);
    return;
  }

  for (const file of manifest.files) {
    const data = buffers.get(file.path);
    if (!data) {
      throw new PackageError(`Missing package file ${file.path}`);
    }
    if (data.byteLength !== file.bytes) {
      throw new ChecksumError(
        `${file.path} size mismatch: expected ${file.bytes}, got ${data.byteLength}`,
      );
    }
    const digest = await sha256Hex(data);
    if (digest !== file.sha256) {
      throw new ChecksumError(
        `${file.path} checksum mismatch: expected ${file.sha256}, got ${digest}`,
      );
    }
  }

  // Recompute aggregate digest over path:sha256 lines.
  const lines = [...manifest.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}:${file.sha256}`)
    .join("\n")
    .concat("\n");
  const encoded = new TextEncoder().encode(lines);
  const aggregate = await sha256Hex(
    encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ),
  );
  if (aggregate !== manifest.sha256) {
    throw new ChecksumError(
      `Aggregate checksum mismatch: expected ${manifest.sha256}, got ${aggregate}`,
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
