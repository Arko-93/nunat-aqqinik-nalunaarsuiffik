import { describe, expect, it } from "vitest";
import {
  crosswalkByGlobalId,
  featureIdFromGlobalId,
  hasOperationalIdentity,
  resolveIdentity,
  type IdentityCrosswalk,
} from "./identity.ts";
import { enrichPlacename, withMapRank } from "./placename.ts";
import { linksFromPlaceId, type ReachabilityGraph } from "./reachability.ts";

const crosswalk: IdentityCrosswalk = {
  generatedFrom: "test",
  entries: [
    {
      featureId: "nunagis:AAA",
      placeId: "plc_a",
      identityStatus: "candidate",
      globalId: "AAA",
      officialName: "Tasiusaq",
    },
  ],
};

const baseProps = (overrides: Record<string, unknown> = {}) => {
  const ranked = withMapRank({ typeCode: 23, isLocality: true });
  return {
    ...ranked,
    globalId: "BBB",
    recordId: 1,
    officialName: "Tasiusaq",
    danishName: null,
    oldOfficialName: null,
    featureKind: "settlement" as const,
    typeCode: 23,
    isLocality: true,
    isLocalityShadow: false,
    municipalityCode: 960,
    municipalityName: "Avannaata kommunia",
    localityCode: null,
    longitude: -56.0,
    latitude: 73.3,
    ...overrides,
  };
};

const graph: ReachabilityGraph = {
  nodes: [
    {
      placeId: "plc_a",
      officialName: "Tasiusaq",
      danishName: null,
      historicalName: null,
      longitude: -56.0,
      latitude: 73.3,
    },
    {
      placeId: "plc_b",
      officialName: "Tasiusaq",
      danishName: null,
      historicalName: null,
      longitude: -55.0,
      latitude: 72.0,
    },
  ],
  edges: [
    {
      id: "con_x",
      fromPlaceId: "plc_a",
      toPlaceId: "plc_b",
      fromName: "Tasiusaq",
      toName: "Tasiusaq",
      direction: "bidirectional",
      mode: "helicopter",
      services: [],
      operator: null,
      frequencyBand: null,
      seasonality: { kind: "year_round", months: [] },
    },
  ],
};

describe("identity crosswalk", () => {
  it("builds nunagis feature ids", () => {
    expect(featureIdFromGlobalId("ABC")).toBe("nunagis:ABC");
  });

  it("marks unmatched features upstream_only", () => {
    const identity = resolveIdentity("MISSING", crosswalkByGlobalId(crosswalk));
    expect(identity.placeId).toBeNull();
    expect(identity.identityStatus).toBe("upstream_only");
  });

  it("attaches candidate placeId from crosswalk", () => {
    const place = enrichPlacename(baseProps({ globalId: "AAA" }), crosswalk);
    expect(place.featureId).toBe("nunagis:AAA");
    expect(place.placeId).toBe("plc_a");
    expect(place.identityStatus).toBe("candidate");
    expect(hasOperationalIdentity(place)).toBe(true);
  });

  it("keeps same-name features operationally separate", () => {
    const mapped = enrichPlacename(baseProps({ globalId: "AAA" }), crosswalk);
    const other = enrichPlacename(
      baseProps({
        globalId: "CCC",
        recordId: 2,
        officialName: "Tasiusaq",
        longitude: -55.0,
        latitude: 72.0,
      }),
      crosswalk,
    );
    expect(mapped.officialName).toBe(other.officialName);
    expect(mapped.placeId).toBe("plc_a");
    expect(other.placeId).toBeNull();
    expect(other.identityStatus).toBe("upstream_only");
    expect(linksFromPlaceId(graph, mapped.placeId)).toHaveLength(1);
    expect(linksFromPlaceId(graph, other.placeId)).toHaveLength(0);
  });

  it("retains links after official rename via placeId", () => {
    const place = enrichPlacename(
      baseProps({ globalId: "AAA", officialName: "OldTasiusaq" }),
      crosswalk,
    );
    const renamedGraph: ReachabilityGraph = {
      nodes: [
        { ...graph.nodes[0]!, officialName: "RenamedTasiusaq" },
        graph.nodes[1]!,
      ],
      edges: graph.edges,
    };
    expect(linksFromPlaceId(renamedGraph, place.placeId)[0]?.otherPlaceId).toBe(
      "plc_b",
    );
  });
});
