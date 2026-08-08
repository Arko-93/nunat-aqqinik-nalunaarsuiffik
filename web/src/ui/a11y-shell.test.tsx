/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import { AppShell } from "./AppShell.tsx";
import { PlaceList } from "./PlaceList.tsx";
import { MESSAGES } from "../i18n/messages.ts";

describe("shell accessibility", () => {
  it("exposes a skip link to place search", () => {
    render(
      <I18nProvider>
        <AppShell
          error={null}
          statusText="ok"
          railExpanded={false}
          mapPanel={<div />}
          railPanel={<div />}
          mobileSheet={null}
        />
      </I18nProvider>,
    );

    const skip = screen.getByRole("link", {
      name: MESSAGES.kl.skipToSearch,
    });
    expect(skip.getAttribute("href")).toBe("#place-search");
    expect(document.getElementById("place-search")).not.toBeNull();
  });

  it("announces active search results with a live region", () => {
    render(
      <I18nProvider>
        <PlaceList
          query="Nuuk"
          onQueryChange={() => undefined}
          hits={[]}
          selectedId={null}
          onSelect={() => undefined}
          queryActive
        />
      </I18nProvider>,
    );

    const region = screen.getByRole("region", { name: MESSAGES.kl.results });
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
  });
});
