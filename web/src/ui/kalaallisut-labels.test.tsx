import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import { MESSAGES, type Locale } from "../i18n/messages.ts";
import { withMapRank, type Placename } from "../domain/placename.ts";
import {
  searchAlternateMatchText,
  searchPlacenames,
  type SearchHit,
} from "../domain/search.ts";
import { PlaceDossier } from "./PlaceDossier.tsx";
import { PlaceResultCard } from "./PlaceResultCard.tsx";

const place = (partial: {
  globalId: string;
  recordId: number;
  officialName: string;
  danishName?: string | null;
  typeCode: number;
  isLocality: boolean;
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
    danishName: partial.danishName ?? null,
    oldOfficialName: null,
    featureKind: "other",
    typeCode: partial.typeCode,
    isLocality: partial.isLocality,
    isLocalityShadow: false,
    municipalityCode: null,
    municipalityName: null,
    localityCode: null,
    longitude: -52,
    latitude: 64,
  };
};

/** Island + fjord with official Kalaallisut + Danish alternate. */
const island = place({
  globalId: "island-qeqertarsuaq",
  recordId: 101,
  officialName: "Qeqertarsuaq",
  danishName: "Disko",
  typeCode: 181,
  isLocality: false,
});

const fjord = place({
  globalId: "fjord-nuup-kangerlua",
  recordId: 102,
  officialName: "Nuup Kangerlua",
  danishName: "Godthåbsfjord",
  typeCode: 57,
  isLocality: false,
});

const fixtures = [island, fjord];

function renderCard(hit: SearchHit, locale: Locale): string {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={locale}>
      <PlaceResultCard place={hit.place} matchedField={hit.matchedField} />
    </I18nProvider>,
  );
}

function renderDossier(subject: Placename, locale: Locale): string {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={locale}>
      <PlaceDossier place={subject} release={null} />
    </I18nProvider>,
  );
}

describe("official Kalaallisut primary labels (issue #15)", () => {
  it("keeps officialName primary across KL/DA/EN with no type suffixes", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      for (const subject of [island, fjord]) {
        const hit = searchPlacenames(fixtures, subject.officialName, 3).find(
          (entry) => entry.place.globalId === subject.globalId,
        );
        expect(hit, `${subject.globalId} @ ${locale}`).toBeTruthy();
        expect(hit!.place.officialName).toBe(subject.officialName);
        expect(hit!.matchedField).toBe("official");

        const html = renderCard(hit!, locale);
        expect(html).toContain(subject.officialName);
        expect(html).not.toContain(`${subject.officialName} island`);
        expect(html).not.toContain(`${subject.officialName} fjord`);
        expect(html).not.toContain(`${subject.officialName} ø`);
        // Danish alternate stays hidden when official matched.
        expect(html).not.toContain(subject.danishName!);
        // Locale must not rewrite the primary name.
        expect(html).not.toContain("Godthaab");
        expect(html).not.toContain("Godthåb Fjord");
      }
    }
  });

  it("shows Danish alternate in search only when the alternate matched", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      const islandHit = searchPlacenames(fixtures, "Disko", 3).find(
        (entry) => entry.place.globalId === island.globalId,
      )!;
      const fjordHit = searchPlacenames(fixtures, "Godthåbsfjord", 3).find(
        (entry) => entry.place.globalId === fjord.globalId,
      )!;

      expect(islandHit.place.officialName).toBe("Qeqertarsuaq");
      expect(fjordHit.place.officialName).toBe("Nuup Kangerlua");
      expect(searchAlternateMatchText(islandHit)?.text).toBe("Disko");
      expect(searchAlternateMatchText(fjordHit)?.text).toBe("Godthåbsfjord");

      const islandHtml = renderCard(islandHit, locale);
      const fjordHtml = renderCard(fjordHit, locale);
      expect(islandHtml.indexOf("Qeqertarsuaq")).toBeLessThan(
        islandHtml.indexOf("Disko"),
      );
      expect(fjordHtml.indexOf("Nuup Kangerlua")).toBeLessThan(
        fjordHtml.indexOf("Godthåbsfjord"),
      );
      expect(islandHtml).toContain(`${MESSAGES[locale].danishName}: Disko`);
      expect(fjordHtml).toContain(
        `${MESSAGES[locale].danishName}: Godthåbsfjord`,
      );
    }
  });

  it("keeps dossier alternates labelled below officialName in every locale", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      for (const subject of [island, fjord]) {
        const html = renderDossier(subject, locale);
        const officialIdx = html.indexOf(subject.officialName);
        const danishIdx = html.indexOf(subject.danishName!);
        const officialLabelIdx = html.indexOf(MESSAGES[locale].officialName);
        const danishLabelIdx = html.indexOf(MESSAGES[locale].danishName);
        expect(officialIdx).toBeGreaterThanOrEqual(0);
        expect(danishIdx).toBeGreaterThan(officialIdx);
        expect(officialLabelIdx).toBeGreaterThanOrEqual(0);
        expect(danishLabelIdx).toBeGreaterThan(officialLabelIdx);
        expect(html).not.toContain(`${subject.officialName} island`);
        expect(html).not.toContain(`${subject.officialName} fjord`);
      }
    }
  });
});
