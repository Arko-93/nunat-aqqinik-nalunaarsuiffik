/**
 * Offline corridor pack: versioned PMTiles in OPFS; Cache API for small
 * shell assets only. Service Worker covers app shell — not tile Range I/O.
 */

import {
  parseManifest,
  verifyPackFiles,
  type CorridorPackManifest,
  PackError,
} from "./manifest.ts";

export type PackProgress = {
  path: string;
  loaded: number;
  total: number;
};

export type PackInstallState =
  | { status: "absent" }
  | { status: "ready"; manifest: CorridorPackManifest }
  | { status: "downloading"; progress: PackProgress; packId: string }
  | { status: "error"; message: string };

const META_DIR = "corridor-packs";
const ACTIVE_KEY = "active.json";

const opfsAvailable = (): boolean =>
  typeof navigator !== "undefined" &&
  "storage" in navigator &&
  typeof navigator.storage.getDirectory === "function";

async function packsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsAvailable()) {
    throw new PackError("OPFS unavailable in this browser");
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(META_DIR, { create: true });
}

async function writeOpfsFile(
  dir: FileSystemDirectoryHandle,
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

async function deleteOpfsTree(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name, { recursive: true });
  } catch {
    /* absent is fine */
  }
}

export async function readInstalledManifest(): Promise<CorridorPackManifest | null> {
  if (!opfsAvailable()) return null;
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
  return { status: "ready", manifest };
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
  const manifest = parseManifest(await manifestResponse.json());
  const buffers = new Map<string, ArrayBuffer>();

  for (const file of manifest.files) {
    const url = `${base}/${file.path}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new PackError(`Failed to download ${file.path} (${response.status})`);
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
  if (!opfsAvailable()) return;
  const root = await packsRoot();
  const active = await readInstalledManifest();
  if (active) {
    await deleteOpfsTree(root, active.id);
  }
  await deleteOpfsTree(root, ACTIVE_KEY);
}

/** Resolve a local OPFS file URL for MapLibre when pack is installed. */
export async function readPackFile(
  packId: string,
  path: string,
): Promise<ArrayBuffer | null> {
  if (!opfsAvailable()) return null;
  try {
    const root = await packsRoot();
    const packDir = await root.getDirectoryHandle(packId);
    const parts = path.split("/").filter(Boolean);
    let current: FileSystemDirectoryHandle = packDir;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]!);
    }
    const handle = await current.getFileHandle(parts[parts.length - 1]!);
    const file = await handle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

export const CORRIDOR_PACKAGE_BASE = "/packages/qaarsut-kullorsuaq";
