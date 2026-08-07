// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCALE, MESSAGES } from "../i18n/messages.ts";
import { Root } from "./Root.tsx";

// kumo Tabs observes its size; jsdom ships no ResizeObserver.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??=
  ResizeObserverStub;

const NAJAT_GLOBAL_ID = "3A6F0D5B-1C2E-4D8A-9B7F-5E4D3C2B1A09";
const NAJAT_PLACE_ID = "plc_5a7f0d5b-1c2e-4d8a-9b7f-5e4d3c2b1a09";
const UPERNAVIK_GLOBAL_ID = "B9E2A1C4-5D6F-4E8B-A3C7-1F2E3D4C5B6A";
const STALE_PLACE_ID = "plc_00000000-0000-4000-8000-000000000000";

/** Mirrors the baked web/public/data/placenames.geojson property shape. */
const placenamesFixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 1,
      geometry: { type: "Point", coordinates: [-56.14, 73.14] },
      properties: {
        officialName: "Naajaat",
        globalId: NAJAT_GLOBAL_ID,
        recordId: 1,
        typeCode: 23,
        isLocality: true,
        municipalityCode: 960,
        longitude: -56.14,
        latitude: 73.14,
        danishName: null,
        oldOfficialName: null,
        municipalityName: null,
        localityCode: null,
      },
    },
    {
      type: "Feature",
      id: 2,
      geometry: { type: "Point", coordinates: [-56.14, 72.79] },
      properties: {
        officialName: "Upernavik",
        globalId: UPERNAVIK_GLOBAL_ID,
        recordId: 2,
        typeCode: 21,
        isLocality: true,
        municipalityCode: 960,
        longitude: -56.14,
        latitude: 72.79,
        danishName: null,
        oldOfficialName: null,
        municipalityName: null,
        localityCode: null,
      },
    },
  ],
};

const crosswalkFixture = {
  generatedFrom: "test-fixture",
  entries: [
    {
      featureId: `nunagis:${NAJAT_GLOBAL_ID}`,
      placeId: NAJAT_PLACE_ID,
      identityStatus: "canonical",
      globalId: NAJAT_GLOBAL_ID,
      officialName: "Naajaat",
    },
  ],
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === "/releases/CURRENT") {
    return jsonResponse({ release_id: "test.2026.01" });
  }
  if (url === "/releases/test.2026.01/manifest.json") {
    return jsonResponse({
      release_id: "test.2026.01",
      created_at: "2026-01-01T00:00:00Z",
      data_as_of: "2026-01-01",
    });
  }
  if (url.endsWith("/placenames.geojson")) {
    return jsonResponse(placenamesFixture);
  }
  if (url.endsWith("/identity-crosswalk.json")) {
    return jsonResponse(crosswalkFixture);
  }
  return new Response("not found", { status: 404 });
});

/** The real MapCanvas needs WebGL; tests assert on its props via this stub. */
vi.mock("./MapCanvas.tsx", async () => {
  const React = await import("react");
  return {
    MapCanvas: (props: {
      collection: unknown;
      selectedId: number | null;
      onSelect: (place: unknown) => void;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "map-canvas",
          "data-loaded": props.collection ? "true" : "false",
          "data-selected-id": String(props.selectedId ?? ""),
        },
        React.createElement(
          "button",
          { onClick: () => props.onSelect((props.collection as { features: Array<{ properties: unknown }> }).features[0]!.properties) },
          "mock map click",
        ),
      ),
  };
});

const qParam = (): string | null =>
  new URLSearchParams(window.location.search).get("q");
const placeParam = (): string | null =>
  new URLSearchParams(window.location.search).get("place");

const rail = () => document.querySelector(".shell-rail") as HTMLElement;
const railWithin = () => within(rail());
const mapCanvas = () => screen.getByTestId("map-canvas");
const dossier = () => document.querySelector(".shell-rail-dossier");
const searchInput = () =>
  railWithin().getByRole("searchbox") as HTMLInputElement;
const waitLoaded = async () => {
  await waitFor(() =>
    expect(mapCanvas().getAttribute("data-loaded")).toBe("true"),
  );
};
const typeQuery = (value: string) => {
  fireEvent.change(searchInput(), { target: { value } });
};

const renderApp = (url = "/") => {
  window.history.replaceState(null, "", url);
  return render(<Root />);
};

