import { describe, expect, it } from "vitest";
import type { SymbolLayerSpecification } from "maplibre-gl";
import {
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
} from "../domain/coastal-features.ts";
import {
  allCoastalMarkerLayers,
  coastalInteractiveLayerIds,
  coastalMarkerLayerId,
  coastalTypeFilter,
  markerKindAppearsAtZoom,
  nonCoastalBandFilter,
} from "./gazetteer-markers.ts";

describe("gazetteer marker style seam", () => {
  it("builds distinct layers for each coastal type with issue minzoom", () => {
    const layers = allCoastalMarkerLayers();
    const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));

    const skerry = byId[coastalMarkerLayerId("skerry")] as
      | SymbolLayerSpecification
      | undefined;
    expect(skerry?.type).toBe("symbol");
    expect(skerry?.minzoom).toBe(9.6);
    expect(skerry?.layout?.["text-field"]).toBe(COASTAL_MARKER_GLYPH.skerry);
    expect(skerry?.layout?.["text-allow-overlap"]).toBe(true);

    expect(byId[coastalMarkerLayerId("island")]?.type).toBe("circle");
    expect(byId[coastalMarkerLayerId("island")]?.minzoom).toBe(7.0);

    expect(byId[coastalMarkerLayerId("island_part")]?.type).toBe("circle");
    expect(byId[coastalMarkerLayerId("island_part")]?.minzoom).toBe(9.0);

    const group = byId[coastalMarkerLayerId("island_group")];
    expect(group?.type).toBe("circle");
    expect(group?.minzoom).toBe(5.8);
    expect(JSON.stringify(group?.paint)).toContain('"circle-opacity"');
    expect(JSON.stringify(group?.paint)).toContain("transparent");
  });

  it("keeps markers interactive even when labels collide", () => {
    const ids = coastalInteractiveLayerIds();
    expect(ids).toContain(coastalMarkerLayerId("skerry"));
    expect(ids).toContain("placenames-label-skerry");
    for (const kind of [
      "skerry",
      "island",
      "island_part",
      "island_group",
    ] as const) {
      const marker = allCoastalMarkerLayers().find(
        (layer) => layer.id === coastalMarkerLayerId(kind),
      );
      expect(marker).toBeTruthy();
      if (marker?.type === "symbol") {
        expect(marker.layout?.["text-allow-overlap"]).toBe(true);
      }
    }
  });

  it("filters each coastal layer to one exact typeCode", () => {
    expect(coastalTypeFilter("skerry")).toEqual(["==", ["get", "typeCode"], 143]);
    expect(coastalTypeFilter("island")).toEqual(["==", ["get", "typeCode"], 181]);
    expect(coastalTypeFilter("island_part")).toEqual([
      "==",
      ["get", "typeCode"],
      182,
    ]);
    expect(coastalTypeFilter("island_group")).toEqual([
      "==",
      ["get", "typeCode"],
      183,
    ]);
  });

  it("excludes coastal types from generic band circle filters", () => {
    expect(nonCoastalBandFilter("local")).toEqual([
      "all",
      ["==", ["get", "zoomBand"], "local"],
      ["!", ["in", ["get", "typeCode"], ["literal", [143, 181, 182, 183]]]],
    ]);
  });

  it("reveals each marker kind only at its own threshold", () => {
    expect(markerKindAppearsAtZoom("island_group", 5.7)).toBe(false);
    expect(markerKindAppearsAtZoom("island_group", 5.8)).toBe(true);
    expect(markerKindAppearsAtZoom("island", 6.9)).toBe(false);
    expect(markerKindAppearsAtZoom("island", 7.0)).toBe(true);
    expect(markerKindAppearsAtZoom("island_part", 8.9)).toBe(false);
    expect(markerKindAppearsAtZoom("island_part", 9.0)).toBe(true);
    expect(markerKindAppearsAtZoom("skerry", 9.5)).toBe(false);
    expect(markerKindAppearsAtZoom("skerry", 9.6)).toBe(true);
    expect(COASTAL_MARKER_MIN_ZOOM.skerry).toBeGreaterThan(
      COASTAL_MARKER_MIN_ZOOM.island_part,
    );
  });
});
