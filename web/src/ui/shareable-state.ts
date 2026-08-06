import { parseAsString, useQueryStates } from "nuqs";
import type { Placename } from "../domain/placename.ts";

/**
 * Shareable map state (issue #14).
 *
 * The URL is the source of truth only for durable, shareable state:
 * - `q` — current search query. Typed with throttled history *replace*,
 *   so keystrokes never create one history entry each.
 * - `place` — stable feature/place id: canonical `plc_<uuid>` when the
 *   crosswalk knows the place, else the NunaGIS `globalId`. Never a name
 *   or slug (permanent identity rules).
 *
 * `lang` stays out of the URL: locale is a personal reading preference
 * persisted in localStorage, not map state. A shared `?lang=` would
 * override the recipient's own stored choice; the switcher is one click.
 *
 * Transient UI/runtime state (sheet height, hover, download progress,
 * offline status, animation) never serializes. Map center/zoom stays out
 * of scope until a separate shareable-view decision.
 */

const Q_PARAM = "q";
const PLACE_PARAM = "place";

/** Typed search query; empty string clears the key from the URL. */
const qParser = parseAsString
  .withDefault("")
  .withOptions({ history: "replace", throttleMs: 200 });

/**
 * Selected place id. No default: absent in the URL means "nothing selected"
 * (null), so clearing is explicit and stale values fail safe at lookup.
 * Push history: each selection/close is a distinct Back/Forward step.
 */
const placeParser = parseAsString.withOptions({ history: "push" });

export type ShareableMapState = {
  /** Current search query ("" when the URL has no `q`). */
  query: string;
  /** Selected stable id, or null when the URL has no `place`. */
  selectedId: string | null;
  setQuery: (query: string) => void;
  setSelectedId: (id: string) => void;
  clearSelection: () => void;
  /**
   * Remove an unresolved `place` after load, without a new history entry
   * (replace). Used only for stale/unknown ids — never a fake selection.
   */
  clearUnresolvedSelection: () => void;
};

/** React adapter binding: URL → state in, setters → URL out. */
export function useShareableMapState(): ShareableMapState {
  const [params, setParams] = useQueryStates({
    q: qParser,
    place: placeParser,
  });

  return {
    query: params.q,
    selectedId: params.place,
    // Setting the default value ("") clears `q` from the URL.
    setQuery: (query) => void setParams({ q: query }),
    // One combined update: clear `q` and write `place` in a single
    // history entry (nuqs merges the flush; push wins over replace).
    setSelectedId: (id) => void setParams({ q: null, place: id }),
    clearSelection: () => void setParams({ place: null }),
    // Stale ids get replaced (no history entry), unlike user closes
    // which push so Back/Forward can retrace them.
    clearUnresolvedSelection: () =>
      void setParams({ place: null }, { history: "replace" }),
  };
}

/**
 * Stable id for a place, in URL preference order: canonical `plc_<uuid>`
 * when the crosswalk resolved one, else the NunaGIS `globalId`. Never a
 * mutable name, slug, recordId, or type code.
 */
export const shareableIdFor = (place: Placename): string =>
  place.placeId ?? place.globalId;

/**
 * Resolve a `place` URL value against loaded places. Exact `plc_` id first,
 * then case-insensitive NunaGIS `globalId` (UUID case varies across copies
 * of a URL). Unknown/stale values return null — no false selection; App
 * clears the parameter once places have loaded.
 */
export const findPlaceByShareableId = (
  places: ReadonlyArray<Placename>,
  id: string | null,
): Placename | null => {
  if (id == null || id === "") return null;
  const byPlaceId = places.find((place) => place.placeId === id);
  if (byPlaceId) return byPlaceId;
  const needle = id.toUpperCase();
  return (
    places.find((place) => place.globalId.toUpperCase() === needle) ?? null
  );
};

export const shareableQueryParam = Q_PARAM;
export const shareablePlaceParam = PLACE_PARAM;
