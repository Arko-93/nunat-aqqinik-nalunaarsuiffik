import { CORRIDOR_BBOX, MAX_PACK_BYTES } from "../map/meter-bands.ts";

export type PackFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type CorridorPackManifest = {
  id: string;
  slug: string;
  title: { kl: string; da: string; en: string };
  bbox: [number, number, number, number];
  bytes: number;
  createdAt: string;
  files: PackFile[];
  /** App-shell assets may use Cache API; large *.pmtiles go to OPFS. */
  storage: {
    opfs: string[];
    cache: string[];
  };
  notForNavigation: true;
};

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

export function parseManifest(raw: unknown): CorridorPackManifest {
  if (!raw || typeof raw !== "object") {
    throw new PackError("Invalid pack manifest");
  }
  const m = raw as Partial<CorridorPackManifest>;
  if (typeof m.id !== "string" || m.id.length === 0) {
    throw new PackError("Manifest missing id");
  }
  if (typeof m.slug !== "string") {
    throw new PackError("Manifest missing slug");
  }
  if (!Array.isArray(m.bbox) || m.bbox.length !== 4) {
    throw new PackError("Manifest missing bbox");
  }
  if (typeof m.bytes !== "number" || m.bytes <= 0) {
    throw new PackError("Manifest missing bytes");
  }
  if (m.bytes > MAX_PACK_BYTES) {
    throw new PackError(
      `Pack ${m.bytes} bytes exceeds ${MAX_PACK_BYTES} cap`,
    );
  }
  if (!Array.isArray(m.files) || m.files.length === 0) {
    throw new PackError("Manifest missing files");
  }
  if (m.notForNavigation !== true) {
    throw new PackError("Manifest must set notForNavigation: true");
  }
  return m as CorridorPackManifest;
}

export function assertCorridorBbox(
  bbox: ReadonlyArray<number>,
): boolean {
  return (
    bbox.length === 4 &&
    bbox[0] === CORRIDOR_BBOX[0] &&
    bbox[1] === CORRIDOR_BBOX[1] &&
    bbox[2] === CORRIDOR_BBOX[2] &&
    bbox[3] === CORRIDOR_BBOX[3]
  );
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPackFiles(
  manifest: CorridorPackManifest,
  buffers: ReadonlyMap<string, ArrayBuffer>,
): Promise<void> {
  for (const file of manifest.files) {
    const buffer = buffers.get(file.path);
    if (!buffer) {
      throw new PackError(`Missing pack file ${file.path}`);
    }
    if (buffer.byteLength !== file.bytes) {
      throw new PackError(
        `Byte size mismatch for ${file.path}: ${buffer.byteLength} != ${file.bytes}`,
      );
    }
    const hash = await sha256Hex(buffer);
    if (hash !== file.sha256) {
      throw new PackError(`Checksum mismatch for ${file.path}`);
    }
  }
}
