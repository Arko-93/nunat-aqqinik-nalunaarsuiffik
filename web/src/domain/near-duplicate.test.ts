import { describe, expect, it } from "vitest";
import {
  isLocalityNameShadow,
  namesNearDuplicate,
} from "./near-duplicate.ts";
import { withMapRank, type Placename } from "./placename.ts";

const place = (partial: {
  globalId: string;
  recordId: number;
  officialName: string;
  typeCode: number;
  isLocality: boolean;
  longitude: number;
  latitude: number;
  municipalityCode?: number | null;
}): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
  });
  return {
    ...ranked,
    featureId: `nunagis:${partial.globalId}`,
    placeId: null,
    identityStatus: "upstream_only",
    globalId: partial.globalId,
    recordId: partial.recordId,
    officialName: partial.officialName,
    danishName: null,
    oldOfficialName: null,
    featureKind:
      partial.typeCode === 21
        ? "town"
        : partial.typeCode === 23
          ? "settlement"
          : "other",
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
    isLocalityShadow: false,
    municipalityCode: partial.municipalityCode ?? 960,
    municipalityName: "Avannaata kommunia",
    localityCode: null,
    longitude: partial.longitude,
    latitude: partial.latitude,
  };
};

describe("near-duplicate locality shadows", () => {
  it("treats Naajat and Naajaat as near-duplicates", () => {
    expect(namesNearDuplicate("Naajat", "Naajaat")).toBe(true);
  });

  it("marks Øgruppe Naajat beside Bygd Naajaat as a shadow", () => {
    const bygd = place({
      globalId: "bygd",
      recordId: 31350,
      officialName: "Naajaat",
      typeCode: 23,
      isLocality: true,
      longitude: -55.81009,
      latitude: 73.14215,
    });
    const group = place({
      globalId: "group",
      recordId: 29881,
      officialName: "Naajat",
      typeCode: 183,
      isLocality: false,
      longitude: -55.7896,
      latitude: 73.14136,
    });
    expect(isLocalityNameShadow(group, [bygd])).toBe(true);
    expect(isLocalityNameShadow(bygd, [bygd])).toBe(false);
  });
});
