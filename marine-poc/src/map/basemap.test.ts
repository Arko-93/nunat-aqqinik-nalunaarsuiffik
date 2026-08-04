import { describe, expect, it } from "vitest";
import { composeRealisticMarineStyle } from "./basemap.ts";
import type { StyleSpecification } from "maplibre-gl";

describe("composeRealisticMarineStyle", () => {
  it("adds seascape dem + contours under liberty water", () => {
    const liberty = {
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
      ],
    } as StyleSpecification;

    const style = composeRealisticMarineStyle(liberty);
    expect(style.sources?.["bathymetry-dem"]).toBeTruthy();
    expect(style.sources?.["bathymetry-contours"]).toBeTruthy();
    const ids = (style.layers ?? []).map((layer) => layer.id);
    expect(ids).toContain("nunat-bathymetry-hillshade");
    expect(ids).toContain("nunat-bathymetry-contours");
    expect(ids.indexOf("nunat-bathymetry-hillshade")).toBeLessThan(
      ids.indexOf("water"),
    );
    const water = style.layers?.find((layer) => layer.id === "water");
    expect(
      (water as { paint?: { "fill-opacity"?: number } } | undefined)?.paint?.[
        "fill-opacity"
      ],
    ).toBe(0.35);
  });
});
