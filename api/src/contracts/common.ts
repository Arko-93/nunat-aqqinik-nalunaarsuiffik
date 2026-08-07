/** Shared API contract types (OpenAPI-friendly plain objects). */

export type SourceRef = {
  source_id: string;
  record_id: string | null;
};

export type Freshness = {
  status: "current" | "stale" | "unknown";
  last_observed_at: string | null;
};

export type ReleaseMeta = {
  release_id: string;
  data_as_of: string;
  freshness?: Freshness;
};

export type PlaceSummary = {
  place_id: string;
  canonical_name_kl: string | null;
  feature_type: string | null;
  municipality: string | null;
  municipality_id: string | null;
  matched_name?: string;
  matched_language?: string;
  matched_kind?: string;
};

export type PlaceName = {
  id: string;
  value: string;
  language: string;
  kind: string;
  valid_from: string | null;
  valid_to: string | null;
  source_refs: SourceRef[];
};

export type PlaceDetail = PlaceSummary & {
  status: string;
  created_at: string;
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  names: PlaceName[];
  source_refs: SourceRef[];
};

export type ExternalIdentifier = {
  id: string;
  namespace: string;
  value: string;
  valid_from: string | null;
  valid_to: string | null;
  source_refs: SourceRef[];
};

export type ConnectionService = {
  id: string;
  operator: string | null;
  capabilities: string[];
  seasonality: Record<string, unknown>;
  frequency_band: string;
  frequency_basis: string;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  source_refs: SourceRef[];
};

export type ConnectionEdge = {
  connection_id: string;
  origin_place_id: string;
  destination_place_id: string;
  direction: string;
  mode: string;
  role: "origin" | "destination";
  peer_place_id: string;
  /** Every service assertion valid on the requested effective date. */
  services: ConnectionService[];
};

export type IsolationReport = {
  effective_date: string;
  capability: "passenger";
  connected_place_ids: string[];
  isolated_place_ids: string[];
  counts: {
    places: number;
    connected: number;
    isolated: number;
  };
};

export type ConnectionFilters = {
  mode: string | null;
  capability: string | null;
  operator: string | null;
};

export type SingleDependencyReport = {
  effective_date: string;
  capability: "passenger";
  single_connection: Array<{ place_id: string; connection_id: string }>;
  single_mode: Array<{ place_id: string; mode: string }>;
  single_operator: Array<{ place_id: string; operator: string }>;
  counts: {
    single_connection: number;
    single_mode: number;
    single_operator: number;
  };
};

export type SeasonalLossEntry = {
  place_id: string;
  connected_months: number[];
  isolated_months: number[];
};

export type SeasonalLossReport = {
  year: number;
  capability: "passenger";
  losses: SeasonalLossEntry[];
  counts: {
    places_with_seasonal_loss: number;
  };
};

export type ReachabilityResult = {
  from_place_id: string;
  to_place_id: string;
  effective_date: string;
  capability: string;
  reachable: boolean;
  hops: number | null;
  path: string[];
  connections: string[];
};

export type ResolveIdentifierInput = {
  namespace: string;
  value: string;
};

export type ResolveRequest = {
  identifiers?: ResolveIdentifierInput[];
  name?: string;
  municipality_code?: number;
  coordinates?: [number, number];
};

export type ResolveCandidate = {
  place_id: string;
  confidence: number;
  reasons: string[];
};

export type ResolveResult =
  | "resolved"
  | "candidate"
  | "ambiguous"
  | "not_found";
