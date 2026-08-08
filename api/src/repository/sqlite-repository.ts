import { DatabaseSync } from "node:sqlite";
import type {
  ConnectionEdge,
  ConnectionFilters,
  ConnectionService,
  ExternalIdentifier,
  IsolationReport,
  PlaceDetail,
  PlaceName,
  PlaceSummary,
  ReachabilityResult,
  ResolveCandidate,
  ResolveIdentifierInput,
  ResolveResult,
  SeasonalLossReport,
  SingleDependencyReport,
  SourceRef,
} from "../contracts/common.js";

/** SQL fragment: service valid on @at by validity window + seasonal months. */
const SERVICE_ACTIVE_ON_AT = `
  (cs.valid_from IS NULL OR cs.valid_from <= @at)
  AND (cs.valid_to IS NULL OR cs.valid_to >= @at)
  AND (
    json_extract(cs.seasonality_json, '$.kind') != 'seasonal'
    OR EXISTS (
      SELECT 1
      FROM json_each(json_extract(cs.seasonality_json, '$.months')) AS m
      WHERE CAST(m.value AS INTEGER) = CAST(strftime('%m', @at) AS INTEGER)
    )
  )
`;

const PASSENGER_CAPABILITY = `
  EXISTS (
    SELECT 1
    FROM json_each(cs.capabilities_json) AS cap
    WHERE cap.value = 'passenger'
  )
`;

const parseCsvFilter = (raw: string | null | undefined): string[] => {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  return JSON.parse(value) as T;
};

