/** Core domain types for the marine trip-notebook POC. */

export type IsoDateTime = string;

export type TrackPointProvider =
  | "core-location"
  | "fused"
  | "gnss"
  | "web";

export type TrackPointQuality = "good" | "weak" | "rejected";

export type TrackPoint = {
  tripId: string;
  sequence: number;
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  altitudeM: number | null;
  verticalAccuracyM: number | null;
  speedMps: number | null;
  courseDeg: number | null;
  recordedAt: IsoDateTime;
  provider: TrackPointProvider;
  mocked: boolean | null;
  quality: TrackPointQuality;
};

export type Visibility =
  | { type: "private" }
  | { type: "selected"; recipientIds: string[]; expiresAt?: string }
  | { type: "project"; projectId: string; purpose: string }
  | { type: "community"; stewardOrgId: string; policyVersion: string }
  | { type: "public"; consentRecordId: string };

export type KnowledgeKind =
  | "observation"
  | "personal_waypoint"
  | "community_knowledge"
  | "verified_public_facility"
  | "official_navigational_warning";

export type WaypointCategory =
  | "landing"
  | "rock_shallow"
  | "current"
  | "shelter"
  | "note";

export type RecordingProfile =
  | "normal_travel"
  | "close_approach"
  | "battery_reserve";

export type SafetyClassification =
  | "not_for_navigation"
  | "companion_only"
  | "official";

export type TripStatus = "active" | "paused" | "completed";

export type Trip = {
  id: string;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime | null;
  status: TripStatus;
  profile: RecordingProfile;
  visibility: Visibility;
  pointCount: number;
  corridorPackageId: string | null;
};

export type TripSummary = {
  tripId: string;
  startedAt: IsoDateTime;
  endedAt: IsoDateTime;
  durationSec: number;
  distanceM: number;
  pointCount: number;
  largestGapSec: number;
  accuracyP50M: number | null;
  accuracyP90M: number | null;
  rejectedCount: number;
  weakCount: number;
  goodCount: number;
};

export type ActiveTrip = {
  trip: Trip;
  lastPoint: TrackPoint | null;
  lastCommittedAt: IsoDateTime | null;
};

export type Waypoint = {
  id: string;
  tripId: string | null;
  category: WaypointCategory;
  kind: KnowledgeKind;
  note: string;
  latitude: number;
  longitude: number;
  recordedAt: IsoDateTime;
  /** POC: always private; other variants are typed for later phases. */
  visibility: Visibility;
};

export type PackageLayer = {
  id: string;
  source: string;
  licence: string;
  dataAsOf: string;
  file?: string;
  safety?: string;
};

export type PackageFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type CorridorPackageManifest = {
  id: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  bytes: number;
  sha256: string;
  createdAt: IsoDateTime;
  layers: ReadonlyArray<PackageLayer>;
  style: string;
  attributions: ReadonlyArray<string>;
  warnings: ReadonlyArray<string>;
  files?: ReadonlyArray<PackageFile>;
  primaryFile?: string;
  primaryBytes?: number;
  primarySha256?: string;
};

export type InstalledPackage = {
  manifest: CorridorPackageManifest;
  installedAt: IsoDateTime;
  verified: boolean;
  localPath: string;
};

export type ConditionKind = "weather" | "sea_ice";

export type ConditionSnapshot = {
  id: string;
  kind: ConditionKind;
  source: string;
  issuedAt: IsoDateTime;
  retrievedAt: IsoDateTime;
  validFrom: IsoDateTime;
  validTo: IsoDateTime;
  summary: Record<string, unknown>;
  disclaimer: string;
  stale: boolean;
};

export type LocationPoint = {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  altitudeM: number | null;
  verticalAccuracyM: number | null;
  speedMps: number | null;
  courseDeg: number | null;
  recordedAt: IsoDateTime;
  provider: TrackPointProvider;
  mocked: boolean | null;
};

export type TrackingSession = {
  tripId: string;
  startedAt: IsoDateTime;
  profile: RecordingProfile;
  mode: "web-foreground" | "native-background";
};

export type GpsUiState =
  | "unknown"
  | "requesting"
  | "ready"
  | "weak"
  | "denied"
  | "unavailable"
  | "recording"
  | "paused";

export type OutboxEvent = {
  id: string;
  createdAt: IsoDateTime;
  kind: string;
  payload: unknown;
  /** Sync is disabled by default in the POC. */
  flushedAt: IsoDateTime | null;
};
