import type { Placename } from "../domain/placename.ts";

/**
 * Zoom floor when the user picks a search / list result.
 * Localities land past ocean detail thinning (z≥9).
 */
export function focusZoomFor(place: Placename, currentZoom: number): number {
  return Math.max(
    currentZoom,
    place.minZoom + 1.2,
    place.isLocality ? 10.2 : 8.0,
  );
}
