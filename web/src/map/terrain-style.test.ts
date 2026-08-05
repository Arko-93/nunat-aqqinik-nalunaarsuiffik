import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { METER_BAND_POLICY, OCEAN_BREAKS_M } from "./meter-bands.ts";
import {
  assertOceanUnderLand,
  composeTerrainStyle,
  contourBreakFilter,
  oceanInsertBeforeId,
  TERRAIN_LAYER_IDS,
} from "./terrain-style.ts";

const libertyStub = {
  version: 8,
  sources: {
    openmaptiles: { type: "vector", url: "https://example.test/tiles" },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f8f4f0" },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "#9ebdff", "fill-opacity": 1 },
    },
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: { "fill-color": "#d8e8c8", "fill-opacity": 0.6 },
    },
  ],
} as StyleSpecification;

describe("composeTerrainStyle (hybrid D)", () => {
  it("adds land DEM + ocean sources with safety metadata", () => {
    const style = composeTerrainStyle(libertyStub);
    expect(style.sources?.["land-relief"]).toBeTruthy();
    expect(style.sources?.["ocean-depth-dem"]).toBeTruthy();
    expect(style.sources?.["ocean-depth-vector"]).toBeTruthy();
    const meta = style.metadata as Record<string, unknown>;
    expect(meta["nunat:basemap"]).toBe("terrain-first");
    expect(meta["nunat:safety"]).toBe("not-for-navigation");
    expect(meta["nunat:meter-bands"]).toBe(METER_BAND_POLICY.key);
    expect(meta["nunat:land-peaks-only"]).toBe(true);
    expect(meta["nunat:ocean-under-land"]).toBe(true);
    expect(meta["nunat:ocean-breaks-m"]).toEqual([...OCEAN_BREAKS_M]);
  });

  it("keeps ocean hillshade and fills under land", () => {
    const style = composeTerrainStyle(libertyStub);
    const ids = (style.layers ?? []).map((layer) => layer.id);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanHillshade);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanFills);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContours);
    expect(ids).toContain(TERRAIN_LAYER_IDS.landHillshade);
    const check = assertOceanUnderLand(ids);
    expect(check).toEqual({ ok: true });
    expect(ids.indexOf(TERRAIN_LAYER_IDS.oceanFills)).toBeLessThan(
      ids.indexOf("landcover"),
    );
  });

  it("softens basemap water so meter bands read through", () => {
    const style = composeTerrainStyle(libertyStub);
    const water = style.layers?.find((layer) => layer.id === "water");
    expect(
      (water as { paint?: { "fill-opacity"?: number } } | undefined)?.paint?.[
        "fill-opacity"
      ],
    ).toBe(0.28);
  });

  it("filters ocean contours to hybrid D breaks", () => {
    expect(contourBreakFilter(OCEAN_BREAKS_M)).toEqual([
      "in",
      ["get", "depth_m"],
      ["literal", [...OCEAN_BREAKS_M]],
    ]);
  });

  it("inserts ocean before the first land fill", () => {
    expect(oceanInsertBeforeId(libertyStub.layers ?? [])).toBe("landcover");
  });
});
