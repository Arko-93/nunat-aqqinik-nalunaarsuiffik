import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "../..");

export type ApiConfig = {
  releasesDir: string;
  releaseId: string | null;
  port: number;
  host: string;
};

export const loadConfig = (): ApiConfig => ({
  releasesDir: process.env.DECISION_GEOGRAPHY_RELEASES_DIR ?? join(repoRoot, "data/releases"),
  releaseId: process.env.DECISION_GEOGRAPHY_RELEASE_ID ?? null,
  port: Number(process.env.PORT ?? "8787"),
  host: process.env.HOST ?? "127.0.0.1",
});

export type ReleasePointer = {
  release_id: string;
};

export const readReleasePointer = (releasesDir: string): ReleasePointer => {
  const pointerPath = join(releasesDir, "CURRENT");
  const raw = readFileSync(pointerPath, "utf8");
  const pointer = JSON.parse(raw) as ReleasePointer;
  if (!pointer.release_id) {
    throw new Error(`Release pointer at ${pointerPath} is missing release_id`);
  }
  return pointer;
};

export const resolveReleaseId = (config: ApiConfig): string =>
  config.releaseId ?? readReleasePointer(config.releasesDir).release_id;

export const releaseDir = (config: ApiConfig, releaseId: string): string =>
  join(config.releasesDir, releaseId);

export const releaseDbPath = (config: ApiConfig, releaseId: string): string =>
  join(releaseDir(config, releaseId), "decision-geography.db");
