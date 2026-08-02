import type { ContentLens } from "./layers.ts";
import type { ZoomBand } from "./importance.ts";
import { BAND_MIN_ZOOM } from "./importance.ts";

/**
 * Progressive map disclosure by content lens.
 * Towns stay early. Settlements and geography names appear only as the
 * user zooms into a region — same curve in both lenses so country scale
 * stays calm (towns as anchors; no geography flood).
 */
export const disclosureMinZoom = (
  _lens: ContentLens,
): Readonly<Record<ZoomBand, number>> => BAND_MIN_ZOOM;
