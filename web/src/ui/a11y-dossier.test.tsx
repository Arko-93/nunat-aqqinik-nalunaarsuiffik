/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { withMapRank, type Placename } from "../domain/placename.ts";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import { MESSAGES } from "../i18n/messages.ts";
import { trapFocus } from "./focus-trap.ts";
import { PlaceDossier } from "./PlaceDossier.tsx";

afterEach(() => {
  cleanup();
});

const place = (): Placename => {
  const ranked = withMapRank({ typeCode: 21, isLocality: true });
  return {
    ...ranked,
    featureId: "nunagis:nuuk",
    placeId: "plc_67e038aa-f9c6-4ab5-84ce-62c04dad3e80",
    identityStatus: "canonical",
    globalId: "nuuk",
    recordId: 1,
    officialName: "Nuuk",
    danishName: "Godthåb",
    oldOfficialName: null,
    featureKind: "town",
    typeCode: 21,
    isLocality: true,
    isLocalityShadow: false,
    municipalityCode: 956,
    municipalityName: "Sermersooq",
    localityCode: null,
    longitude: -51.72,
    latitude: 64.18,
  };
};

describe("dossier accessibility", () => {
  it("exposes tablist / tabs / tabpanel wiring", () => {
    render(
      <I18nProvider>
        <PlaceDossier place={place()} release={null} />
      </I18nProvider>,
    );

    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("false");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(
      tabs[0]!.getAttribute("id"),
    );
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
  });

  it("switches panels with click and arrow keys", () => {
    render(
      <I18nProvider>
        <PlaceDossier place={place()} release={null} />
      </I18nProvider>,
    );

    const tablist = screen.getByRole("tablist");
    const sources = within(tablist).getByRole("tab", {
      name: MESSAGES.kl.sources,
    });
    fireEvent.click(sources);
    expect(sources.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(MESSAGES.kl.pendingReviewNote)).toBeTruthy();

    const overview = within(tablist).getByRole("tab", {
      name: MESSAGES.kl.overview,
    });
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(overview.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(MESSAGES.kl.officialName)).toBeTruthy();
  });

  it("labels the article with the place title and focuses it on open", () => {
    render(
      <I18nProvider>
        <PlaceDossier place={place()} release={null} />
      </I18nProvider>,
    );

    const article = screen.getByRole("article");
    const title = screen.getByRole("heading", { name: "Nuuk" });
    expect(article.getAttribute("aria-labelledby")).toBe(title.id);
    expect(document.activeElement).toBe(title);
  });
});

describe("trapFocus", () => {
  it("cycles Tab from last control back to first", () => {
    const root = document.createElement("div");
    root.tabIndex = -1;
    const first = document.createElement("button");
    first.textContent = "first";
    const last = document.createElement("button");
    last.textContent = "last";
    root.append(first, last);
    document.body.append(root);
    last.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    let prevented = false;
    event.preventDefault = () => {
      prevented = true;
    };
    trapFocus(root, event);
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(first);
    root.remove();
  });
});
