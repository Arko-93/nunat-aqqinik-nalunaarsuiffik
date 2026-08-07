/**
 * Offline corridor pack: versioned PMTiles in OPFS; Cache API for small
 * shell assets only. Service Worker covers app shell — not tile Range I/O.
 */

import {
  isTerrainOfflineReady,
  parseManifest,
  verifyPackFiles,
  type CorridorPackManifest,
  PackError,
} from "./manifest.ts";
import { CORRIDOR_PACKAGE_BASE } from "./corridor-policy.ts";
import {
  browserOpfsRoot,
  type OpfsDirectory,
  type OpfsRootProvider,
} from "./opfs.ts";

export { CORRIDOR_PACKAGE_BASE };

export type PackProgress = {
  path: string;
  loaded: number;
  total: number;
};

export type PackInstallState =
  | { status: "absent" }
  | {
      status: "installed";
      manifest: CorridorPackManifest;
      /** True only when land+ocean PMTiles are in the pack. */
      terrainOffline: boolean;
    }
  | { status: "downloading"; progress: PackProgress; packId: string }
  | { status: "error"; message: string };

const META_DIR = "corridor-packs";
const ACTIVE_KEY = "active.json";

let opfsProvider: OpfsRootProvider = browserOpfsRoot;

/** Test seam — swap OPFS root without touching navigator. */
export function setOpfsRootProvider(provider: OpfsRootProvider): void {
  opfsProvider = provider;
}

export function resetOpfsRootProvider(): void {
  opfsProvider = browserOpfsRoot;
}

async function packsRoot(): Promise<OpfsDirectory> {
  const root = await opfsProvider();
  return root.getDirectoryHandle(META_DIR, { create: true });
}

async function writeOpfsFile(
  dir: OpfsDirectory,
  path: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  let current = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]!, { create: true });
  }
  const fileName = parts[parts.length - 1]!;
  const handle = await current.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
}

function isNotFoundError(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const name = (cause as { name?: unknown }).name;
  return name === "NotFoundError" || name === "NotFound";
}

async function deleteOpfsTree(
  dir: OpfsDirectory,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch (cause) {
    if (isNotFoundError(cause)) return;
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new PackError(`Failed to delete ${name}: ${detail}`);
  }
}

export async function readInstalledManifest(): Promise<CorridorPackManifest | null> {
  try {
    const root = await packsRoot();
    const handle = await root.getFileHandle(ACTIVE_KEY);
    const file = await handle.getFile();
    const text = await file.text();
    return parseManifest(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function getPackInstallState(): Promise<PackInstallState> {
  const manifest = await readInstalledManifest();
  if (!manifest) return { status: "absent" };
  return {
    status: "installed",
    manifest,
    terrainOffline: isTerrainOfflineReady(manifest),
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Download corridor pack into OPFS. Large files only — shell stays with SW.
 */
export async function installCorridorPack(
  packageBase: string,
  onProgress?: (progress: PackProgress) => void,
): Promise<CorridorPackManifest> {
  const base = packageBase.replace(/\/$/, "");
  const manifestResponse = await fetch(`${base}/manifest.json`, {
    cache: "no-store",
  });
  if (!manifestResponse.ok) {
    throw new PackError(
      `Failed to load pack manifest (${manifestResponse.status})`,
    );
  }
  let raw: unknown;
  try {
    raw = await manifestResponse.json();
  } catch {
    throw new PackError("Pack manifest response is not JSON");
  }
  const manifest = parseManifest(raw);
  const buffers = new Map<string, ArrayBuffer>();

  for (const file of manifest.files) {
    const url = `${base}/${file.path}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new PackError(`Failed to download ${file.path} (${response.status})`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    // Vite SPA fallback returns index.html (200 + text/html) when a pack
    // asset is missing locally — surface that before the byte-size check.
    if (contentType.includes("text/html")) {
      throw new PackError(
        `Missing pack asset ${file.path} (got HTML). Run: make web-fetch-corridor-pack`,
      );
    }
    const buffer = await response.arrayBuffer();
    onProgress?.({
      path: file.path,
      loaded: buffer.byteLength,
      total: file.bytes,
    });
    buffers.set(file.path, buffer);
  }

  await verifyPackFiles(manifest, buffers);

  const root = await packsRoot();
  const packDir = await root.getDirectoryHandle(manifest.id, { create: true });
  for (const [path, buffer] of buffers) {
    await writeOpfsFile(packDir, path, buffer);
  }
  const activeHandle = await root.getFileHandle(ACTIVE_KEY, { create: true });
  const writable = await activeHandle.createWritable();
  await writable.write(JSON.stringify(manifest));
  await writable.close();

  await requestPersistentStorage();
  return manifest;
}

export async function deleteCorridorPack(): Promise<void> {
  const root = await packsRoot();
  const active = await readInstalledManifest();
  if (active) {
    await deleteOpfsTree(root, active.id);
  }
  await deleteOpfsTree(root, ACTIVE_KEY);
}

/** Resolve a local OPFS file for MapLibre when a full pack is installed. */
export async function readPackFile(
  packId: string,
  path: string,
): Promise<ArrayBuffer | null> {
  const file = await readPackFileHandle(packId, path);
  if (!file) return null;
  return file.arrayBuffer();
}

/**
 * Resolve a pack file as an OPFS File (Blob). MapLibre tile serving reads
 * byte ranges via Blob.slice — no whole-file load into memory.
 */
export async function readPackFileHandle(
  packId: string,
  path: string,
): Promise<Blob | null> {
  try {
    const root = await packsRoot();
    const packDir = await root.getDirectoryHandle(packId);
    const parts = path.split("/").filter(Boolean);
    let current: OpfsDirectory = packDir;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]!);
    }
    const handle = await current.getFileHandle(parts[parts.length - 1]!);
    return handle.getFile();
  } catch {
    return null;
  }
}

/**
 * Pack-state change notification: the map re-applies its style when the
 * offline readiness flips (install/delete). Kept outside React so the
 * MapLibre seam stays framework-free.
 */
type PackStateListener = () => void;

const packStateListeners = new Set<PackStateListener>();

/** Subscribe to pack install/delete events; returns an unsubscribe fn. */
export function subscribePackInstallState(
  listener: PackStateListener,
): () => void {
  packStateListeners.add(listener);
  return () => {
    packStateListeners.delete(listener);
  };
}

/** Call after a pack install or delete so the map re-resolves sources. */
export function notifyPackInstallStateChanged(): void {
  for (const listener of packStateListeners) listener();
}
