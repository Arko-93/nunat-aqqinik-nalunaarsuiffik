import { describe, expect, it } from "vitest";
import {
  featureKindFromType,
  isLocalityType,
  stripGlobalId,
  toPlacename,
  whereClauseForScope,
  type ArcGisPlacenameFeature,
} from "./placename.ts";

const sample: ArcGisPlacenameFeature = {
  attributes: {
    OBJECTID: 1,
    GlobalID: "{60CE7AA7-9FC8-4FB3-8D99-7DD77F94CF1E}",
    ID: 21182,
    PlacenameOfficial: "Sisimiut",
    PlacenameOfficialOld: "Sisimiut",
    PlacenameDanish: "Holsteinsborg",
    Type: 21,
    MunicipalityCode: 957,
    LokalityCode: "0800",
  },
  geometry: {
    x: -53.64957287699997,
    y: 66.94287162400008,
  },
};

describe("placename domain", () => {
  it("maps Type codes to feature kinds", () => {
    expect(featureKindFromType(21)).toBe("town");
    expect(featureKindFromType(23)).toBe("settlement");
    expect(featureKindFromType(118)).toBe("other");
  });

  it("detects locality types", () => {
    expect(isLocalityType(21)).toBe(true);
    expect(isLocalityType(23)).toBe(true);
    expect(isLocalityType(49)).toBe(false);
  });

  it("builds scope where clauses", () => {
    expect(whereClauseForScope("localities")).toBe("Type IN (21,23)");
    expect(whereClauseForScope("all")).toBe("1=1");
  });

  it("strips GlobalID braces", () => {
    expect(stripGlobalId("{ABC}")).toBe("ABC");
  });

  it("normalizes an ArcGIS placename feature", () => {
    const place = toPlacename(sample);
    expect(place).not.toBeNull();
    expect(place!.officialName).toBe("Sisimiut");
    expect(place!.danishName).toBe("Holsteinsborg");
    expect(place!.featureKind).toBe("town");
    expect(place!.isLocality).toBe(true);
    expect(place!.typeLabel).toBe("By");
    expect(place!.zoomBand).toBe("locality");
    expect(place!.importance).toBeGreaterThan(900);
    expect(place!.globalId).toBe("60CE7AA7-9FC8-4FB3-8D99-7DD77F94CF1E");
    expect(place!.featureId).toBe(
      "nunagis:60CE7AA7-9FC8-4FB3-8D99-7DD77F94CF1E",
    );
    expect(place!.placeId).toBeNull();
    expect(place!.identityStatus).toBe("upstream_only");
    expect(place!.municipalityName).toBe("Qeqqata kommunia");
    expect(place!.longitude).toBeCloseTo(-53.64957, 4);
    expect(place!.latitude).toBeCloseTo(66.94287, 4);
  });

  it("attaches candidate placeId from crosswalk", () => {
    const place = toPlacename(sample, {
      generatedFrom: "test",
      entries: [
        {
          featureId: "nunagis:60CE7AA7-9FC8-4FB3-8D99-7DD77F94CF1E",
          placeId: "plc_bc0c50c0-552d-4f4b-8c9f-c65fcc33bf3b",
          identityStatus: "candidate",
          globalId: "60CE7AA7-9FC8-4FB3-8D99-7DD77F94CF1E",
        },
      ],
    });
    expect(place!.placeId).toBe("plc_bc0c50c0-552d-4f4b-8c9f-c65fcc33bf3b");
    expect(place!.identityStatus).toBe("candidate");
  });

  it("drops features with null official names", () => {
    const blank: ArcGisPlacenameFeature = {
      ...sample,
      attributes: { ...sample.attributes, PlacenameOfficial: null },
    };
    expect(toPlacename(blank)).toBeNull();
  });
});
