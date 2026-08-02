import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages.ts";
import { placeKindLabel } from "./PlaceResultCard.tsx";
import { withMapRank, type Placename } from "../domain/placename.ts";

const place = (partial: {
  officialName: string;
  isLocality: boolean;
  typeCode: number;
}): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
  });
  return {
    ...ranked,
    featureId: `nunagis:${partial.officialName}`,
    placeId: null,
    identityStatus: "upstream_only",
    globalId: partial.officialName,
    recordId: 1,
    officialName: partial.officialName,
    danishName: null,
    oldOfficialName: null,
    featureKind: partial.isLocality ? "settlement" : "other",
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
    isLocalityShadow: false,
    municipalityCode: 960,
    municipalityName: "Avannaata kommunia",
    localityCode: null,
    longitude: -56,
    latitude: 73,
  };
};

describe("place UI helpers", () => {
  it("explains same-name results differently by kind", () => {
    const settlement = place({
      officialName: "Naajaat",
      isLocality: true,
      typeCode: 23,
    });
    const island = place({
      officialName: "Naajat",
      isLocality: false,
      typeCode: 181,
    });
    expect(placeKindLabel(settlement, MESSAGES.en)).toBe("Inhabited place");
    expect(placeKindLabel(island, MESSAGES.en)).toBe("Geographical feature");
    expect(placeKindLabel(settlement, MESSAGES.da)).not.toEqual(
      placeKindLabel(island, MESSAGES.da),
    );
  });
});