/** Build an FTS5 MATCH query: quoted tokens with prefix (`"Nuuk"*`). */
export const buildFtsMatchQuery = (raw: string): string | null => {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/"/g, '""'))
    .filter((part) => part.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(" AND ");
};

const serviceFromRow = (row: Record<string, unknown>): ConnectionService => ({
  id: row.service_id as string,
  operator: (row.operator as string | null) ?? null,
  capabilities: parseJson<string[]>(row.capabilities_json as string, []),
  seasonality: parseJson<Record<string, unknown>>(
    row.seasonality_json as string,
    {},
  ),
  frequency_band: row.frequency_band as string,
  frequency_basis: row.frequency_basis as string,
  status: row.service_status as string,
  valid_from: (row.service_valid_from as string | null) ?? null,
  valid_to: (row.service_valid_to as string | null) ?? null,
  source_refs: parseJson<SourceRef[]>(row.service_source_refs_json as string, []),
});

export class SqliteRepository {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  searchPlaces(params: {
    q: string;
    language?: string;
    limit?: number;
  }): PlaceSummary[] {
    const trimmed = params.q.trim();
    if (!trimmed) {
      return this.listPlaces(params.limit ?? 50);
    }

    const like = `%${trimmed}%`;
    const limit = params.limit ?? 50;

    if (trimmed.startsWith("plc_")) {
      const byId = this.db
        .prepare(
          `
          SELECT
            id AS place_id,
            canonical_name_kl,
            feature_type,
            municipality,
            municipality_id
          FROM current_places
          WHERE id = ?
          LIMIT 1
        `,
        )
        .all(trimmed) as PlaceSummary[];
      if (byId.length > 0) return byId;
    }

    const languageClause = params.language
      ? "AND fts.language = @language"
      : "";
    const likeLanguageClause = params.language
      ? "AND pn.language = @language"
      : "";

    const namedParams: Record<string, string | number> = {
      like,
      exact: trimmed,
      limit,
    };
    if (params.language) {
      namedParams.language = params.language;
    }

    const match = buildFtsMatchQuery(trimmed);
    if (match) {
      try {
        const ftsParams: Record<string, string | number> = {
          ...namedParams,
          match,
        };
        const ftsRows = this.db
          .prepare(
            `
            SELECT DISTINCT
              cp.id AS place_id,
              cp.canonical_name_kl,
              cp.feature_type,
              cp.municipality,
              cp.municipality_id,
              fts.value AS matched_name,
              fts.language AS matched_language,
              fts.kind AS matched_kind
            FROM place_names_fts fts
            JOIN current_places cp ON cp.id = fts.place_id
            WHERE fts MATCH @match
              ${languageClause}
            ORDER BY
              CASE WHEN LOWER(fts.value) = LOWER(@exact) THEN 0 ELSE 1 END,
              cp.canonical_name_kl
            LIMIT @limit
          `,
          )
          .all(ftsParams) as PlaceSummary[];
        if (ftsRows.length > 0) return ftsRows;
      } catch {
        // Fall through to LIKE if FTS is missing or the query is rejected.
      }
    }

    // Substring fallback (and environments without place_names_fts).
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT
          cp.id AS place_id,
          cp.canonical_name_kl,
          cp.feature_type,
          cp.municipality,
          cp.municipality_id,
          pn.value AS matched_name,
          pn.language AS matched_language,
          pn.kind AS matched_kind
        FROM current_places cp
        JOIN place_names pn ON pn.place_id = cp.id AND pn.valid_to IS NULL
        WHERE pn.value LIKE @like COLLATE NOCASE
          ${likeLanguageClause}
        ORDER BY
          CASE WHEN LOWER(pn.value) = LOWER(@exact) THEN 0 ELSE 1 END,
          cp.canonical_name_kl
        LIMIT @limit
      `,
      )
      .all(namedParams) as PlaceSummary[];

    return rows;
  }

  listPlaces(limit = 50): PlaceSummary[] {
    return this.db
      .prepare(
        `
        SELECT
          id AS place_id,
          canonical_name_kl,
          feature_type,
          municipality,
          municipality_id
        FROM current_places
        ORDER BY canonical_name_kl
        LIMIT ?
      `,
      )
      .all(limit) as PlaceSummary[];
  }

  getPlaceById(placeId: string): PlaceDetail | null {
    const row = this.db
      .prepare(
        `
        SELECT
          cp.id AS place_id,
          cp.canonical_name_kl,
          cp.feature_type,
          cp.municipality,
          cp.municipality_id,
          cp.status,
          cp.created_at,
          cp.geometry_json,
          p.source_refs_json
        FROM current_places cp
        JOIN places p ON p.id = cp.id
        WHERE cp.id = ?
      `,
      )
      .get(placeId) as
      | (PlaceSummary & {
          status: string;
          created_at: string;
          geometry_json: string | null;
          source_refs_json: string;
        })
      | undefined;

    if (!row) return null;

    const names = this.db
      .prepare(
        `
        SELECT id, value, language, kind, valid_from, valid_to, source_refs_json
        FROM place_names
        WHERE place_id = ? AND valid_to IS NULL
        ORDER BY kind, language, value
      `,
      )
      .all(placeId) as Array<{
        id: string;
        value: string;
        language: string;
        kind: string;
        valid_from: string | null;
        valid_to: string | null;
        source_refs_json: string;
      }>;

    return {
      place_id: row.place_id,
      canonical_name_kl: row.canonical_name_kl,
      feature_type: row.feature_type,
      municipality: row.municipality,
      municipality_id: row.municipality_id,
      status: row.status,
      created_at: row.created_at,
      geometry: row.geometry_json
        ? (JSON.parse(row.geometry_json) as PlaceDetail["geometry"])
        : null,
      names: names.map(
        (name): PlaceName => ({
          id: name.id,
          value: name.value,
          language: name.language,
          kind: name.kind,
          valid_from: name.valid_from,
          valid_to: name.valid_to,
          source_refs: parseJson<SourceRef[]>(name.source_refs_json, []),
        }),
      ),
      source_refs: parseJson<SourceRef[]>(row.source_refs_json, []),
    };
  }

  getPlaceIdentifiers(placeId: string): ExternalIdentifier[] {
    return (
      this.db
        .prepare(
          `
          SELECT id, namespace, value, valid_from, valid_to, source_refs_json
          FROM external_identifiers
          WHERE entity_type = 'place'
            AND entity_id = ?
            AND (valid_to IS NULL OR valid_to >= date('now'))
          ORDER BY namespace, value
        `,
        )
        .all(placeId) as Array<{
          id: string;
          namespace: string;
          value: string;
          valid_from: string | null;
          valid_to: string | null;
          source_refs_json: string;
        }>
    ).map((row) => ({
      id: row.id,
      namespace: row.namespace,
      value: row.value,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      source_refs: parseJson<SourceRef[]>(row.source_refs_json, []),
    }));
  }

  getPlaceConnections(
    placeId: string,
    at: string,
    filters: Partial<ConnectionFilters> = {},
  ): ConnectionEdge[] {
    const modeFilters = parseCsvFilter(filters.mode ?? null);
    const capabilityFilters = parseCsvFilter(filters.capability ?? null);
    const operatorFilter = filters.operator?.trim() || null;

    const rows = this.db
      .prepare(
        `
        SELECT
          c.id AS connection_id,
          c.origin_place_id,
          c.destination_place_id,
          c.direction,
          c.mode,
          cs.id AS service_id,
          cs.operator,
          cs.capabilities_json,
          cs.seasonality_json,
          cs.frequency_band,
          cs.frequency_basis,
          cs.status AS service_status,
          cs.valid_from AS service_valid_from,
          cs.valid_to AS service_valid_to,
          cs.source_refs_json AS service_source_refs_json
        FROM connections c
        LEFT JOIN connection_services cs
          ON cs.connection_id = c.id
          AND ${SERVICE_ACTIVE_ON_AT}
        WHERE c.retired_at IS NULL
          AND (c.origin_place_id = @placeId OR c.destination_place_id = @placeId)
        ORDER BY c.mode, c.id, cs.id
      `,
      )
      .all({ placeId, at }) as Array<Record<string, unknown>>;

    const byConnection = new Map<string, ConnectionEdge>();
    for (const row of rows) {
      const connectionId = row.connection_id as string;
      let edge = byConnection.get(connectionId);
      if (!edge) {
        const originPlaceId = row.origin_place_id as string;
        const destinationPlaceId = row.destination_place_id as string;
        const role: ConnectionEdge["role"] =
          originPlaceId === placeId ? "origin" : "destination";
        edge = {
          connection_id: connectionId,
          origin_place_id: originPlaceId,
          destination_place_id: destinationPlaceId,
          direction: row.direction as string,
          mode: row.mode as string,
          role,
          peer_place_id:
            role === "origin" ? destinationPlaceId : originPlaceId,
          services: [],
        };
        byConnection.set(connectionId, edge);
      }
      if (row.service_id) {
        edge.services.push(serviceFromRow(row));
      }
    }

    let edges = [...byConnection.values()];

    if (modeFilters.length > 0) {
      const modes = new Set(modeFilters.map((m) => m.toLowerCase()));
      edges = edges.filter((edge) => modes.has(edge.mode.toLowerCase()));
    }

    if (capabilityFilters.length > 0) {
      edges = edges
        .map((edge) => ({
          ...edge,
          services: edge.services.filter((service) =>
            capabilityFilters.some((cap) =>
              service.capabilities.includes(cap),
            ),
          ),
        }))
        .filter((edge) => edge.services.length > 0);
    }

    if (operatorFilter) {
      const wanted = operatorFilter.toLowerCase();
      edges = edges
        .map((edge) => ({
          ...edge,
          services: edge.services.filter(
            (service) => service.operator?.toLowerCase() === wanted,
          ),
        }))
        .filter((edge) => edge.services.length > 0);
    }

    return edges;
  }

  getPassengerIsolationReport(at: string): IsolationReport {
    return this.getCapabilityIsolationReport(at, "passenger");
  }

  getCapabilityIsolationReport(
    at: string,
    capability: "passenger" | "freight" | "emergency",
  ): IsolationReport {
    const placeIds = this.activePlaceIds();
    const connected = this.capabilityConnectedPlaceIds(at, capability);
    const connected_place_ids = placeIds.filter((id) => connected.has(id));
    const isolated_place_ids = placeIds.filter((id) => !connected.has(id));

    return {
      effective_date: at,
      capability,
      connected_place_ids,
      isolated_place_ids,
      counts: {
        places: placeIds.length,
        connected: connected_place_ids.length,
        isolated: isolated_place_ids.length,
      },
    };
  }

  getSingleDependencyReport(at: string): SingleDependencyReport {
    const rows = this.db
      .prepare(
        `
        SELECT
          c.id AS connection_id,
          c.origin_place_id,
          c.destination_place_id,
          c.mode,
          cs.operator
        FROM connections c
        JOIN connection_services cs ON cs.connection_id = c.id
        WHERE c.retired_at IS NULL
          AND ${SERVICE_ACTIVE_ON_AT}
          AND ${PASSENGER_CAPABILITY}
        ORDER BY c.id, cs.id
      `,
      )
      .all({ at }) as Array<{
        connection_id: string;
        origin_place_id: string;
        destination_place_id: string;
        mode: string;
        operator: string | null;
      }>;

    type Acc = {
      connections: Set<string>;
      modes: Set<string>;
      operators: Set<string>;
    };
    const byPlace = new Map<string, Acc>();

    const touch = (placeId: string, row: (typeof rows)[number]) => {
      let acc = byPlace.get(placeId);
      if (!acc) {
        acc = {
          connections: new Set(),
          modes: new Set(),
          operators: new Set(),
        };
        byPlace.set(placeId, acc);
      }
      acc.connections.add(row.connection_id);
      acc.modes.add(row.mode);
      if (row.operator) acc.operators.add(row.operator);
    };

    for (const row of rows) {
      touch(row.origin_place_id, row);
      touch(row.destination_place_id, row);
    }

    const single_connection: SingleDependencyReport["single_connection"] = [];
    const single_mode: SingleDependencyReport["single_mode"] = [];
    const single_operator: SingleDependencyReport["single_operator"] = [];

    for (const placeId of [...byPlace.keys()].sort()) {
      const acc = byPlace.get(placeId)!;
      if (acc.connections.size === 1) {
        single_connection.push({
          place_id: placeId,
          connection_id: [...acc.connections][0]!,
        });
      }
      if (acc.modes.size === 1) {
        single_mode.push({
          place_id: placeId,
          mode: [...acc.modes][0]!,
        });
      }
      if (acc.operators.size === 1) {
        single_operator.push({
          place_id: placeId,
          operator: [...acc.operators][0]!,
        });
      }
    }

    return {
      effective_date: at,
      capability: "passenger",
      single_connection,
      single_mode,
      single_operator,
      counts: {
        single_connection: single_connection.length,
        single_mode: single_mode.length,
        single_operator: single_operator.length,
      },
    };
  }

  getSeasonalLossReport(year: number): SeasonalLossReport {
    const placeIds = this.activePlaceIds();
    const monthConnected = new Map<number, Set<string>>();

    for (let month = 1; month <= 12; month += 1) {
      const at = `${year}-${String(month).padStart(2, "0")}-15`;
      monthConnected.set(month, this.capabilityConnectedPlaceIds(at, "passenger"));
    }

    const losses: SeasonalLossReport["losses"] = [];
    for (const placeId of placeIds) {
      const connected_months: number[] = [];
      const isolated_months: number[] = [];
      for (let month = 1; month <= 12; month += 1) {
        if (monthConnected.get(month)!.has(placeId)) {
          connected_months.push(month);
        } else {
          isolated_months.push(month);
        }
      }
      if (connected_months.length > 0 && isolated_months.length > 0) {
        losses.push({ place_id: placeId, connected_months, isolated_months });
      }
    }

    return {
      year,
      capability: "passenger",
      losses,
      counts: {
        places_with_seasonal_loss: losses.length,
      },
    };
  }

  findReachabilityPath(params: {
    fromPlaceId: string;
    toPlaceId: string;
    at: string;
    capability?: string;
    maxTransfers?: number | null;
  }): ReachabilityResult {
    const capability = params.capability?.trim() || "passenger";
    const maxTransfers =
      params.maxTransfers === undefined ? null : params.maxTransfers;
    const base = {
      from_place_id: params.fromPlaceId,
      to_place_id: params.toPlaceId,
      effective_date: params.at,
      capability,
      max_transfers: maxTransfers,
      reachable: false as boolean,
      hops: null as number | null,
      path: [] as string[],
      connections: [] as string[],
    };

    if (params.fromPlaceId === params.toPlaceId) {
      return {
        ...base,
        reachable: true,
        hops: 0,
        path: [params.fromPlaceId],
        connections: [],
      };
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          c.id AS connection_id,
          c.origin_place_id,
          c.destination_place_id,
          c.direction
        FROM connections c
        JOIN connection_services cs ON cs.connection_id = c.id
        WHERE c.retired_at IS NULL
          AND ${SERVICE_ACTIVE_ON_AT}
          AND EXISTS (
            SELECT 1
            FROM json_each(cs.capabilities_json) AS cap
            WHERE cap.value = @capability
          )
        GROUP BY c.id
      `,
      )
      .all({ at: params.at, capability }) as Array<{
        connection_id: string;
        origin_place_id: string;
        destination_place_id: string;
        direction: string;
      }>;

    type Hop = { to: string; connectionId: string };
    const adjacency = new Map<string, Hop[]>();
    const addEdge = (from: string, to: string, connectionId: string) => {
      const list = adjacency.get(from) ?? [];
      list.push({ to, connectionId });
      adjacency.set(from, list);
    };

    for (const row of rows) {
      addEdge(row.origin_place_id, row.destination_place_id, row.connection_id);
      if (row.direction === "bidirectional") {
        addEdge(
          row.destination_place_id,
          row.origin_place_id,
          row.connection_id,
        );
      }
    }

    type Node = {
      placeId: string;
      path: string[];
      connections: string[];
    };
    const queue: Node[] = [
      { placeId: params.fromPlaceId, path: [params.fromPlaceId], connections: [] },
    ];
    const visited = new Set<string>([params.fromPlaceId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const hop of adjacency.get(current.placeId) ?? []) {
        if (visited.has(hop.to)) continue;
        const nextPath = [...current.path, hop.to];
        const nextConnections = [...current.connections, hop.connectionId];
        const transfers = nextConnections.length - 1;
        if (maxTransfers !== null && transfers > maxTransfers) {
          continue;
        }
        if (hop.to === params.toPlaceId) {
          return {
            ...base,
            reachable: true,
            hops: nextConnections.length,
            path: nextPath,
            connections: nextConnections,
          };
        }
        visited.add(hop.to);
        queue.push({
          placeId: hop.to,
          path: nextPath,
          connections: nextConnections,
        });
      }
    }

    return base;
  }

  private activePlaceIds(): string[] {
    return (
      this.db
        .prepare(
          `
          SELECT id
          FROM places
          WHERE status = 'active'
          ORDER BY id
        `,
        )
        .all() as Array<{ id: string }>
    ).map((row) => row.id);
  }

  private capabilityConnectedPlaceIds(
    at: string,
    capability: string,
  ): Set<string> {
    const connectedRows = this.db
      .prepare(
        `
        SELECT DISTINCT endpoint AS place_id
        FROM (
          SELECT c.origin_place_id AS endpoint
          FROM connections c
          JOIN connection_services cs ON cs.connection_id = c.id
          WHERE c.retired_at IS NULL
            AND ${SERVICE_ACTIVE_ON_AT}
            AND EXISTS (
              SELECT 1
              FROM json_each(cs.capabilities_json) AS cap
              WHERE cap.value = @capability
            )
          UNION
          SELECT c.destination_place_id AS endpoint
          FROM connections c
          JOIN connection_services cs ON cs.connection_id = c.id
          WHERE c.retired_at IS NULL
            AND ${SERVICE_ACTIVE_ON_AT}
            AND EXISTS (
              SELECT 1
              FROM json_each(cs.capabilities_json) AS cap
              WHERE cap.value = @capability
            )
        )
        ORDER BY place_id
      `,
      )
      .all({ at, capability }) as Array<{ place_id: string }>;

    return new Set(connectedRows.map((row) => row.place_id));
  }

  resolvePlace(input: {
    identifiers?: ResolveIdentifierInput[];
    name?: string;
    municipalityCode?: number;
  }): { result: ResolveResult; candidates: ResolveCandidate[] } {
    const candidateMap = new Map<string, ResolveCandidate>();

    const addCandidate = (
      placeId: string,
      confidence: number,
      reason: string,
    ) => {
      const existing = candidateMap.get(placeId);
      if (existing) {
        if (!existing.reasons.includes(reason)) {
          existing.reasons.push(reason);
        }
        existing.confidence = Math.max(existing.confidence, confidence);
        return;
      }
      candidateMap.set(placeId, {
        place_id: placeId,
        confidence,
        reasons: [reason],
      });
    };

    for (const identifier of input.identifiers ?? []) {
      const matches = this.db
        .prepare(
          `
          SELECT entity_id AS place_id
          FROM external_identifiers
          WHERE entity_type = 'place'
            AND namespace = ?
            AND value = ?
            AND (valid_to IS NULL OR valid_to >= date('now'))
        `,
        )
        .all(identifier.namespace, identifier.value) as Array<{ place_id: string }>;

      for (const match of matches) {
        addCandidate(match.place_id, 1.0, "external_identifier_exact");
      }
    }

    if (input.name?.trim()) {
      const exactName = input.name.trim();
      const exactMatches = this.db
        .prepare(
          `
          SELECT DISTINCT pn.place_id
          FROM place_names pn
          JOIN current_places cp ON cp.id = pn.place_id
          WHERE pn.valid_to IS NULL
            AND LOWER(pn.value) = LOWER(?)
        `,
        )
        .all(exactName) as Array<{ place_id: string }>;

      for (const match of exactMatches) {
        addCandidate(match.place_id, 0.95, "official_name_exact");
      }

      if (exactMatches.length === 0) {
        const partialMatches = this.db
          .prepare(
            `
            SELECT DISTINCT pn.place_id
            FROM place_names pn
            JOIN current_places cp ON cp.id = pn.place_id
            WHERE pn.valid_to IS NULL
              AND pn.value LIKE ? COLLATE NOCASE
            LIMIT 10
          `,
          )
          .all(`%${exactName}%`) as Array<{ place_id: string }>;

        for (const match of partialMatches) {
          addCandidate(match.place_id, 0.6, "name_partial");
        }
      }
    }

    if (input.municipalityCode !== undefined) {
      const municipalityMatches = this.db
        .prepare(
          `
          SELECT cp.id AS place_id
          FROM current_places cp
          JOIN administrative_areas aa ON aa.id = cp.municipality_id
          WHERE aa.name LIKE ?
        `,
        )
        .all(`%${input.municipalityCode}%`) as Array<{ place_id: string }>;

      for (const match of municipalityMatches) {
        addCandidate(match.place_id, 0.5, "municipality_hint");
      }
    }

    const candidates = [...candidateMap.values()].sort(
      (a, b) => b.confidence - a.confidence,
    );

    if (candidates.length === 0) {
      return { result: "not_found", candidates: [] };
    }

    const top = candidates[0];
    if (
      candidates.length === 1 &&
      top.confidence >= 0.95 &&
      top.reasons.includes("external_identifier_exact")
    ) {
      return { result: "resolved", candidates };
    }

    if (candidates.length > 1) {
      return { result: "ambiguous", candidates };
    }

    return { result: "candidate", candidates };
  }

  latestObservedAt(): string | null {
    const row = this.db
      .prepare(
        `
        SELECT MAX(observed_at) AS last_observed_at
        FROM (
          SELECT observed_at FROM place_names
          UNION ALL SELECT observed_at FROM place_classifications
          UNION ALL SELECT observed_at FROM connection_services
        )
      `,
      )
      .get() as { last_observed_at: string | null } | undefined;

    return row?.last_observed_at ?? null;
  }
}

export const openRepository = (dbPath: string): SqliteRepository => {
  const db = new DatabaseSync(dbPath, {
    readOnly: true,
    enableForeignKeyConstraints: true,
  });
  return new SqliteRepository(db);
};
