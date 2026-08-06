// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withMapRank, type Placename } from "../domain/placename.ts";
import {
  findPlaceByShareableId,
  shareableIdFor,
  useShareableMapState,
} from "./shareable-state.ts";

const NAJAT_GLOBAL_ID = "3A6F0D5B-1C2E-4D8A-9B7F-5E4D3C2B1A09";
const NAJAT_PLACE_ID = "plc_5a7f0d5b-1c2e-4d8a-9b7f-5e4d3c2b1a09";
const UPERNAVIK_GLOBAL_ID = "B9E2A1C4-5D6F-4E8B-A3C7-1F2E3D4C5B6A";

const place = (partial: {
  officialName: string;
  globalId: string;
  placeId?: string | null;
  identityStatus?: "canonical" | "candidate" | "upstream_only";
}): Placename => {
  const ranked = withMapRank({ typeCode: 23, isLocality: true });
  return {
    ...ranked,
    featureId: `nunagis:${partial.globalId}`,
    placeId: partial.placeId ?? null,
    identityStatus: partial.identityStatus ?? "upstream_only",
    globalId: partial.globalId,
    recordId: 1,
    officialName: partial.officialName,
    danishName: null,
    oldOfficialName: null,
    featureKind: "settlement",
    typeCode: 23,
    isLocality: true,
    isLocalityShadow: false,
    municipalityCode: 960,
    municipalityName: "Avannaata kommunia",
    localityCode: null,
    longitude: -56,
    latitude: 73,
  };
};

const qParam = (): string | null =>
  new URLSearchParams(window.location.search).get("q");
const placeParam = (): string | null =>
  new URLSearchParams(window.location.search).get("place");

/** Probe using the real production hook against the real URL adapter. */
function Probe() {
  const { query, selectedId, setQuery, setSelectedId, clearSelection } =
    useShareableMapState();
  return (
    <div>
      <output data-testid="query">{query}</output>
      <output data-testid="place">{selectedId ?? "(none)"}</output>
      <button onClick={() => setQuery("qaa")}>type-qaa</button>
      <button onClick={() => setQuery("qaarsut")}>type-qaarsut</button>
      <button onClick={() => setQuery("")}>clear-query</button>
      <button onClick={() => setSelectedId(NAJAT_PLACE_ID)}>select</button>
      <button onClick={() => clearSelection()}>close</button>
    </div>
  );
}

const renderProbe = (url: string) => {
  window.history.replaceState(null, "", url);
  return render(
    <NuqsAdapter>
      <Probe />
    </NuqsAdapter>,
  );
};

describe("shareable state ID helpers", () => {
  it("prefers the canonical plc_ id, falls back to the NunaGIS globalId, never a name", () => {
    const upstream = place({
      officialName: "Naajaat",
      globalId: NAJAT_GLOBAL_ID,
    });
    const reconciled = place({
      officialName: "Naajaat",
      globalId: NAJAT_GLOBAL_ID,
      placeId: NAJAT_PLACE_ID,
      identityStatus: "canonical",
    });
    expect(shareableIdFor(reconciled)).toBe(NAJAT_PLACE_ID);
    expect(shareableIdFor(upstream)).toBe(NAJAT_GLOBAL_ID);
    expect(shareableIdFor(upstream)).not.toBe("Naajaat");
    expect(shareableIdFor(upstream)).not.toContain("Naajaat");
  });

  it("resolves placeId exactly and globalId case-insensitively; unknown fails safe", () => {
    const reconciled = place({
      officialName: "Naajaat",
      globalId: NAJAT_GLOBAL_ID,
      placeId: NAJAT_PLACE_ID,
      identityStatus: "canonical",
    });
    const upstream = place({
      officialName: "Upernavik",
      globalId: UPERNAVIK_GLOBAL_ID,
    });
    expect(findPlaceByShareableId([reconciled, upstream], NAJAT_PLACE_ID)).toBe(
      reconciled,
    );
    expect(
      findPlaceByShareableId([reconciled, upstream], NAJAT_GLOBAL_ID),
    ).toBe(reconciled);
    expect(
      findPlaceByShareableId(
        [reconciled, upstream],
        UPERNAVIK_GLOBAL_ID.toLowerCase(),
      ),
    ).toBe(upstream);
    expect(findPlaceByShareableId([reconciled, upstream], "plc_deadbeef")).toBe(
      null,
    );
    expect(findPlaceByShareableId([reconciled, upstream], "")).toBe(null);
    expect(findPlaceByShareableId([reconciled, upstream], null)).toBe(null);
    expect(findPlaceByShareableId([], "plc_anything")).toBe(null);
  });
});

