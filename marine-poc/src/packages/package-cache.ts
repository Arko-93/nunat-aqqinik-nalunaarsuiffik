import { PackageError } from "../domain/errors.ts";
import type { CorridorPackageManifest } from "../domain/types.ts";
import {
  loadManifestFromJson,
  parseManifest,
  verifyPackageFiles,
} from "./manifest.ts";

const CACHE_NAME = "nunat-marine-packages-v2";

export type PackageInstallProgress = {
  path: string;
  loaded: number;
  total: number;
};

export type RegionCatalogEntry = {
  id: string;
  slug: string;
  path: string;
  title: { kl: string; da: string; en: string };
  description: string;
  bbox: [number, number, number, number];
  bytes: number;
  stats: { localities: number; geography: number };
};

export type RegionCatalog = {
  version: number;
  createdAt: string;
  regions: RegionCatalogEntry[];
};

export type PackageInstallResult = {
  manifest: CorridorPackageManifest;
  /** True when files were stored in CacheStorage for offline reuse. */
  cached: boolean;
};

const cacheApiAvailable = (): boolean =>
  typeof globalThis !== "undefined" && "caches" in globalThis;

const filePaths = (manifest: CorridorPackageManifest): string[] => {
  if (manifest.files && manifest.files.length > 0) {
    return manifest.files.map((file) => file.path);
  }
  return [manifest.primaryFile ?? "places.geojson", manifest.style];
};

export const openPackageCache = (): Promise<Cache> => {
  if (!cacheApiAvailable()) {
    throw new PackageError("CacheStorage unavailable in this browser");
  }
  return caches.open(CACHE_NAME);
};

export const loadRegionCatalog = async (): Promise<RegionCatalog> => {
  const response = await fetch("/packages/catalog.json", { cache: "no-store" });
  if (!response.ok) {
    throw new PackageError(`Failed to load region catalog (${response.status})`);
  }
  return (await response.json()) as RegionCatalog;
};

export const isPackageInstalled = async (
  packageBase: string,
  packageId: string,
): Promise<boolean> => {
  if (!cacheApiAvailable()) return false;
  try {
    const cache = await openPackageCache();
    const manifestResponse = await cache.match(`${packageBase}/manifest.json`);
    if (!manifestResponse) return false;
    const manifest = parseManifest(await manifestResponse.json());
    return manifest.id === packageId;
  } catch {
    return false;
  }
};

export const readCachedManifest = async (
  packageBase: string,
): Promise<CorridorPackageManifest | null> => {
  if (!cacheApiAvailable()) return null;
  try {
    const cache = await openPackageCache();
    const response = await cache.match(`${packageBase}/manifest.json`);
    if (!response) return null;
    return parseManifest(await response.json());
  } catch {
    return null;
  }
};

/** Prefetch + verify package files. Caches when CacheStorage exists. */
export const installCorridorPackage = async (
  packageBase: string,
  onProgress?: (progress: PackageInstallProgress) => void,
): Promise<PackageInstallResult> => {
  const base = packageBase.replace(/\/$/, "");
  const networkManifest = await loadManifestFromJson(
    await fetch(`${base}/manifest.json`, { cache: "no-store" }),
  );
  const paths = filePaths(networkManifest);
  const buffers = new Map<string, ArrayBuffer>();
  const canCache = cacheApiAvailable();
  const cache = canCache ? await openPackageCache() : null;

  for (const path of paths) {
    const url = `${base}/${path}`;
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
    if (cache) {
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
  }

  await verifyPackageFiles(networkManifest, buffers);

  if (cache) {
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify(networkManifest),
    );
    await cache.put(
      `${base}/manifest.json`,
      new Response(manifestBytes, {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  return { manifest: networkManifest, cached: Boolean(cache) };
};

export const deleteCorridorPackage = async (
  packageBase: string,
): Promise<void> => {
  if (!cacheApiAvailable()) return;
  const base = packageBase.replace(/\/$/, "");
  const cache = await openPackageCache();
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((request) => request.url.includes(`${base}/`))
      .map((request) => cache.delete(request)),
  );
};

export const verifyInstalledPackage = async (
  packageBase: string,
): Promise<CorridorPackageManifest> => {
  if (!cacheApiAvailable()) {
    throw new PackageError("CacheStorage unavailable in this browser");
  }
  const base = packageBase.replace(/\/$/, "");
  const cache = await openPackageCache();
  const manifestResponse = await cache.match(`${base}/manifest.json`);
  if (!manifestResponse) {
    throw new PackageError("No installed coast package");
  }
  const manifest = parseManifest(await manifestResponse.json());
  const buffers = new Map<string, ArrayBuffer>();
  for (const path of filePaths(manifest)) {
    const response = await cache.match(`${base}/${path}`);
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
