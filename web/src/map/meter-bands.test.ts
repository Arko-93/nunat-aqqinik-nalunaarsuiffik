import { describe, expect, it } from "vitest";
import {
  OCEAN_CONTOUR_INDEX_M,
  OCEAN_CONTOUR_INTERMEDIATE_M,
  OCEAN_CONTOUR_SHALLOW_M,
  oceanContourLineColor,
  oceanContourLineOpacity,
  oceanContourLineWidthPx,
  oceanContourLabelRank,
} from "./meter-bands.ts";

describe("marine-chart ocean contour hierarchy", () => {
  it("ranks index thicker and darker than intermediate and shallow", () => {
    // Index (200/500/1000) carry the chart structure; shallow stay light.
    for (const index of OCEAN_CONTOUR_INDEX_M) {
      for (const mid of OCEAN_CONTOUR_INTERMEDIATE_M) {
        expect(oceanContourLineWidthPx(index)).toBeGreaterThan(
          oceanContourLineWidthPx(mid),
        );
      }
      for (const shallow of OCEAN_CONTOUR_SHALLOW_M) {
        expect(oceanContourLineWidthPx(index)).toBeGreaterThan(
          oceanContourLineWidthPx(shallow),
        );
        expect(oceanContourLineOpacity(index)).toBeGreaterThan(
          oceanContourLineOpacity(shallow),
        );
      }
    }
    expect(oceanContourLineWidthPx(100)).toBeGreaterThan(
      oceanContourLineWidthPx(20),
    );
    // Quiet secondary signal — index stays under bold chart weights.
    expect(oceanContourLineWidthPx(500)).toBeLessThan(1.6);
    expect(oceanContourLineOpacity(200)).toBeLessThan(0.5);
  });

  it("labels index freely, mid sparingly, shallow only at close zoom", () => {
    expect(oceanContourLabelRank(200)).toBe("index");
    expect(oceanContourLabelRank(100)).toBe("intermediate");
    expect(oceanContourLabelRank(5)).toBe("shallow");
  });
});
