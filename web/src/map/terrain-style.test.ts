import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import {
  METER_BAND_POLICY,
  OCEAN_BREAKS_M,
  oceanFillColorExpression,
} from "./meter-bands.ts";
import {
  assertOceanUnderLand,
  composeTerrainStyle,
  contourBreakFilter,
  oceanFillFilter,
  oceanInsertBeforeId,
  parseLibertyStyle,
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
    expect(meta["nunat:land-peak-bands"]).toBe("deferred");
    expect(meta["nunat:land-peaks-only"]).toBeUndefined();
    expect(meta["nunat:ocean-under-land"]).toBe(true);
    expect(JSON.stringify(style.layers)).not.toContain("peak-bands");
    expect(meta["nunat:contour-field"]).toBe("depth_abs_m");
    expect(meta["nunat:ocean-fill"]).toBe("discrete-step-drval1-metric");
    expect(meta["nunat:ocean-breaks-m"]).toEqual([...OCEAN_BREAKS_M]);
  });

  it("keeps ocean hillshade and fills under land", () => {
    const style = composeTerrainStyle(libertyStub);
    const ids = (style.layers ?? []).map((layer) => layer.id);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanHillshade);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanFills);
    expect(ids).toContain(TERRAIN_LAYER_IDS.oceanContours);
    expect(ids).toContain(TERRAIN_LAYER_IDS.landHillshade);
    expect(assertOceanUnderLand(ids)).toEqual({ ok: true });
    expect(ids.indexOf(TERRAIN_LAYER_IDS.oceanFills)).toBeLessThan(
      ids.indexOf("landcover"),
    );
  });

  it("filters contours on depth_abs_m (not signed depth_m)", () => {
    expect(contourBreakFilter(OCEAN_BREAKS_M)).toEqual([
      "all",
      ["in", ["get", "depth_abs_m"], ["literal", [...OCEAN_BREAKS_M]]],
      ["any", ["!", ["has", "sys"]], ["!=", ["get", "sys"], "ft"]],
    ]);
    const style = composeTerrainStyle(libertyStub);
    const labels = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanContourLabels,
    ) as { layout?: { "text-field"?: unknown } } | undefined;
    expect(JSON.stringify(labels?.layout?.["text-field"])).toContain(
      "depth_abs_m",
    );
    expect(JSON.stringify(labels?.layout?.["text-field"])).not.toContain(
      '"depth_m"',
    );
  });

  it("uses discrete metric-only fill bands on drval1", () => {
    const fillExpr = oceanFillColorExpression();
    expect(fillExpr[0]).toBe("step");
    expect(fillExpr[1]).toEqual(["get", "drval1"]);
    expect(fillExpr).not.toContain("interpolate");

    const style = composeTerrainStyle(libertyStub);
    const fills = style.layers?.find(
      (layer) => layer.id === TERRAIN_LAYER_IDS.oceanFills,
    ) as {
      filter?: unknown;
      paint?: { "fill-color"?: unknown };
    };
    expect(fills?.filter).toEqual(oceanFillFilter());
    expect(fills?.paint?.["fill-color"]).toEqual(fillExpr);
    expect(oceanFillFilter()).toEqual([
      "all",
      ["has", "drval1"],
      [">=", ["get", "drval1"], 0],
      ["any", ["!", ["has", "sys"]], ["==", ["get", "sys"], "m"]],
    ]);
  });

  it("validates remote style JSON at the load seam", () => {
    expect(() => parseLibertyStyle({ version: 7, sources: {}, layers: [] })).toThrow(
      /version must be 8/,
    );
    expect(() => parseLibertyStyle({ version: 8, sources: {} })).toThrow(
      /layers/,
    );
    expect(parseLibertyStyle(libertyStub).version).toBe(8);
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

  it("inserts ocean before the first land fill", () => {
    expect(oceanInsertBeforeId(libertyStub.layers ?? [])).toBe("landcover");
  });
});
