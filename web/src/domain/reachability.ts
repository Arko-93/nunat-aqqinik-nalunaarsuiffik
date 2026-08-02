export type Seasonality = {
  kind: string;
  months: ReadonlyArray<number>;
};

export type ReachabilityService = {
  serviceId: string;
  operator: string | null;
  capabilities: ReadonlyArray<string>;
  frequencyBand: string | null;
  frequencyBasis: string | null;
  seasonality: Seasonality;
  status: string | null;
  validFrom: string | null;
  validTo: string | null;
  sourceRefs: ReadonlyArray<{ source_id: string; record_id: string | null }>;
};

export type ReachabilityEdge = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  fromName: string;
  toName: string;
  direction: string;
  mode: string;
  /** All active services on this connection for the export. */
  services: ReadonlyArray<ReachabilityService>;
  /** Summary fields from the first active service (optional convenience). */
  operator: string | null;
  frequencyBand: string | null;
  seasonality: Seasonality;
};

export type ReachabilityNode = {
  placeId: string;
  officialName: string;
  danishName: string | null;
  historicalName: string | null;
  longitude: number;
  latitude: number;
};

export type ReachabilityGraph = {
  nodes: ReadonlyArray<ReachabilityNode>;
  edges: ReadonlyArray<ReachabilityEdge>;
};

export type ReachabilityLink = {
  edge: ReachabilityEdge;
  otherName: string;
  otherPlaceId: string;
  seasonLabel: string;
};

export const seasonalityLabel = (seasonality: Seasonality): string => {
  if (seasonality.kind === "year_round") return "Year-round";
  if (seasonality.kind === "seasonal" && seasonality.months.length > 0) {
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return seasonality.months.map((month) => names[month - 1] ?? String(month)).join(", ");
  }
  return seasonality.kind || "Unknown seasonality";
};

/** Structural reachability links for a canonical place id. */
export const linksFromPlaceId = (
  graph: ReachabilityGraph | null,
  placeId: string | null | undefined,
): ReadonlyArray<ReachabilityLink> => {
  if (!graph || placeId == null || placeId.length === 0) return [];
  const node = graph.nodes.find((entry) => entry.placeId === placeId);
  if (!node) return [];

  const links: ReachabilityLink[] = [];
  for (const edge of graph.edges) {
    if (edge.fromPlaceId === node.placeId) {
      links.push({
        edge,
        otherName: edge.toName,
        otherPlaceId: edge.toPlaceId,
        seasonLabel: seasonalityLabel(edge.seasonality),
      });
    } else if (
      edge.direction === "bidirectional" &&
      edge.toPlaceId === node.placeId
    ) {
      links.push({
        edge,
        otherName: edge.fromName,
        otherPlaceId: edge.fromPlaceId,
        seasonLabel: seasonalityLabel(edge.seasonality),
      });
    }
  }
  return links;
};

export const reachabilityLineCollection = (
  graph: ReachabilityGraph | null,
  placeId: string | null | undefined,
): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const links = linksFromPlaceId(graph, placeId);
  if (!graph || links.length === 0 || placeId == null) {
    return { type: "FeatureCollection", features: [] };
  }

  const byId = new Map(graph.nodes.map((node) => [node.placeId, node]));
  const origin = byId.get(placeId);
  if (!origin) return { type: "FeatureCollection", features: [] };

  return {
    type: "FeatureCollection",
    features: links.flatMap((link) => {
      const other = byId.get(link.otherPlaceId);
      if (!other) return [];
      return [
        {
          type: "Feature" as const,
          properties: {
            id: link.edge.id,
            mode: link.edge.mode,
            otherName: link.otherName,
            otherPlaceId: link.otherPlaceId,
            seasonLabel: link.seasonLabel,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [origin.longitude, origin.latitude],
              [other.longitude, other.latitude],
            ],
          },
        },
      ];
    }),
  };
};
