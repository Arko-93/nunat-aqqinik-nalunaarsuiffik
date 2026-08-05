import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COASTAL_REGISTRY } from "../domain/coastal-features.ts";
import {
  placenameToGeoJsonFeature,
  withMapRank,
  type Placename,
} from "../domain/placename.ts";
import {
  MESSAGES,
  TYPE_LABELS_NEED_NATIVE_REVIEW,
} from "../i18n/messages.ts";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import {
  displayTypeLabel,
  placeProvenance,
  selectPlaceFromMapClick,
} from "./map-selection.ts";
import { PlaceDossierSources } from "./PlaceDossierSources.tsx";

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

/** Typed map-click props from the same GeoJSON path MapCanvas uses. */
const mapClickProps = (entry: Placename): GeoJSON.GeoJsonProperties =>
  placenameToGeoJsonFeature(entry).properties;

describe("map click → dossier Sources seam", () => {
  it("uses the production click helper to select a place with exact type", () => {
    const skerry = place({
      officialName: "Qeqertaq",
      typeCode: 143,
      globalId: "AAA-SKERRY",
      danishName: "Alt",
      oldOfficialName: "Old",
    });
    const selected = selectPlaceFromMapClick(mapClickProps(skerry));
    expect(selected).not.toBeNull();
    expect(selected!.typeCode).toBe(143);
    expect(selected!.globalId).toBe("AAA-SKERRY");
    expect(displayTypeLabel(selected!, MESSAGES.en)).toBe("Skerry");
    expect(placeProvenance(selected!).registerTypeLabel).toBe(
      COASTAL_REGISTRY.skerry.registerLabelDa,
    );
    expect(placeProvenance(selected!).layerUrl).toContain("MapServer/1");
  });

  it("keeps all four coastal types distinct after map click", () => {
    for (const kind of [
      "skerry",
      "island",
      "island_part",
      "island_group",
    ] as const) {
      const meta = COASTAL_REGISTRY[kind];
      const selected = selectPlaceFromMapClick(
        mapClickProps(
          place({
            officialName: kind,
            typeCode: meta.typeCode,
          }),
        ),
      );
      expect(selected).not.toBeNull();
      expect(displayTypeLabel(selected!, MESSAGES.en)).toBe(
        MESSAGES.en[meta.typeLabelKey],
      );
      expect(selected!.typeCode).toBe(meta.typeCode);
    }
  });

  it("renders production PlaceDossierSources from the real click helper", () => {
    const selected = selectPlaceFromMapClick(
      mapClickProps(
        place({
          officialName: "Tiilerilaaq",
          typeCode: 181,
          globalId: "BBB-ISLAND",
        }),
      ),
    );
    expect(selected).not.toBeNull();
    const provenance = placeProvenance(selected!);
    const html = renderToStaticMarkup(
      <I18nProvider>
        <PlaceDossierSources
          place={selected!}
          release={null}
          identityBadge={MESSAGES.kl.identityUpstream}
        />
      </I18nProvider>,
    );
    expect(html).toContain(provenance.globalId);
    expect(html).toContain(provenance.registerName);
    expect(html).toContain(provenance.layerUrl);
    expect(html).toContain("181");
    expect(html).toContain(COASTAL_REGISTRY.island.registerLabelDa);
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
