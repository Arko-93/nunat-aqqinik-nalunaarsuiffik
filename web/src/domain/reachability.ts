export type Seasonality = {
  kind: string;
  months: ReadonlyArray<number>;
};

export type ReachabilityEdge = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  fromName: string;
  toName: string;
  direction: string;
  mode: string;
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

export const linksFromOfficialName = (
  graph: ReachabilityGraph | null,
  officialName: string,
): ReadonlyArray<ReachabilityLink> => {
  if (!graph) return [];
  const name = officialName.trim().toLocaleLowerCase("kl");
  const node = graph.nodes.find(
    (entry) => entry.officialName.toLocaleLowerCase("kl") === name,
  );
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
  officialName: string,
): GeoJSON.FeatureCollection<GeoJSON.LineString> => {
  const links = linksFromOfficialName(graph, officialName);
  if (!graph || links.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const byId = new Map(graph.nodes.map((node) => [node.placeId, node]));
  const origin = graph.nodes.find(
    (node) =>
      node.officialName.toLocaleLowerCase("kl") ===
      officialName.trim().toLocaleLowerCase("kl"),
  );
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
