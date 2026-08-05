/**
 * PROTOTYPE — meter band break schemes for wayfinder #9.
 * Throwaway. Do not ship. Question: which class breaks for v1?
 */

export type BandVariant = {
  key: "A" | "B" | "C" | "D";
  name: string;
  blurb: string;
  /** Ocean depth breaks in meters (positive = deeper). Contours drawn at these. */
  oceanBreaksM: number[];
  /** Land elevation breaks in meters (positive = taller). Legend / future color-relief. */
  landBreaksM: number[];
  /** How ocean bands render on the map. */
  oceanStyle: "filled-bands" | "contours-only" | "sparse-hybrid" | "filled-plus-contours-masked";
  /** If true, land meter bands apply only to high peaks (not full land wash). */
  landPeaksOnly: boolean;
};

export const VARIANTS: BandVariant[] = [
  {
    key: "A",
    name: "Nearshore dense",
    blurb:
      "Many shallow breaks for hunting/sailing near shore (−5…−100), then shelf steps. Filled depth bands.",
    oceanBreaksM: [5, 10, 20, 50, 100, 200, 500, 1000],
    landBreaksM: [0, 100, 300, 600, 1000, 2000],
    oceanStyle: "filled-bands",
    landPeaksOnly: false,
  },
  {
    key: "B",
    name: "Classic shelf",
    blurb:
      "Fewer, chart-familiar steps (−20/−50/−100/−200/−500/−1000). Contour lines + labels only.",
    oceanBreaksM: [20, 50, 100, 200, 500, 1000],
    landBreaksM: [0, 200, 500, 1000, 2000],
    oceanStyle: "contours-only",
    landPeaksOnly: false,
  },
  {
    key: "C",
    name: "Sparse readable",
    blurb:
      "Only three ocean steps (−50/−200/−500) so the land/sea shape stays quiet. Hillshade leads.",
    oceanBreaksM: [50, 200, 500],
    landBreaksM: [0, 500, 1500],
    oceanStyle: "sparse-hybrid",
    landPeaksOnly: false,
  },
  {
    key: "D",
    name: "Hybrid (chosen direction)",
    blurb:
      "A’s dense ocean fills + contour metering; ocean layers stay under land so islands are not drowned; land meter bands only on high peaks (≥500 / 1000 / 2000 m).",
    oceanBreaksM: [5, 10, 20, 50, 100, 200, 500, 1000],
    landBreaksM: [500, 1000, 2000],
    oceanStyle: "filled-plus-contours-masked",
    landPeaksOnly: true,
  },
];

export function oceanBandColor(depthM: number): string {
  // Shallow → deep cyan→navy (context only, not a chart palette claim).
  if (depthM <= 10) return "#b9e0f0";
  if (depthM <= 20) return "#7eb8d4";
  if (depthM <= 50) return "#4a8fb8";
  if (depthM <= 100) return "#2f6f94";
  if (depthM <= 200) return "#1d5273";
  if (depthM <= 500) return "#143a54";
  return "#0c2438";
}

export function landBandColor(elevM: number): string {
  if (elevM <= 0) return "#d8c9a8";
  if (elevM <= 100) return "#c4b48a";
  if (elevM <= 300) return "#a8966e";
  if (elevM <= 500) return "#8a7a5c";
  if (elevM <= 600) return "#7a6b52";
  if (elevM <= 1000) return "#6b5e4a";
  if (elevM <= 1500) return "#5c5348";
  return "#4a463f";
}