describe("app URL-state seam", () => {
  // jsdom URL state drives the seam; i18n falls back to DEFAULT_LOCALE
  // (localStorage is unavailable in this test environment, and the app
  // already tolerates that).
  const t = MESSAGES[DEFAULT_LOCALE];

  beforeEach(async () => {
    window.history.replaceState(null, "", "/");
    // Drain any pending throttled flush left by a previous test.
    await new Promise((resolve) => setTimeout(resolve, 300));
    vi.stubGlobal("fetch", fetchStub);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("restores a copied URL: query immediately, selection after data loads", async () => {
    renderApp(`/?q=naaj&place=${NAJAT_PLACE_ID}`);

    // Query is available before any data arrives.
    expect(searchInput().value).toBe("naaj");
    // Selection cannot resolve until places load.
    expect(dossier()).toBeNull();
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("");

    await waitLoaded();

    // Both restored: selected row highlighted, map selection set, URL intact.
    expect(
      railWithin()
        .getByRole("option", { name: /Naajaat/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("1");
    expect(qParam()).toBe("naaj");
    expect(placeParam()).toBe(NAJAT_PLACE_ID);
  });

  it("restores selection as the dossier once data loads", async () => {
    renderApp(`/?place=${NAJAT_PLACE_ID}`);
    expect(dossier()).toBeNull();

    await waitLoaded();

    const panel = dossier();
    expect(panel).not.toBeNull();
    expect(
      within(panel as HTMLElement).getByRole("heading", {
        name: "Naajaat",
      }),
    ).toBeTruthy();
  });

  it("typing writes q with replace history, one merged URL per burst", async () => {
    renderApp("/");
    await waitLoaded();
    const lengthBefore = window.history.length;

    typeQuery("n");
    typeQuery("naa");
    typeQuery("naaj");

    await waitFor(() => expect(qParam()).toBe("naaj"));
    expect(
      Array.from(new URLSearchParams(window.location.search).keys()).sort(),
    ).toEqual(["q"]);
    expect(window.history.length).toBe(lengthBefore);
    expect(searchInput().value).toBe("naaj");
  });

  it("selecting a result writes place and clears q in a single entry", async () => {
    renderApp("/");
    await waitLoaded();
    typeQuery("naaj");
    await waitFor(() => expect(qParam()).toBe("naaj"));
    const lengthBefore = window.history.length;

    fireEvent.click(railWithin().getByRole("button", { name: /Naajaat/ }));

    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    expect(qParam()).toBeNull();
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("1");
    expect(dossier()).not.toBeNull();
  });

  it("closing the dossier removes place", async () => {
    renderApp(`/?place=${NAJAT_PLACE_ID}`);
    await waitLoaded();
    const lengthBefore = window.history.length;

    fireEvent.click(
      railWithin().getByRole("button", { name: t.closePlace }),
    );

    await waitFor(() => expect(placeParam()).toBeNull());
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(dossier()).toBeNull();
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("");
    expect(new URLSearchParams(window.location.search).size).toBe(0);
  });

  it("Back and Forward restore search and selection predictably", async () => {
    renderApp("/");
    await waitLoaded();

    typeQuery("naaj");
    await waitFor(() => expect(qParam()).toBe("naaj"));
    fireEvent.click(railWithin().getByRole("button", { name: /Naajaat/ }));
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    fireEvent.click(
      railWithin().getByRole("button", { name: t.closePlace }),
    );
    await waitFor(() => expect(placeParam()).toBeNull());

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    expect(dossier()).not.toBeNull();
    expect(searchInput().value).toBe("");

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(qParam()).toBe("naaj"));
    expect(searchInput().value).toBe("naaj");
    expect(dossier()).toBeNull();

    act(() => {
      window.history.forward();
    });
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    expect(dossier()).not.toBeNull();
  });

  it("stale place fails safe: auto-cleared after load, no false selection, map usable", async () => {
    renderApp(`/?place=${STALE_PLACE_ID}`);
    const lengthBefore = window.history.length;
    await waitLoaded();

    // No false selection while loading, then the unresolved param is
    // removed with history replace (no new Back/Forward entry).
    expect(dossier()).toBeNull();
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("");
    await waitFor(() => expect(placeParam()).toBeNull());
    expect(window.history.length).toBe(lengthBefore);

    // Map keeps working: search still finds places.
    typeQuery("uper");
    await waitFor(() => expect(qParam()).toBe("uper"));
    fireEvent.click(railWithin().getByRole("button", { name: /Upernavik/ }));

    // Selecting a valid place writes it (globalId path: no crosswalk).
    await waitFor(() => expect(placeParam()).toBe(UPERNAVIK_GLOBAL_ID));
    expect(qParam()).toBeNull();
    expect(mapCanvas().getAttribute("data-selected-id")).toBe("2");

    // Closing the dossier clears the parameter entirely.
    fireEvent.click(
      railWithin().getByRole("button", { name: t.closePlace }),
    );
    await waitFor(() => expect(placeParam()).toBeNull());
  });

  it("serializes no transient state: only q and place ever appear", async () => {
    renderApp("/");
    await waitLoaded();

    typeQuery("naaj");
    await waitFor(() => expect(qParam()).toBe("naaj"));
    expect(
      Array.from(new URLSearchParams(window.location.search).keys()).sort(),
    ).toEqual(["q"]);

    fireEvent.click(railWithin().getByRole("button", { name: /Naajaat/ }));
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    expect(
      Array.from(new URLSearchParams(window.location.search).keys()).sort(),
    ).toEqual(["place"]);

    // Transient sheet interactions never touch the URL.
    const sheetToggle = screen.getByRole("button", {
      name: new RegExp(`${t.expandSheet}|${t.collapseSheet}`),
    });
    fireEvent.click(sheetToggle);
    fireEvent.click(sheetToggle);
    expect(
      Array.from(new URLSearchParams(window.location.search).keys()).sort(),
    ).toEqual(["place"]);

    fireEvent.click(
      railWithin().getByRole("button", { name: t.closePlace }),
    );
    await waitFor(() => expect(placeParam()).toBeNull());
    expect(new URLSearchParams(window.location.search).size).toBe(0);
  });
});
