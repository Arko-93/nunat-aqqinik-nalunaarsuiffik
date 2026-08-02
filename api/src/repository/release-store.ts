import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiConfig } from "../config.js";
import { releaseDir } from "../config.js";

export type ReleaseManifest = {
  release_id: string;
  created_at: string;
  data_as_of: string;
  record_counts?: Record<string, number>;
  checksums?: Record<string, string>;
  publication_blockers?: ReadonlyArray<{
    code: string;
    message: string;
    severity?: string;
  }>;
};

export type SourceHealth = {
  release_id: string;
  checked_at: string;
  publish_ready: boolean;
  publication_blockers?: ReleaseManifest["publication_blockers"];
  source_snapshots?: ReadonlyArray<Record<string, unknown>>;
  canonical_sources?: Record<string, number>;
};

export type LoadedRelease = {
  releaseId: string;
  dataAsOf: string;
  createdAt: string;
  manifest: ReleaseManifest;
  sourceHealth: SourceHealth;
  dbPath: string;
  manifestEtag: string;
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

export class ReleaseStore {
  constructor(private readonly config: ApiConfig) {}

  load(releaseId: string, dbPath: string): LoadedRelease {
    const dir = releaseDir(this.config, releaseId);
    const manifest = readJson<ReleaseManifest>(join(dir, "manifest.json"));
    const sourceHealth = readJson<SourceHealth>(join(dir, "source-health.json"));
    const manifestRaw = readFileSync(join(dir, "manifest.json"), "utf8");
    const manifestEtag = `"${Buffer.from(manifestRaw).toString("base64url").slice(0, 27)}"`;

    return {
      releaseId: manifest.release_id,
      dataAsOf: manifest.data_as_of,
      createdAt: manifest.created_at,
      manifest,
      sourceHealth,
      dbPath,
      manifestEtag,
    };
  }
}
