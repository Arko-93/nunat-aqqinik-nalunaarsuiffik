import { Schema } from "effect";

/** How a map feature relates to a canonical place identity. */
export const IdentityStatus = Schema.Literals([
  "canonical",
  "candidate",
  "upstream_only",
]).annotate({ identifier: "IdentityStatus" });
export type IdentityStatus = typeof IdentityStatus.Type;

export const IdentityCrosswalkEntry = Schema.Struct({
  featureId: Schema.String,
  placeId: Schema.String,
  identityStatus: Schema.Literals(["canonical", "candidate"]),
  globalId: Schema.String,
  officialName: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "IdentityCrosswalkEntry" });
export interface IdentityCrosswalkEntry
  extends Schema.Schema.Type<typeof IdentityCrosswalkEntry> {}

export const IdentityCrosswalk = Schema.Struct({
  generatedFrom: Schema.String,
  note: Schema.optionalKey(Schema.String),
  entries: Schema.Array(IdentityCrosswalkEntry),
}).annotate({ identifier: "IdentityCrosswalk" });
export interface IdentityCrosswalk
  extends Schema.Schema.Type<typeof IdentityCrosswalk> {}

export const EMPTY_CROSSWALK: IdentityCrosswalk = {
  generatedFrom: "empty",
  entries: [],
};

export const featureIdFromGlobalId = (globalId: string): `nunagis:${string}` =>
  `nunagis:${globalId}`;

export const crosswalkByGlobalId = (
  crosswalk: IdentityCrosswalk | null | undefined,
): Map<string, IdentityCrosswalkEntry> => {
  const map = new Map<string, IdentityCrosswalkEntry>();
  for (const entry of crosswalk?.entries ?? []) {
    map.set(entry.globalId.toUpperCase(), entry);
  }
  return map;
};

export type IdentityFields = {
  featureId: string;
  placeId: string | null;
  identityStatus: IdentityStatus;
};

/** Resolve identity fields for a NunaGIS feature. */
export const resolveIdentity = (
  globalId: string,
  byGlobalId: Map<string, IdentityCrosswalkEntry>,
): IdentityFields => {
  const featureId = featureIdFromGlobalId(globalId);
  const hit = byGlobalId.get(globalId.toUpperCase());
  if (!hit) {
    return {
      featureId,
      placeId: null,
      identityStatus: "upstream_only",
    };
  }
  return {
    featureId: hit.featureId,
    placeId: hit.placeId,
    identityStatus: hit.identityStatus,
  };
};

/** True when operational joins (reachability, services) may use placeId. */
export const hasOperationalIdentity = (
  place: { placeId: string | null; identityStatus: IdentityStatus },
): boolean => place.placeId != null && place.identityStatus !== "upstream_only";
