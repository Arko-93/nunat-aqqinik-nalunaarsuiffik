import { describe, expect, it } from "vitest";
import { withMapRank, type Placename } from "./placename.ts";
import { searchPlacenames, scorePlacename } from "./search.ts";

const place = (partial: {
  globalId: string;
  recordId: number;
  officialName: string;
  danishName?: string | null;
  oldOfficialName?: string | null;
  typeCode: number;
  isLocality: boolean;
  longitude: number;
  latitude: number;
  municipalityName?: string | null;
}): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
  });
  return {
    ...ranked,
    globalId: partial.globalId,
    recordId: partial.recordId,
    officialName: partial.officialName,
    danishName: partial.danishName ?? null,
    oldOfficialName: partial.oldOfficialName ?? null,
    featureKind:
      partial.typeCode === 21
        ? "town"
        : partial.typeCode === 23
          ? "settlement"
          : "other",
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
    isLocalityShadow: false,
    municipalityCode: null,
    municipalityName: partial.municipalityName ?? null,
    localityCode: null,
    longitude: partial.longitude,
    latitude: partial.latitude,
  };
};

const fixtures: Placename[] = [
  place({
    globalId: "town-nuuk",
    recordId: 1,
    officialName: "Nuuk",
    danishName: "Godthåb",
    typeCode: 21,
    isLocality: true,
    longitude: -51.7,
    latitude: 64.18,
  }),
  place({
    globalId: "næs-nuuk",
    recordId: 2,
    officialName: "Nuuk",
    typeCode: 118,
    isLocality: false,
    longitude: -50,
    latitude: 64,
  }),
  place({
    globalId: "ø-nuuk",
    recordId: 3,
    officialName: "Nuuk",
    typeCode: 181,
    isLocality: false,
    longitude: -50.1,
    latitude: 64.1,
  }),
  place({
    globalId: "long",
    recordId: 4,
    officialName: "Nuukassaap Kangerlua",
    typeCode: 18,
    isLocality: false,
    longitude: -51,
    latitude: 64,
  }),
  place({
    globalId: "fjord",
    recordId: 5,
    officialName: "Nuup Kangerlua",
    danishName: "Godthåbsfjord",
    typeCode: 57,
    isLocality: false,
    longitude: -51.5,
    latitude: 64.3,
  }),
  place({
    globalId: "sisimiut",
    recordId: 6,
    officialName: "Sisimiut",
    danishName: "Holsteinsborg",
    typeCode: 21,
    isLocality: true,
    longitude: -53.6,
    latitude: 66.9,
  }),
];

describe("placename search ranking", () => {
  it("ranks the town Nuuk first for query Nuuk", () => {
    const hits = searchPlacenames(fixtures, "Nuuk", 5);
    expect(hits[0]?.place.globalId).toBe("town-nuuk");
    expect(hits[0]?.place.typeLabel).toBe("By");
  });

  it("keeps locality above same-name geography", () => {
    const hits = searchPlacenames(fixtures, "nuuk", 5);
    const ids = hits.map((hit) => hit.place.globalId);
    expect(ids[0]).toBe("town-nuuk");
    expect(ids.indexOf("town-nuuk")).toBeLessThan(ids.indexOf("næs-nuuk"));
    expect(ids.indexOf("town-nuuk")).toBeLessThan(ids.indexOf("ø-nuuk"));
  });

  it("matches Danish exonym Godthåb to Nuuk town", () => {
    const hits = searchPlacenames(fixtures, "Godthåb", 3);
    expect(hits[0]?.place.globalId).toBe("town-nuuk");
  });

  it("fuzzy-matches near-miss locality query Nuke → Nuuk", () => {
    const hit = scorePlacename(fixtures[0]!, "Nuke");
    expect(hit?.match).toBe("fuzzy");
    const hits = searchPlacenames(fixtures, "Nuke", 3);
    expect(hits[0]?.place.globalId).toBe("town-nuuk");
  });

  it("does not fuzzy-match non-localities for Nuke", () => {
    const næs = fixtures.find((p) => p.globalId === "næs-nuuk")!;
    expect(scorePlacename(næs, "Nuke")).toBeNull();
  });

  it("ranks Bygd Naajaat above Øgruppe Naajat for query Naajat", () => {
    const places = [
      place({
        globalId: "bygd-naajaat",
        recordId: 31350,
        officialName: "Naajaat",
        typeCode: 23,
        isLocality: true,
        longitude: -55.81009,
        latitude: 73.14215,
        municipalityName: "Avannaata kommunia",
      }),
      place({
        globalId: "group-naajat",
        recordId: 29881,
        officialName: "Naajat",
        typeCode: 183,
        isLocality: false,
        longitude: -55.7896,
        latitude: 73.14136,
        municipalityName: "Avannaata kommunia",
      }),
    ];
    // Mark shadow the way enrichCollection would.
    places[1] = { ...places[1]!, isLocalityShadow: true };
    const hits = searchPlacenames(places, "Naajat", 5);
    expect(hits.map((hit) => hit.place.globalId)).toEqual(["bygd-naajaat"]);
  });
});
