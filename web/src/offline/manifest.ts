import {
  CORRIDOR_BBOX,
  MAX_PACK_BYTES,
  TERRAIN_OFFLINE_FILES,
} from "./corridor-policy.ts";

export type PackFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type PackKind = "stub" | "full";

export type CorridorPackManifest = {
  id: string;
  slug: string;
  title: { kl: string; da: string; en: string };
  bbox: [number, number, number, number];
  bytes: number;
  createdAt: string;
  files: PackFile[];
  storage: {
    opfs: string[];
    cache: string[];
  };
  notForNavigation: true;
  /**
   * stub = wiring/fixture only (no terrain tiles offline).
   * full = land + ocean PMTiles present for corridor offline.
   */
  kind: PackKind;
  notes?: string;
};

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTitle(raw: unknown): { kl: string; da: string; en: string } {
  if (!raw || typeof raw !== "object") {
    throw new PackError("Manifest title must be an object");
  }
  const title = raw as Record<string, unknown>;
  for (const locale of ["kl", "da", "en"] as const) {
    if (typeof title[locale] !== "string" || title[locale].trim().length === 0) {
      throw new PackError(`Manifest title.${locale} must be a non-empty string`);
    }
  }
  return {
    kl: title.kl as string,
    da: title.da as string,
    en: title.en as string,
  };
}

function parseBbox(raw: unknown): [number, number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 4) {
    throw new PackError("Manifest bbox must be [W,S,E,N]");
  }
  const bbox = raw.map((n) => {
    if (!isFiniteNumber(n)) {
      throw new PackError("Manifest bbox values must be finite numbers");
    }
    return n;
  });
  const [w, s, e, n] = bbox;
  if (w >= e || s >= n) {
    throw new PackError("Manifest bbox must have W<E and S<N");
  }
  return [w, s, e, n];
}

function parseFiles(raw: unknown): PackFile[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PackError("Manifest files must be a non-empty array");
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new PackError(`Manifest files[${index}] must be an object`);
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string" || file.path.trim().length === 0) {
      throw new PackError(`Manifest files[${index}].path invalid`);
    }
    if (!isFiniteNumber(file.bytes) || file.bytes <= 0) {
      throw new PackError(`Manifest files[${index}].bytes invalid`);
    }
    if (typeof file.sha256 !== "string" || !SHA256_RE.test(file.sha256)) {
      throw new PackError(
        `Manifest files[${index}].sha256 must be 64 lowercase hex chars`,
      );
    }
    return {
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
    };
  });
}

function parseStorage(raw: unknown): { opfs: string[]; cache: string[] } {
  if (!raw || typeof raw !== "object") {
    throw new PackError("Manifest storage must be an object");
  }
  const storage = raw as Record<string, unknown>;
  const parseList = (key: "opfs" | "cache"): string[] => {
    const list = storage[key];
    if (!Array.isArray(list)) {
      throw new PackError(`Manifest storage.${key} must be an array`);
    }
    return list.map((item, index) => {
      if (typeof item !== "string" || item.trim().length === 0) {
        throw new PackError(`Manifest storage.${key}[${index}] invalid`);
      }
      return item;
    });
  };
  return { opfs: parseList("opfs"), cache: parseList("cache") };
}

function inferKind(
  explicit: unknown,
  files: ReadonlyArray<PackFile>,
): PackKind {
  if (explicit === "stub" || explicit === "full") return explicit;
  if (explicit != null) {
    throw new PackError('Manifest kind must be "stub" or "full"');
  }
  return packHasTerrainTiles(files) ? "full" : "stub";
}

export function packHasTerrainTiles(
  files: ReadonlyArray<Pick<PackFile, "path">>,
): boolean {
  const paths = new Set(files.map((file) => file.path));
  return TERRAIN_OFFLINE_FILES.every((path) => paths.has(path));
}

/** True only when the pack can serve land+ocean tiles offline. */
export function isTerrainOfflineReady(manifest: CorridorPackManifest): boolean {
  return manifest.kind === "full" && packHasTerrainTiles(manifest.files);
}

export function parseManifest(raw: unknown): CorridorPackManifest {
  if (!raw || typeof raw !== "object") {
    throw new PackError("Invalid pack manifest");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.trim().length === 0) {
    throw new PackError("Manifest missing id");
  }
  if (typeof m.slug !== "string" || m.slug.trim().length === 0) {
    throw new PackError("Manifest missing slug");
  }
  const title = parseTitle(m.title);
  const bbox = parseBbox(m.bbox);
  if (!isFiniteNumber(m.bytes) || m.bytes <= 0) {
    throw new PackError("Manifest missing bytes");
  }
  if (m.bytes > MAX_PACK_BYTES) {
    throw new PackError(
      `Pack ${m.bytes} bytes exceeds ${MAX_PACK_BYTES} cap`,
    );
  }
  if (typeof m.createdAt !== "string" || m.createdAt.trim().length === 0) {
    throw new PackError("Manifest missing createdAt");
  }
  const files = parseFiles(m.files);
  const storage = parseStorage(m.storage);
  if (m.notForNavigation !== true) {
    throw new PackError("Manifest must set notForNavigation: true");
  }
  const kind = inferKind(m.kind, files);
  if (kind === "full" && !packHasTerrainTiles(files)) {
    throw new PackError(
      `Manifest kind=full requires ${TERRAIN_OFFLINE_FILES.join(", ")}`,
    );
  }
  if (m.notes != null && typeof m.notes !== "string") {
    throw new PackError("Manifest notes must be a string when present");
  }

  return {
    id: m.id,
    slug: m.slug,
    title,
    bbox,
    bytes: m.bytes,
    createdAt: m.createdAt,
    files,
    storage,
    notForNavigation: true,
    kind,
    ...(typeof m.notes === "string" ? { notes: m.notes } : {}),
  };
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

/** Human size for pack UI (MB; unit is locale-neutral). */
export function formatPackSizeMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${rounded} MB`;
}

/** True when remote pack id or createdAt is newer than the installed pack. */
export function packUpdateAvailable(
  installed: Pick<CorridorPackManifest, "id" | "createdAt">,
  remote: Pick<CorridorPackManifest, "id" | "createdAt">,
): boolean {
  if (remote.id !== installed.id) return true;
  return remote.createdAt > installed.createdAt;
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
