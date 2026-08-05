import { describe, expect, it } from "vitest";
import {
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
  COASTAL_TYPE,
  coastalMarkerKind,
  coastalMarkerMinZoomForType,
  coastalTypeExemptFromLocalityShadow,
  isCoastalGazetteerType,
} from "./coastal-features.ts";
import { rankForType } from "./importance.ts";

describe("coastal gazetteer types (NunaGIS)", () => {
  it("keeps the four source type codes distinct", () => {
    expect(COASTAL_TYPE.skerry).toBe(143);
    expect(COASTAL_TYPE.island).toBe(181);
    expect(COASTAL_TYPE.islandPart).toBe(182);
    expect(COASTAL_TYPE.islandGroup).toBe(183);
    expect(coastalMarkerKind(143)).toBe("skerry");
    expect(coastalMarkerKind(181)).toBe("island");
    expect(coastalMarkerKind(182)).toBe("island_part");
    expect(coastalMarkerKind(183)).toBe("island_group");
    expect(coastalMarkerKind(21)).toBeNull();
  });

  it("gates markers at issue thresholds, independent of label collision", () => {
    expect(COASTAL_MARKER_MIN_ZOOM.island_group).toBe(5.8);
    expect(COASTAL_MARKER_MIN_ZOOM.island).toBe(7.0);
    expect(COASTAL_MARKER_MIN_ZOOM.island_part).toBe(9.0);
    expect(COASTAL_MARKER_MIN_ZOOM.skerry).toBe(9.6);
    expect(coastalMarkerMinZoomForType(143)).toBe(9.6);
    expect(coastalMarkerMinZoomForType(181)).toBe(7.0);
    expect(coastalMarkerMinZoomForType(182)).toBe(9.0);
    expect(coastalMarkerMinZoomForType(183)).toBe(5.8);
    expect(rankForType(143).minZoom).toBe(9.6);
    expect(rankForType(181).minZoom).toBe(7.0);
    expect(rankForType(182).minZoom).toBe(9.0);
    expect(rankForType(183).minZoom).toBe(5.8);
  });

  it("uses × for skerry and distinct glyphs for the other three", () => {
    expect(COASTAL_MARKER_GLYPH.skerry).toBe("×");
    expect(COASTAL_MARKER_GLYPH.island).toBe("○");
    expect(COASTAL_MARKER_GLYPH.island_part).toBe("·");
    expect(COASTAL_MARKER_GLYPH.island_group).toBe("◎");
  });

  it("exempts all four types from automatic locality-shadow", () => {
    for (const code of [143, 181, 182, 183]) {
      expect(isCoastalGazetteerType(code)).toBe(true);
      expect(coastalTypeExemptFromLocalityShadow(code)).toBe(true);
    }
    expect(coastalTypeExemptFromLocalityShadow(57)).toBe(false);
  });
});