describe("URL-state seam", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
    // Drain any pending throttled flush left by a previous test.
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  afterEach(() => {
    cleanup();
  });

  it("restores query and selection from the initial URL", () => {
    renderProbe(`/?q=qaarsut&place=${NAJAT_PLACE_ID}`);
    expect(screen.getByTestId("query").textContent).toBe("qaarsut");
    expect(screen.getByTestId("place").textContent).toBe(NAJAT_PLACE_ID);
  });

  it("writes q with throttled replace: state instant, URL delayed and merged", () => {
    vi.useFakeTimers();
    renderProbe("/");
    const lengthBefore = window.history.length;

    act(() => {
      fireEvent.click(screen.getByText("type-qaa"));
    });
    // React state is immediate; the URL is not yet written.
    expect(screen.getByTestId("query").textContent).toBe("qaa");
    expect(window.location.search).toBe("");
    // A second keystroke before the flush merges into the same write:
    // still nothing serialized, and no intermediate value is ever stored.
    act(() => {
      fireEvent.click(screen.getByText("type-qaarsut"));
    });
    expect(screen.getByTestId("query").textContent).toBe("qaarsut");
    expect(window.location.search).toBe("");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // One merged trailing write with the final value only.
    expect(qParam()).toBe("qaarsut");
    // replace, not push: typing never grows the history stack
    expect(window.history.length).toBe(lengthBefore);
  });

  it("writes place and removes q in one push entry when selecting", async () => {
    renderProbe("/?q=qaarsut");
    const lengthBefore = window.history.length;

    fireEvent.click(screen.getByText("select"));

    await waitFor(() => {
      expect(placeParam()).toBe(NAJAT_PLACE_ID);
      expect(qParam()).toBeNull();
    });
    expect(screen.getByTestId("query").textContent).toBe("");
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it("clearing the query removes q; closing removes place", async () => {
    renderProbe(`/?q=qaarsut&place=${NAJAT_PLACE_ID}`);

    fireEvent.click(screen.getByText("clear-query"));
    await waitFor(() => {
      expect(qParam()).toBeNull();
      expect(placeParam()).toBe(NAJAT_PLACE_ID);
    });

    fireEvent.click(screen.getByText("close"));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).size).toBe(0),
    );
  });

  it("Back and Forward restore query and selection predictably", async () => {
    renderProbe("/");
    fireEvent.click(screen.getByText("type-qaarsut"));
    await waitFor(() => expect(qParam()).toBe("qaarsut"));
    fireEvent.click(screen.getByText("select"));
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    fireEvent.click(screen.getByText("close"));
    await waitFor(() => expect(placeParam()).toBeNull());

    act(() => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.getByTestId("place").textContent).toBe(NAJAT_PLACE_ID),
    );
    expect(screen.getByTestId("query").textContent).toBe("");

    act(() => {
      window.history.back();
    });
    await waitFor(() =>
      expect(screen.getByTestId("query").textContent).toBe("qaarsut"),
    );
    expect(screen.getByTestId("place").textContent).toBe("(none)");

    act(() => {
      window.history.forward();
    });
    await waitFor(() =>
      expect(screen.getByTestId("place").textContent).toBe(NAJAT_PLACE_ID),
    );
    expect(screen.getByTestId("query").textContent).toBe("");
  });

  it("serializes only the q and place keys", async () => {
    renderProbe("/");
    fireEvent.click(screen.getByText("type-qaarsut"));
    fireEvent.click(screen.getByText("select"));
    await waitFor(() => expect(placeParam()).toBe(NAJAT_PLACE_ID));
    expect(
      Array.from(new URLSearchParams(window.location.search).keys()).sort(),
    ).toEqual(["place"]);

    fireEvent.click(screen.getByText("close"));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).size).toBe(0),
    );
  });
});
