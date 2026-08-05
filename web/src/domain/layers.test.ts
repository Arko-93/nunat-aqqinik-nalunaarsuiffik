import { describe, expect, it } from "vitest";
import {
  defaultLayerState,
  gazetteerVisible,
  placeVisible,
} from "./layers.ts";
import { withMapRank, type Placename } from "./placename.ts";

const base = (
  partial: Partial<Placename> &
    Pick<Placename, "typeCode" | "featureKind" | "isLocality">,
): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
  });
  return {
    featureId: "nunagis:test",
    placeId: null,
    identityStatus: "upstream_only",
    globalId: "test",
    recordId: 1,
    officialName: "Test",
    danishName: null,
    oldOfficialName: null,
    typeLabel: ranked.typeLabel,
    isLocalityShadow: false,
    importance: ranked.importance,
    minZoom: ranked.minZoom,
    zoomBand: ranked.zoomBand,
    municipalityCode: 957,
    municipalityName: "Qeqqata",
    localityCode: null,
    longitude: -53,
    latitude: 66,
    ...partial,
  };
};

describe("gazetteerVisible (map-first)", () => {
  const town = base({ typeCode: 21, featureKind: "town", isLocality: true });
  const fjord = base({ typeCode: 57, featureKind: "other", isLocality: false });

  it("shows localities and geography without a lens", () => {
    expect(gazetteerVisible(town)).toBe(true);
    expect(gazetteerVisible(fjord)).toBe(true);
  });

  it("hides locality shadow duplicates", () => {
    expect(gazetteerVisible({ ...town, isLocalityShadow: true })).toBe(false);
  });
});

describe("placeVisible (legacy lens helpers)", () => {
  const town = base({ typeCode: 21, featureKind: "town", isLocality: true });
  const settlement = base({
    typeCode: 23,
    featureKind: "settlement",
    isLocality: true,
  });
  const fjord = base({ typeCode: 57, featureKind: "other", isLocality: false });

  it("shows towns and settlements on the inhabited lens", () => {
    const layers = defaultLayerState();
    expect(placeVisible(town, layers)).toBe(true);
    expect(placeVisible(settlement, layers)).toBe(true);
    expect(placeVisible(fjord, layers)).toBe(false);
  });

  it("shows towns and geography — not settlements — on the geography lens", () => {
    const layers = { ...defaultLayerState(), lens: "geography" as const };
    expect(placeVisible(town, layers)).toBe(true);
    expect(placeVisible(settlement, layers)).toBe(false);
    expect(placeVisible(fjord, layers)).toBe(true);
  });

  it("filters by municipality", () => {
    const layers = {
      ...defaultLayerState(),
      municipalityFilter: 956 as const,
    };
    expect(placeVisible(town, layers)).toBe(false);
    expect(
      placeVisible({ ...town, municipalityCode: 956 }, layers),
    ).toBe(true);
  });
});
