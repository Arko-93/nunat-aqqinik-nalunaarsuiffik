/**
 * Hybrid D meter-band policy (wayfinder #9 / issue #10).
 * Ocean: filled depth classes + contour metering under land.
 * Land: peaks-only color bands (issue #24) — a peaks-only color-relief
 * raster above the hillshade; elevations below 500 m stay transparent.
 */

import type { ExpressionSpecification } from "maplibre-gl";

export const OCEAN_BREAKS_M = [5, 10, 20, 50, 100, 200, 500, 1000] as const;

/**
 * Contour / fill thinning (dogfood UX):
 * Overview (below OCEAN_CONTOUR_DETAIL_MIN_ZOOM): Hybrid D fills + DEM
 * hillshade + deep majors (100/200/500/1000 m).
 * Detail (at/above that zoom): full Hybrid D contour ladder including
 * shallow 5/10/20/50 m (tiles have no 1–2 m — Hybrid D starts at 5 m).
 * Hide depare fills and fade DEM hillshade — open-grid cell edges read as
 * square waves when overzoomed; the contour lines stay useful.
 */
export const OCEAN_CONTOUR_OVERVIEW_BREAKS_M = [100, 200, 500, 1000] as const;
/** Full Hybrid D ladder at detail — shallow through deep. */
export const OCEAN_CONTOUR_DETAIL_BREAKS_M = OCEAN_BREAKS_M;
export const OCEAN_CONTOUR_DETAIL_MIN_ZOOM = 9;

/**
 * Marine-chart contour hierarchy (index / intermediate / shallow).
 * Index carries structure; shallow meters nearshore without competing.
 * No 150 m in tiles — Hybrid D only.
 */
export const OCEAN_CONTOUR_INDEX_M = [200, 500, 1000] as const;
export const OCEAN_CONTOUR_INTERMEDIATE_M = [50, 100] as const;
export const OCEAN_CONTOUR_SHALLOW_M = [5, 10, 20] as const;

/** Shallow contour labels only from this zoom (index/mid sooner). */
export const OCEAN_CONTOUR_SHALLOW_LABEL_MIN_ZOOM = 11;

export type OceanContourLabelRank = "index" | "intermediate" | "shallow";

export const LAND_BREAKS_M = [500, 1000, 2000] as const;

export const METER_BAND_POLICY = {
  key: "D" as const,
  oceanBreaksM: OCEAN_BREAKS_M,
  landBreaksM: LAND_BREAKS_M,
  oceanStyle: "filled-plus-contours-masked" as const,
  /** Land bands paint high peaks only (≥500 m), never a full land wash. */
  landPeaksOnly: true as const,
  /** Contour lines are zoom-thinned majors; fills still use full OCEAN_BREAKS_M. */
  oceanContourThinning: "zoom-major" as const,
  /** Line weight/color follow marine index/intermediate/shallow ranks. */
  oceanContourHierarchy: "index-intermediate" as const,
};

/**
 * Quiet chart-style widths: hierarchy stays, but land/islands/settlements
 * remain the primary visual signal (contours as secondary metering).
 */
export function oceanContourLineWidthPx(depthAbsM: number): number {
  if (depthAbsM >= 500) return 1.35;
  if (depthAbsM >= 200) return 1.2;
  if (depthAbsM >= 100) return 0.85;
  if (depthAbsM >= 50) return 0.75;
  if (depthAbsM >= 20) return 0.55;
  if (depthAbsM >= 10) return 0.45;
  return 0.4;
}

export function oceanContourLineOpacity(depthAbsM: number): number {
  if (depthAbsM >= 200) return 0.42;
  if (depthAbsM >= 50) return 0.34;
  return 0.26;
}

/** Soft coastal blues — never as dark as land labels / hillshade accents. */
export function oceanContourLineColor(depthAbsM: number): string {
  if (depthAbsM >= 500) return "#3d6f88";
  if (depthAbsM >= 200) return "#4a7f96";
  if (depthAbsM >= 50) return "#5a93a8";
  return "#7aafc0";
}

export function oceanContourLabelRank(
  depthAbsM: number,
): OceanContourLabelRank {
  if (
    (OCEAN_CONTOUR_INDEX_M as readonly number[]).includes(depthAbsM)
  ) {
    return "index";
  }
  if (
    (OCEAN_CONTOUR_INTERMEDIATE_M as readonly number[]).includes(depthAbsM)
  ) {
    return "intermediate";
  }
  return "shallow";
}

function matchByDepthAbsM(
  valueFor: (depthAbsM: number) => string | number,
): ExpressionSpecification {
  // match(get depth_abs_m, d1, v1, d2, v2, …, default)
  const stops: Array<string | number> = [];
  for (const depth of OCEAN_BREAKS_M) {
    stops.push(depth, valueFor(depth));
  }
  const fallback = valueFor(OCEAN_BREAKS_M[OCEAN_BREAKS_M.length - 1]!);
  return ["match", ["get", "depth_abs_m"], ...stops, fallback];
}

export function oceanContourLineWidthExpression(): ExpressionSpecification {
  return matchByDepthAbsM(oceanContourLineWidthPx);
}

export function oceanContourLineOpacityExpression(): ExpressionSpecification {
  return matchByDepthAbsM(oceanContourLineOpacity);
}

export function oceanContourLineColorExpression(): ExpressionSpecification {
  return matchByDepthAbsM(oceanContourLineColor);
}

export function oceanBandColor(depthM: number): string {
  if (depthM <= 10) return "#b9e0f0";
  if (depthM <= 20) return "#7eb8d4";
  if (depthM <= 50) return "#4a8fb8";
  if (depthM <= 100) return "#2f6f94";
  if (depthM <= 200) return "#1d5273";
  if (depthM <= 500) return "#143a54";
  return "#0c2438";
}

export function landPeakBandColor(elevM: number): string | undefined {
  // Peaks-only policy (LAND_BREAKS_M): elevations below 500 m are NOT a
  // band — the color-relief bake leaves them transparent. Intervals are
  // half-open, matching the build: [500, 1000) / [1000, 2000) / [2000, ∞).
  if (elevM < 500) return undefined;
  if (elevM < 1000) return "#8a7a5c";
  if (elevM < 2000) return "#6b5e4a";
  return "#4a463f";
}

/**
 * Discrete meter-band fill colors keyed on `depare.drval1` (upper band
 * edge in metres — 5 = 0-5 m, 10 = 5-10 m, …; the self-tiled ocean
 * pipeline writes the same convention the style expects).
 * MapLibre step: output0 when value < stop1, then each stop’s color until the next.
 */
export function oceanFillColorExpression(): ExpressionSpecification {
  const b = OCEAN_BREAKS_M;
  return [
    "step",
    ["get", "drval1"],
    oceanBandColor(5),
    b[0],
    oceanBandColor(b[1]),
    b[1],
    oceanBandColor(b[2]),
    b[2],
    oceanBandColor(b[3]),
    b[3],
    oceanBandColor(b[4]),
    b[4],
    oceanBandColor(b[5]),
    b[5],
    oceanBandColor(b[6]),
    b[6],
    oceanBandColor(b[7]),
    b[7],
    oceanBandColor(b[7]),
  ];
}
