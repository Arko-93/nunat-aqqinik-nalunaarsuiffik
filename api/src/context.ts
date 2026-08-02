import type { Freshness, ReleaseMeta, SourceRef } from "./contracts/common.js";
import type { LoadedRelease } from "./repository/release-store.js";
import type { SqliteRepository } from "./repository/sqlite-repository.js";

export type ApiContext = {
  release: LoadedRelease;
  repository: SqliteRepository;
};

export const releaseMeta = (ctx: ApiContext): ReleaseMeta => ({
  release_id: ctx.release.releaseId,
  data_as_of: ctx.release.dataAsOf,
  freshness: freshnessMeta(ctx),
});

export const freshnessMeta = (ctx: ApiContext): Freshness => ({
  status: "current",
  last_observed_at: ctx.repository.latestObservedAt(),
});

export const withReleaseMeta = <T extends Record<string, unknown>>(
  ctx: ApiContext,
  body: T,
  sourceRefs?: SourceRef[],
): T & ReleaseMeta & { source_refs?: SourceRef[] } => ({
  ...body,
  ...releaseMeta(ctx),
  ...(sourceRefs && sourceRefs.length > 0 ? { source_refs: sourceRefs } : {}),
});

export const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const effectiveDate = (
  ctx: ApiContext,
  at: string | undefined,
): string => at ?? ctx.release.dataAsOf;
