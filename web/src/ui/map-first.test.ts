import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages.ts";
import { gazetteerVisible } from "../domain/layers.ts";
import { withMapRank, type Placename } from "../domain/placename.ts";
import { isSearchQueryActive } from "../domain/search.ts";
import { focusZoomFor } from "./map-focus.ts";

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
      // The full-pack hint must stay honest about what stays online.
      expect(t.downloadFullHint.toLowerCase()).toContain("hillshade");
      expect(t.downloadReady).not.toEqual(t.downloadStubInstalled);
      expect(t.appTagline.length).toBeLessThan(80);
    }
  });

  it("keeps honest tile-gap copy in all locales (issue #26)", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      const t = MESSAGES[locale];
      expect(t.tileGapLabel.length).toBeGreaterThan(0);
      expect(t.oceanDepthGapLabel.length).toBeGreaterThan(0);
      // Land and ocean gaps are distinct conditions; the copy must agree.
      expect(t.tileGapLabel).not.toEqual(t.oceanDepthGapLabel);
    }
  });

  it("exposes a passive coastal legend in all locales (not a filter)", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      const t = MESSAGES[locale];
      expect(t.legendLabel.length).toBeGreaterThan(0);
      expect(t.landPeakLegend.length).toBeGreaterThan(0);
      expect(t.typeLabelSkerry.length).toBeGreaterThan(0);
      expect(t.typeLabelIsland.length).toBeGreaterThan(0);
      expect(t.typeLabelIslandPart.length).toBeGreaterThan(0);
      expect(t.typeLabelIslandGroup.length).toBeGreaterThan(0);
      expect(t.provenanceSource.length).toBeGreaterThan(0);
      expect(t.provenanceGlobalId.length).toBeGreaterThan(0);
    }
    expect(MESSAGES.en.typeLabelSkerry).toBe("Skerry");
    expect(MESSAGES.da.typeLabelSkerry).toBe("Skær");
    expect(MESSAGES.kl.legendLabel).toContain("Takussutissat");
    expect(MESSAGES.kl.legendLabel).not.toBe(MESSAGES.en.legendLabel);
    expect(MESSAGES.kl.typeLabelSkerry).toBe("Skær");
  });

  it("uses Overview and Sources only (no Access label required in chrome)", () => {
    const en = MESSAGES.en;
    expect(en.overview).toBeTruthy();
    expect(en.sources).toBeTruthy();
    expect(en.selectPlaceHint.toLowerCase()).not.toContain("access");
  });

  it("dismisses search sheet when query is empty (< 2 chars)", () => {
    expect(isSearchQueryActive("")).toBe(false);
    expect(isSearchQueryActive("a")).toBe(false);
    expect(isSearchQueryActive("  a  ")).toBe(false);
    expect(isSearchQueryActive("qa")).toBe(true);
    expect(isSearchQueryActive("  qa  ")).toBe(true);
  });

  it("zooms search picks into village / place scale", () => {
    const bygd = place({ typeCode: 23, featureKind: "settlement", isLocality: true });
    const fjord = place({
      typeCode: 57,
      featureKind: "other",
      isLocality: false,
    });
    expect(focusZoomFor(bygd, 3.4)).toBeGreaterThanOrEqual(10.2);
    expect(focusZoomFor(fjord, 3.4)).toBeGreaterThanOrEqual(8);
    expect(focusZoomFor(bygd, 12)).toBe(12);
  });
});
