import { describe, expect, it } from "vitest";
import { withMapRank, type Placename } from "../domain/placename.ts";
import {
  MESSAGES,
  TYPE_LABELS_NEED_NATIVE_REVIEW,
} from "../i18n/messages.ts";
import { selectionDisplay } from "./selection-display.ts";

const place = (partial: {
  officialName: string;
  typeCode: number;
  danishName?: string | null;
  oldOfficialName?: string | null;
}): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: false,
  });
  return {
    ...ranked,
    featureId: `nunagis:${partial.officialName}`,
    placeId: null,
    identityStatus: "upstream_only",
    globalId: partial.officialName,
    recordId: 1,
    officialName: partial.officialName,
    danishName: partial.danishName ?? null,
    oldOfficialName: partial.oldOfficialName ?? null,
    featureKind: "other",
    typeCode: partial.typeCode,
    isLocality: false,
    isLocalityShadow: false,
    municipalityCode: 960,
    municipalityName: "Avannaata kommunia",
    localityCode: null,
    longitude: -56,
    latitude: 73,
  };
};

describe("tap-selection seam", () => {
  it("shows exact coastal type and alternate names without size claims", () => {
    const skerry = place({
      officialName: "Qeqertaq",
      typeCode: 143,
      danishName: "Skær-name",
      oldOfficialName: "Old Qeqertaq",
    });
    const view = selectionDisplay(skerry, MESSAGES.en);
    expect(view.typeCode).toBe(143);
    expect(view.markerKind).toBe("skerry");
    expect(view.typeLabel).toBe("Skerry");
    expect(view.alternateNames).toEqual(["Skær-name", "Old Qeqertaq"]);
    expect(view.claimsPhysicalSize).toBe(false);
    expect(view.sourceKind).toBe("nunagis_midpoint");
    expect(JSON.stringify(view).toLowerCase()).not.toMatch(
      /hectare|km²|square|hazard|danger|shallow/,
    );
  });

  it("keeps all four types distinct in selection display", () => {
    const en = MESSAGES.en;
    expect(selectionDisplay(place({ officialName: "A", typeCode: 143 }), en).typeLabel).toBe(
      "Skerry",
    );
    expect(selectionDisplay(place({ officialName: "B", typeCode: 181 }), en).typeLabel).toBe(
      "Island",
    );
    expect(selectionDisplay(place({ officialName: "C", typeCode: 182 }), en).typeLabel).toBe(
      "Island part",
    );
    expect(selectionDisplay(place({ officialName: "D", typeCode: 183 }), en).typeLabel).toBe(
      "Island group",
    );
    expect(selectionDisplay(place({ officialName: "E", typeCode: 181 }), en).typeLabel).not.toBe(
      selectionDisplay(place({ officialName: "F", typeCode: 143 }), en).typeLabel,
    );
  });

  it("uses Danish register terms in DA and provisional KL (flagged for review)", () => {
    const skerry = place({ officialName: "X", typeCode: 143 });
    expect(selectionDisplay(skerry, MESSAGES.da).typeLabel).toBe("Skær");
    expect(selectionDisplay(skerry, MESSAGES.kl).typeLabel).toBe("Skær");
    expect(TYPE_LABELS_NEED_NATIVE_REVIEW.kl).toBe(true);
    expect(TYPE_LABELS_NEED_NATIVE_REVIEW.en).toBe(false);
  });
});
