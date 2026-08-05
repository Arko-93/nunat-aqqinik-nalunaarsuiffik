import { describe, expect, it, vi } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { applyMapStyle } from "./apply-style.ts";

const stubStyle = {
  version: 8,
  sources: {},
  layers: [],
} as StyleSpecification;

function fakeMap(options: {
  /** Fire style.load during setStyle (the race that dropped ensureLayers). */
  fireLoadDuringSetStyle?: boolean;
  /** Fire only styledata after setStyle (no style.load). */
  fireStyledataOnly?: boolean;
  styleLoadedAfterSet?: boolean;
}) {
  const listeners = new Map<string, Set<() => void>>();
  let styleLoaded = false;

  const map = {
    on: (type: "style.load" | "styledata", listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    off: (type: "style.load" | "styledata", listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
    setStyle: (_style: StyleSpecification) => {
      styleLoaded = options.styleLoadedAfterSet !== false;
      if (options.fireLoadDuringSetStyle) {
        for (const listener of [...(listeners.get("style.load") ?? [])]) {
          listener();
        }
      }
      if (options.fireStyledataOnly) {
        for (const listener of [...(listeners.get("styledata") ?? [])]) {
          listener();
        }
      }
    },
    isStyleLoaded: () => styleLoaded,
  };

  return map;
}

describe("applyMapStyle", () => {
  it("runs onReady when style.load fires during setStyle", () => {
    const onReady = vi.fn();
    const map = fakeMap({ fireLoadDuringSetStyle: true });
    applyMapStyle(map, stubStyle, onReady);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("runs onReady via styledata when style.load never fires", () => {
    const onReady = vi.fn();
    const map = fakeMap({ fireStyledataOnly: true });
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
});
