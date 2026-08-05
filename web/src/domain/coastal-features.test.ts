import { describe, expect, it } from "vitest";
import {
  COASTAL_KINDS,
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
  COASTAL_REGISTRY,
  COASTAL_TYPE,
  coastalMarkerKind,
  coastalMarkerMinZoomForType,
  coastalMetaForType,
  coastalTypeExemptFromLocalityShadow,
  isCoastalGazetteerType,
} from "./coastal-features.ts";
import { rankForType, typeLabel } from "./importance.ts";

describe("coastal gazetteer registry (NunaGIS)", () => {
  it("owns codes, zooms, markers, and register labels in one registry", () => {
    expect(COASTAL_TYPE.skerry).toBe(143);
    expect(COASTAL_TYPE.island).toBe(181);
    expect(COASTAL_TYPE.islandPart).toBe(182);
    expect(COASTAL_TYPE.islandGroup).toBe(183);

    expect(COASTAL_REGISTRY.skerry.markerShape).toBe("cross");
    expect(COASTAL_REGISTRY.island.markerShape).toBe("circle");
    expect(COASTAL_REGISTRY.island_part.markerShape).toBe("dot");
    expect(COASTAL_REGISTRY.island_group.markerShape).toBe("ring");

    expect(COASTAL_REGISTRY.skerry.glyph).toBe("×");
    expect(COASTAL_REGISTRY.skerry.registerLabelDa).toBe("Skær");
    expect(COASTAL_REGISTRY.skerry.typeLabelKey).toBe("typeLabelSkerry");

    for (const kind of COASTAL_KINDS) {
      const meta = COASTAL_REGISTRY[kind];
      expect(coastalMetaForType(meta.typeCode)).toEqual(meta);
      expect(coastalMarkerKind(meta.typeCode)).toBe(kind);
      expect(COASTAL_MARKER_MIN_ZOOM[kind]).toBe(meta.minZoom);
      expect(COASTAL_MARKER_GLYPH[kind]).toBe(meta.glyph);
      expect(typeLabel(meta.typeCode)).toBe(meta.registerLabelDa);
      expect(rankForType(meta.typeCode)).toEqual({
        importance: meta.importance,
        minZoom: meta.minZoom,
      });
    }
  });

  it("gates markers at issue thresholds", () => {
    expect(coastalMarkerMinZoomForType(143)).toBe(9.6);
    expect(coastalMarkerMinZoomForType(181)).toBe(7.0);
    expect(coastalMarkerMinZoomForType(182)).toBe(9.0);
    expect(coastalMarkerMinZoomForType(183)).toBe(5.8);
  });

  it("exempts all four types from automatic locality-shadow", () => {
    for (const code of [143, 181, 182, 183]) {
      expect(isCoastalGazetteerType(code)).toBe(true);
      expect(coastalTypeExemptFromLocalityShadow(code)).toBe(true);
    }
    expect(coastalTypeExemptFromLocalityShadow(57)).toBe(false);
  });
});
