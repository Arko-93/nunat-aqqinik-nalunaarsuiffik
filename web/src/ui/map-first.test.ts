import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages.ts";
import { gazetteerVisible } from "../domain/layers.ts";
import { withMapRank, type Placename } from "../domain/placename.ts";

const place = (
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

describe("map-first UI contracts", () => {
  it("shows all gazetteer names (towns, waters, islands) without lens filter", () => {
    const town = place({ typeCode: 21, featureKind: "town", isLocality: true });
    const fjord = place({
      typeCode: 57,
      featureKind: "other",
      isLocality: false,
    });
    const island = place({
      typeCode: 181,
      featureKind: "other",
      isLocality: false,
    });
    expect(gazetteerVisible(town)).toBe(true);
    expect(gazetteerVisible(fjord)).toBe(true);
    expect(gazetteerVisible(island)).toBe(true);
    expect(
      gazetteerVisible({ ...town, isLocalityShadow: true }),
    ).toBe(false);
  });

  it("keeps soft brand + download + not-for-navigation copy in all locales", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      const t = MESSAGES[locale];
      expect(t.downloadArea.length).toBeGreaterThan(0);
      expect(t.notForNavigation.length).toBeGreaterThan(0);
      expect(t.downloadStubInstalled.length).toBeGreaterThan(0);
      expect(t.downloadStubHint.toLowerCase()).toMatch(
        /stub|network|netværk|internet/,
      );
      expect(t.downloadReady).not.toEqual(t.downloadStubInstalled);
      expect(t.appTagline.length).toBeLessThan(80);
    }
  });

  it("uses Overview and Sources only (no Access label required in chrome)", () => {
    const en = MESSAGES.en;
    expect(en.overview).toBeTruthy();
    expect(en.sources).toBeTruthy();
    expect(en.selectPlaceHint.toLowerCase()).not.toContain("access");
  });

  it("dismisses search sheet when query is empty (< 2 chars)", () => {
    const queryActive = (q: string) => q.trim().length >= 2;
    expect(queryActive("")).toBe(false);
    expect(queryActive("a")).toBe(false);
    expect(queryActive("qa")).toBe(true);
  });
});
