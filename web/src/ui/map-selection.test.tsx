import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COASTAL_REGISTRY } from "../domain/coastal-features.ts";
import { withMapRank, type Placename } from "../domain/placename.ts";
import {
  MESSAGES,
  TYPE_LABELS_NEED_NATIVE_REVIEW,
} from "../i18n/messages.ts";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import { PlaceDossier } from "./PlaceDossier.tsx";
import {
  displayTypeLabel,
  dossierFromMapTap,
  placenameFromMapFeature,
  placeProvenance,
} from "./map-selection.ts";

const place = (partial: {
  officialName: string;
  typeCode: number;
  globalId?: string;
  danishName?: string | null;
  oldOfficialName?: string | null;
}): Placename => {
  const ranked = withMapRank({
    typeCode: partial.typeCode,
    isLocality: false,
  });
  const globalId = partial.globalId ?? partial.officialName;
  return {
    ...ranked,
    featureId: `nunagis:${globalId}`,
    placeId: null,
    identityStatus: "upstream_only",
    globalId,
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

describe("map tap → dossier seam", () => {
  it("parses map feature props into exact type + provenance for the dossier", () => {
    const skerry = place({
      officialName: "Qeqertaq",
      typeCode: 143,
      globalId: "AAA-SKERRY",
      danishName: "Alt",
      oldOfficialName: "Old",
    });
    const props = { ...skerry } as unknown as GeoJSON.GeoJsonProperties;
    const dossier = dossierFromMapTap(props, MESSAGES.en);
    expect(dossier).not.toBeNull();
    expect(dossier!.typeLabel).toBe("Skerry");
    expect(dossier!.alternateNames).toEqual(["Alt", "Old"]);
    expect(dossier!.claimsPhysicalSize).toBe(false);
    expect(dossier!.provenance.globalId).toBe("AAA-SKERRY");
    expect(dossier!.provenance.typeCode).toBe(143);
    expect(dossier!.provenance.registerTypeLabel).toBe(
      COASTAL_REGISTRY.skerry.registerLabelDa,
    );
    expect(dossier!.provenance.layerUrl).toContain("MapServer/1");
    expect(dossier!.provenance.sourceKind).toBe("nunagis_midpoint");
  });

  it("keeps all four coastal types distinct after map tap", () => {
    for (const kind of [
      "skerry",
      "island",
      "island_part",
      "island_group",
    ] as const) {
      const meta = COASTAL_REGISTRY[kind];
      const props = place({
        officialName: kind,
        typeCode: meta.typeCode,
      }) as unknown as GeoJSON.GeoJsonProperties;
      const dossier = dossierFromMapTap(props, MESSAGES.en);
      expect(dossier!.typeLabel).toBe(MESSAGES.en[meta.typeLabelKey]);
      expect(dossier!.provenance.typeCode).toBe(meta.typeCode);
    }
  });

  it("renders PlaceDossier Sources with exact NunaGIS provenance after tap", () => {
    const props = place({
      officialName: "Tiilerilaaq",
      typeCode: 181,
      globalId: "BBB-ISLAND",
    }) as unknown as GeoJSON.GeoJsonProperties;
    const selected = placenameFromMapFeature(props);
    expect(selected).not.toBeNull();
    const provenance = placeProvenance(selected!);
    const html = renderToStaticMarkup(
      <I18nProvider>
        <PlaceDossier
          place={selected!}
          release={null}
          initialTab="sources"
        />
      </I18nProvider>,
    );
    expect(html).toContain(selected!.officialName);
    expect(html).toContain(provenance.globalId);
    expect(html).toContain(provenance.registerName);
    expect(html).toContain(provenance.layerUrl);
    expect(html).toContain("181");
    expect(html).toContain(COASTAL_REGISTRY.island.registerLabelDa);
    expect(displayTypeLabel(selected!, MESSAGES.en)).toBe("Island");
    expect(TYPE_LABELS_NEED_NATIVE_REVIEW.kl).toBe(true);
  });

  it("uses Danish register terms in DA/KL type labels without inventing KL types", () => {
    const skerry = place({ officialName: "X", typeCode: 143 });
    expect(displayTypeLabel(skerry, MESSAGES.da)).toBe("Skær");
    expect(displayTypeLabel(skerry, MESSAGES.kl)).toBe("Skær");
    expect(MESSAGES.kl.legendLabel).toContain("Takussutissat");
    expect(MESSAGES.kl.legendLabel).toContain("Skær");
    expect(MESSAGES.kl.legendLabel).not.toBe(MESSAGES.en.legendLabel);
  });
});
