import { afterEach, describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  applyMapStyle,
  resetApplyMapStyleGenerationForTests,
  type StyleApplyOptions,
} from "./apply-style.ts";

const stubStyle = {
  version: 8,
  sources: {},
  layers: [],
} as StyleSpecification;

afterEach(() => {
  resetApplyMapStyleGenerationForTests();
});

function fakeMap(options: {
  /** Fire style.load during setStyle (new style ready inline). */
  fireLoadDuringSetStyle?: boolean;
  /** Fire only styledata during setStyle (no style.load). */
  fireStyledataOnly?: boolean;
  /** isStyleLoaded before setStyle (default false). */
  loadedBeforeSetStyle?: boolean;
  /** After setStyle without events: stay loaded (stale) and clear sources. */
  clearSourcesKeepLoaded?: boolean;
}) {
  const listeners = new Map<string, Set<() => void>>();
  const sources = new Set<string>(
    options.loadedBeforeSetStyle ? ["placenames"] : [],
  );
  let styleLoaded = options.loadedBeforeSetStyle === true;
  let lastSetStyleOptions: StyleApplyOptions | undefined;

  const fire = (type: "style.load" | "styledata") => {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener();
    }
  };

  const map = {
    on: (type: "style.load" | "styledata", listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    off: (type: "style.load" | "styledata", listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
    setStyle: (_style: StyleSpecification, opts?: StyleApplyOptions) => {
      lastSetStyleOptions = opts;
      if (options.clearSourcesKeepLoaded) {
        sources.clear();
        // Stale: previous style still reports loaded.
        styleLoaded = true;
        return;
      }
      if (options.fireLoadDuringSetStyle) {
        sources.clear();
        styleLoaded = false;
        fire("style.load");
        styleLoaded = true;
      }
      if (options.fireStyledataOnly) {
        sources.clear();
        styleLoaded = false;
        fire("styledata"); // not loaded yet
        styleLoaded = true;
        fire("styledata"); // loaded after unload
      }
    },
    isStyleLoaded: () => styleLoaded,
    fire,
    setStyleLoaded: (value: boolean) => {
      styleLoaded = value;
    },
    sources,
    get lastSetStyleOptions() {
      return lastSetStyleOptions;
    },
  };

  return map;
}

describe("applyMapStyle", () => {
  it("runs onReady when style.load fires during setStyle", () => {
    const onReady = vi.fn();
    const map = fakeMap({ fireLoadDuringSetStyle: true });
    applyMapStyle(map, stubStyle, onReady);
    expect(onReady).toHaveBeenCalledOnce();
    expect(map.lastSetStyleOptions).toEqual({ diff: false });
  });

  it("runs onReady via styledata after an unload cycle when style.load never fires", () => {
    const onReady = vi.fn();
    const map = fakeMap({
      loadedBeforeSetStyle: true,
      fireStyledataOnly: true,
    });
    applyMapStyle(map, stubStyle, onReady);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("does not run twice when both style.load and styledata fire", () => {
    const onReady = vi.fn();
    const map = fakeMap({
      fireLoadDuringSetStyle: true,
      fireStyledataOnly: true,
    });
    applyMapStyle(map, stubStyle, onReady);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("ignores stale isStyleLoaded after setStyle; runs once on new style.load", () => {
    const sources = new Set<string>(["placenames"]);
    let styleLoaded = true;
    const listeners = new Map<string, Set<() => void>>();
    let onReadySawPlacenames: boolean | null = null;
    let setStyleOptions: StyleApplyOptions | undefined;

    const map = {
      on: (type: "style.load" | "styledata", listener: () => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      off: (type: "style.load" | "styledata", listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
      setStyle: (_style: StyleSpecification, opts?: StyleApplyOptions) => {
        setStyleOptions = opts;
        // Swap starts: previous sources gone; loaded flag can stay true briefly.
        sources.clear();
      },
      isStyleLoaded: () => styleLoaded,
    };

    const onReady = vi.fn(() => {
      onReadySawPlacenames = sources.has("placenames");
      sources.add("placenames");
    });

    applyMapStyle(map, stubStyle, onReady);

    // Must not treat the previous style as ready.
    expect(onReady).not.toHaveBeenCalled();
    expect(sources.has("placenames")).toBe(false);
    expect(setStyleOptions).toEqual({ diff: false });

    // Stale styledata while still "loaded" must not win.
    for (const listener of [...(listeners.get("styledata") ?? [])]) {
      listener();
    }
    expect(onReady).not.toHaveBeenCalled();

    // New style finishes — style.load is authoritative.
    styleLoaded = true;
    for (const listener of [...(listeners.get("style.load") ?? [])]) {
      listener();
    }

    expect(onReady).toHaveBeenCalledOnce();
    expect(onReadySawPlacenames).toBe(false);
    expect(sources.has("placenames")).toBe(true);
  });

  it("runs onReady on style.load even when isStyleLoaded is still false", () => {
    const onReady = vi.fn();
    const listeners = new Map<string, Set<() => void>>();
    let styleLoaded = true;

    const map = {
      on: (type: "style.load" | "styledata", listener: () => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      off: (type: "style.load" | "styledata", listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
      setStyle: () => {
        styleLoaded = false;
        for (const listener of [...(listeners.get("style.load") ?? [])]) {
          listener();
        }
      },
      isStyleLoaded: () => styleLoaded,
    };

    applyMapStyle(map, stubStyle, onReady);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("ignores stale handlers after a newer apply", () => {
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const map = fakeMap({});

    applyMapStyle(map, stubStyle, firstReady);
    applyMapStyle(map, stubStyle, secondReady);

    map.fire("style.load");
    expect(firstReady).not.toHaveBeenCalled();
    expect(secondReady).toHaveBeenCalledOnce();
  });

  it("re-arms when onReady throws", () => {
    const map = fakeMap({});
    let attempts = 0;
    const onReady = vi.fn(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("ensureLayers failed");
    });

    applyMapStyle(map, stubStyle, onReady);
    expect(() => map.fire("style.load")).toThrow(/ensureLayers failed/);
    expect(onReady).toHaveBeenCalledTimes(1);

    map.fire("style.load");
    expect(onReady).toHaveBeenCalledTimes(2);
  });
});
