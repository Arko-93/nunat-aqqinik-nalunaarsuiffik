/**
 * Hybrid D meter-band policy (wayfinder #9 / issue #10).
 * Ocean: filled depth classes + contour metering under land.
 * Land: peaks-only classes when peak layers exist; hillshade carries relief today.
 */

export const OCEAN_BREAKS_M = [5, 10, 20, 50, 100, 200, 500, 1000] as const;

export const LAND_BREAKS_M = [500, 1000, 2000] as const;

export const METER_BAND_POLICY = {
  key: "D" as const,
  oceanBreaksM: OCEAN_BREAKS_M,
  landBreaksM: LAND_BREAKS_M,
  oceanStyle: "filled-plus-contours-masked" as const,
  /** Product policy for a future peak color-relief layer — not shipped yet. */
  landPeaksOnly: true as const,
};

export function oceanBandColor(depthM: number): string {
  if (depthM <= 10) return "#b9e0f0";
  if (depthM <= 20) return "#7eb8d4";
  if (depthM <= 50) return "#4a8fb8";
  if (depthM <= 100) return "#2f6f94";
  if (depthM <= 200) return "#1d5273";
  if (depthM <= 500) return "#143a54";
  return "#0c2438";
}

export function landPeakBandColor(elevM: number): string {
  if (elevM < 1000) return "#8a7a5c";
  if (elevM < 2000) return "#6b5e4a";
  return "#4a463f";
}

/**
 * Discrete meter-band fill colors keyed on Seascape `drval1` (shallow edge).
 * MapLibre step: output0 when value < stop1, then each stop’s color until the next.
 */
export function oceanFillColorExpression(): unknown[] {
  const expr: unknown[] = ["step", ["get", "drval1"], oceanBandColor(5)];
  for (let i = 0; i < OCEAN_BREAKS_M.length; i++) {
    const stop = OCEAN_BREAKS_M[i]!;
    const next = OCEAN_BREAKS_M[i + 1] ?? stop;
    expr.push(stop, oceanBandColor(next));
  }
  return expr;
}
