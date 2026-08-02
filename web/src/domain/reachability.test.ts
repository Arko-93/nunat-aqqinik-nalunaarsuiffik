import { describe, expect, it } from "vitest";
import {
  linksFromPlaceId,
  seasonalityLabel,
  type ReachabilityGraph,
} from "./reachability.ts";

const graph: ReachabilityGraph = {
  nodes: [
    {
      placeId: "plc_qaq",
      officialName: "Qaqortoq",
      danishName: "Julianehåb",
      historicalName: null,
      longitude: -46.036,
      latitude: 60.718,
    },
    {
      placeId: "plc_nar",
      officialName: "Narsaq",
      danishName: null,
      historicalName: null,
      longitude: -46.05,
      latitude: 60.913,
    },
  ],
  edges: [
    {
      id: "con_1",
      fromPlaceId: "plc_qaq",
      toPlaceId: "plc_nar",
      fromName: "Qaqortoq",
      toName: "Narsaq",
      direction: "bidirectional",
      mode: "helicopter",
      services: [
        {
          serviceId: "svc_1",
          operator: "Air Greenland",
          capabilities: ["passenger"],
          frequencyBand: "multiple_daily",
          frequencyBasis: "published_maximum",
          seasonality: { kind: "year_round", months: [] },
          status: "active",
          validFrom: "2026-04-16",
          validTo: null,
          sourceRefs: [],
        },
        {
          serviceId: "svc_2",
          operator: "Partner Operator",
          capabilities: ["freight"],
          frequencyBand: "weekly",
          frequencyBasis: "published_typical",
          seasonality: { kind: "seasonal", months: [6, 7, 8] },
          status: "active",
          validFrom: "2026-06-01",
          validTo: null,
          sourceRefs: [],
        },
      ],
      operator: "Air Greenland",
      frequencyBand: "multiple_daily",
      seasonality: { kind: "year_round", months: [] },
    },
  ],
};

describe("reachability graph helpers", () => {
  it("labels year-round seasonality", () => {
    expect(seasonalityLabel({ kind: "year_round", months: [] })).toBe(
      "Year-round",
    );
  });

  it("lists bidirectional links by placeId", () => {
    const links = linksFromPlaceId(graph, "plc_qaq");
    expect(links).toHaveLength(1);
    expect(links[0]?.otherName).toBe("Narsaq");
    expect(links[0]?.otherPlaceId).toBe("plc_nar");
    expect(links[0]?.seasonLabel).toBe("Year-round");
    expect(links[0]?.edge.services).toHaveLength(2);
  });

  it("ignores official-name lookup — renamed place keeps links via placeId", () => {
    const renamed: ReachabilityGraph = {
      nodes: [
        { ...graph.nodes[0]!, officialName: "NewQaqortoqName" },
        graph.nodes[1]!,
      ],
      edges: graph.edges,
    };
    expect(linksFromPlaceId(renamed, "plc_qaq")).toHaveLength(1);
    expect(linksFromPlaceId(renamed, null)).toHaveLength(0);
  });

  it("does not join when placeId is missing", () => {
    expect(linksFromPlaceId(graph, undefined)).toHaveLength(0);
    expect(linksFromPlaceId(graph, "")).toHaveLength(0);
  });
});
