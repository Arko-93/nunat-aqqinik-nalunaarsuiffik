import { PackageError } from "../domain/errors.ts";
import type { CorridorPackageManifest } from "../domain/types.ts";
import {
  loadManifestFromJson,
  parseManifest,
  verifyPackageFiles,
} from "./manifest.ts";

const CACHE_NAME = "nunat-marine-corridor-v1";
const PACKAGE_BASE = "/packages/uummannaq-qaarsut";

export type PackageInstallProgress = {
  path: string;
  loaded: number;
  total: number;
};

const filePaths = (manifest: CorridorPackageManifest): string[] => {
  if (manifest.files && manifest.files.length > 0) {
    return manifest.files.map((file) => file.path);
  }
  return [manifest.primaryFile ?? "places.geojson", manifest.style];
};

export const openPackageCache = (): Promise<Cache> => caches.open(CACHE_NAME);

export const isPackageInstalled = async (
  packageId: string,
): Promise<boolean> => {
  const cache = await openPackageCache();
  const manifestResponse = await cache.match(
    `${PACKAGE_BASE}/manifest.json`,
  );
  if (!manifestResponse) return false;
  try {
    const manifest = parseManifest(await manifestResponse.json());
    return manifest.id === packageId;
  } catch {
    return false;
  }
};

export const readCachedManifest = async (): Promise<
  CorridorPackageManifest | null
> => {
  const cache = await openPackageCache();
  const response = await cache.match(`${PACKAGE_BASE}/manifest.json`);
  if (!response) return null;
  return parseManifest(await response.json());
};

export const readCachedUrl = async (url: string): Promise<Response | null> => {
  const cache = await openPackageCache();
  return (await cache.match(url)) ?? null;
};

export const resolvePackageUrl = async (relativePath: string): Promise<string> => {
  const url = `${PACKAGE_BASE}/${relativePath.replace(/^\.\//, "")}`;
  const cached = await readCachedUrl(url);
  if (cached) {
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }
  return url;
};

export const installCorridorPackage = async (
  onProgress?: (progress: PackageInstallProgress) => void,
): Promise<CorridorPackageManifest> => {
  if (!("caches" in globalThis)) {
    throw new PackageError("CacheStorage unavailable in this browser");
  }

  const networkManifest = await loadManifestFromJson(
    await fetch(`${PACKAGE_BASE}/manifest.json`, { cache: "no-store" }),
  );
  const paths = filePaths(networkManifest);
  const cache = await openPackageCache();
  const buffers = new Map<string, ArrayBuffer>();

  for (const path of paths) {
    const url = `${PACKAGE_BASE}/${path}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new PackageError(`Failed to download ${path} (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    onProgress?.({
      path,
      loaded: buffer.byteLength,
      total: buffer.byteLength,
    });
    buffers.set(path, buffer);
    await cache.put(
      url,
      new Response(buffer.slice(0), {
        headers: {
          "Content-Type": contentTypeFor(path),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      }),
    );
  }

  await verifyPackageFiles(networkManifest, buffers);

  const manifestBytes = new TextEncoder().encode(
    JSON.stringify(networkManifest),
  );
  await cache.put(
    `${PACKAGE_BASE}/manifest.json`,
    new Response(manifestBytes, {
      headers: { "Content-Type": "application/json" },
    }),
  );

  return networkManifest;
};

export const deleteCorridorPackage = async (): Promise<void> => {
  if (!("caches" in globalThis)) return;
  await caches.delete(CACHE_NAME);
};

export const verifyInstalledPackage = async (): Promise<CorridorPackageManifest> => {
  const cache = await openPackageCache();
  const manifestResponse = await cache.match(
    `${PACKAGE_BASE}/manifest.json`,
  );
  if (!manifestResponse) {
    throw new PackageError("No installed corridor package");
  }
  const manifest = parseManifest(await manifestResponse.json());
  const buffers = new Map<string, ArrayBuffer>();
  for (const path of filePaths(manifest)) {
    const response = await cache.match(`${PACKAGE_BASE}/${path}`);
    if (!response) {
      throw new PackageError(`Missing cached file: ${path}`);
    }
    buffers.set(path, await response.arrayBuffer());
  }
  await verifyPackageFiles(manifest, buffers);
  return manifest;
};

const contentTypeFor = (path: string): string => {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".geojson")) return "application/geo+json";
  if (path.endsWith(".pmtiles")) return "application/vnd.pmtiles";
  return "application/octet-stream";
};
