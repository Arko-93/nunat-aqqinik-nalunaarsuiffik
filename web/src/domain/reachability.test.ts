import { describe, expect, it } from "vitest";
import {
  linksFromOfficialName,
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

  it("lists bidirectional links from Qaqortoq", () => {
    const links = linksFromOfficialName(graph, "Qaqortoq");
    expect(links).toHaveLength(1);
    expect(links[0]?.otherName).toBe("Narsaq");
    expect(links[0]?.seasonLabel).toBe("Year-round");
  });
});
