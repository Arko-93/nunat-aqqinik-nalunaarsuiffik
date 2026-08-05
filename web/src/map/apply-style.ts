import type { StyleSpecification } from "maplibre-gl";

/** Minimal map surface used when replacing the basemap style. */
export type StyleApplyMap = {
  on: (type: "style.load" | "styledata", listener: () => void) => unknown;
  off: (type: "style.load" | "styledata", listener: () => void) => unknown;
  setStyle: (style: StyleSpecification) => unknown;
  /** MapLibre types this as `boolean | void` in some versions. */
  isStyleLoaded: () => boolean | void;
};

/**
 * Register style-ready handlers *before* setStyle so a synchronous
 * style.load cannot be missed (MapLibre may fire during setStyle).
 * Also listens for styledata as a fallback when placenames are still missing.
 */
export function applyMapStyle(
  map: StyleApplyMap,
  style: StyleSpecification,
  onReady: () => void,
): void {
  let done = false;
  const run = () => {
    if (done) return;
    if (map.isStyleLoaded() !== true) return;
    done = true;
    map.off("style.load", run);
    map.off("styledata", run);
    onReady();
  };

  map.on("style.load", run);
  map.on("styledata", run);
  map.setStyle(style);
  run();
}
