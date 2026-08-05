import type { StyleSpecification } from "maplibre-gl";

export type StyleApplyOptions = {
  /** Force full reload so style.load is reliable (MapLibre JSON diff can skip it). */
  diff?: boolean;
};

/** Minimal map surface used when replacing the basemap style. */
export type StyleApplyMap = {
  on: (type: "style.load" | "styledata", listener: () => void) => unknown;
  off: (type: "style.load" | "styledata", listener: () => void) => unknown;
  setStyle: (
    style: StyleSpecification,
    options?: StyleApplyOptions,
  ) => unknown;
  /** MapLibre types this as `boolean | void` in some versions. */
  isStyleLoaded: () => boolean | void;
};

/** Bumps on every apply so stale style.load/styledata handlers no-op. */
let applyGeneration = 0;

/** Test seam — reset generation between unit cases. */
export function resetApplyMapStyleGenerationForTests(): void {
  applyGeneration = 0;
}

/**
 * Register style-ready handlers *before* setStyle so style.load during
 * setStyle is not missed.
 *
 * Do **not** call the ready handler synchronously after setStyle: the previous
 * style can still report `isStyleLoaded() === true` while sources are already
 * cleared.
 *
 * `style.load` is authoritative for the new style (do not gate it on
 * isStyleLoaded). `styledata` is a fallback that ignores the stale
 * still-loaded window after setStyle until the style has unloaded or
 * style.load has been seen.
 */
export function applyMapStyle(
  map: StyleApplyMap,
  style: StyleSpecification,
  onReady: () => void,
): void {
  const generation = ++applyGeneration;
  let done = false;
  let running = false;
  let seenStyleLoad = false;
  let seenNotLoaded = false;
  const wasLoadedBefore = map.isStyleLoaded() === true;

  const detach = () => {
    map.off("style.load", onStyleLoad);
    map.off("styledata", onStyleData);
  };

  const attempt = () => {
    if (done || running) return;
    if (generation !== applyGeneration) {
      detach();
      return;
    }
    running = true;
    try {
      onReady();
      done = true;
      detach();
    } catch (error) {
      // Re-arm: leave listeners attached so a later style event can retry.
      throw error;
    } finally {
      running = false;
    }
  };

  const onStyleLoad = () => {
    if (generation !== applyGeneration) {
      detach();
      return;
    }
    seenStyleLoad = true;
    // style.load means the new style is current — do not wait on isStyleLoaded.
    attempt();
  };

  const onStyleData = () => {
    if (generation !== applyGeneration) {
      detach();
      return;
    }
    if (map.isStyleLoaded() !== true) {
      seenNotLoaded = true;
      return;
    }
    // Skip the stale "still loaded" window from the previous style.
    if (!seenStyleLoad && wasLoadedBefore && !seenNotLoaded) return;
    attempt();
  };

  map.on("style.load", onStyleLoad);
  map.on("styledata", onStyleData);
  // Full reload: JSON style diff can apply the new style without style.load.
  map.setStyle(style, { diff: false });
  // Intentionally no synchronous attempt() here.
}
