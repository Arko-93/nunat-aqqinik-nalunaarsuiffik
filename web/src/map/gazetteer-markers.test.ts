import { describe, expect, it } from "vitest";
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import {
  COASTAL_KINDS,
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
  COASTAL_REGISTRY,
} from "../domain/coastal-features.ts";
import {
  allCoastalLabelLayers,
  allCoastalMarkerOnlyLayers,
  allSelectedCoastalMarkerLayers,
  bandLabelLayerId,
  coastalInteractiveLayerIds,
  coastalLabelLayerId,
  coastalMarkerLayerId,
  coastalTypeFilter,
  gazetteerLayerAddOrder,
  markerKindAppearsAtZoom,
  nonCoastalBandFilter,
  selectedCoastalMarkerLayerId,
} from "./gazetteer-markers.ts";

function asSymbol(
  layer: CircleLayerSpecification | SymbolLayerSpecification | undefined,
): SymbolLayerSpecification | undefined {
  return layer?.type === "symbol" ? layer : undefined;
}

describe("gazetteer marker style seam", () => {
  it("builds distinct marker layers for each coastal type with issue minzoom", () => {
    const layers = allCoastalMarkerOnlyLayers();
    const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));

    const skerry = asSymbol(byId[coastalMarkerLayerId("skerry")]);
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
    expect(JSON.stringify(group?.paint)).toContain("transparent");
  });

  it("places locality labels before optional coastal labels (no ignore-placement)", () => {
    const order = gazetteerLayerAddOrder();
    const townLabel = bandLabelLayerId("town");
    const settlementLabel = bandLabelLayerId("settlement");
    const coastalLabel = coastalLabelLayerId("skerry");
    expect(order.indexOf(townLabel)).toBeGreaterThan(-1);
    expect(order.indexOf(settlementLabel)).toBeGreaterThan(-1);
    expect(order.indexOf(coastalLabel)).toBeGreaterThan(
      order.indexOf(townLabel),
    );
    expect(order.indexOf(coastalLabel)).toBeGreaterThan(
      order.indexOf(settlementLabel),
    );
    expect(order.indexOf(coastalMarkerLayerId("skerry"))).toBeLessThan(
      order.indexOf(townLabel),
    );

    for (const kind of COASTAL_KINDS) {
      const label = allCoastalLabelLayers().find(
        (layer) => layer.id === coastalLabelLayerId(kind),
      );
      expect(label?.layout?.["text-ignore-placement"]).toBe(false);
      expect(label?.layout?.["text-optional"]).toBe(true);
    }
  });

  it("preserves each coastal marker shape while selected", () => {
    const selected = Object.fromEntries(
      allSelectedCoastalMarkerLayers().map((layer) => [layer.id, layer]),
    );
    const skerry = asSymbol(selected[selectedCoastalMarkerLayerId("skerry")]);
    expect(skerry?.type).toBe("symbol");
    expect(skerry?.layout?.["text-field"]).toBe("×");

    expect(selected[selectedCoastalMarkerLayerId("island")]?.type).toBe(
      "circle",
    );
    expect(
      JSON.stringify(selected[selectedCoastalMarkerLayerId("island")]?.paint),
    ).toContain("#c45c26");

    expect(selected[selectedCoastalMarkerLayerId("island_part")]?.type).toBe(
      "circle",
    );
    expect(
      JSON.stringify(
        selected[selectedCoastalMarkerLayerId("island_part")]?.paint,
      ),
    ).toContain("#c4a882");

    const groupPaint = JSON.stringify(
      selected[selectedCoastalMarkerLayerId("island_group")]?.paint,
    );
    expect(groupPaint).toContain("transparent");
    expect(selected[selectedCoastalMarkerLayerId("island_group")]?.type).toBe(
      "circle",
    );
  });

  it("keeps markers interactive even when labels collide", () => {
    const ids = coastalInteractiveLayerIds();
    expect(ids).toContain(coastalMarkerLayerId("skerry"));
    expect(ids).toContain(coastalLabelLayerId("skerry"));
    for (const kind of COASTAL_KINDS) {
      const marker = allCoastalMarkerOnlyLayers().find(
        (layer) => layer.id === coastalMarkerLayerId(kind),
      );
      expect(marker).toBeTruthy();
      if (marker?.type === "symbol") {
        expect(marker.layout?.["text-allow-overlap"]).toBe(true);
      }
    }
  });

  it("filters each coastal layer to one exact typeCode from the registry", () => {
    for (const kind of COASTAL_KINDS) {
      expect(coastalTypeFilter(kind)).toEqual([
        "==",
        ["get", "typeCode"],
        COASTAL_REGISTRY[kind].typeCode,
      ]);
    }
  });

  it("excludes coastal types from generic band circle filters", () => {
    expect(nonCoastalBandFilter("local")).toEqual([
      "all",
      ["==", ["get", "zoomBand"], "local"],
      ["!", ["in", ["get", "typeCode"], ["literal", [183, 181, 182, 143]]]],
    ]);
  });

  it("reveals each marker kind only at its own threshold", () => {
    expect(markerKindAppearsAtZoom("island_group", 5.7)).toBe(false);
    expect(markerKindAppearsAtZoom("island_group", 5.8)).toBe(true);
    expect(markerKindAppearsAtZoom("skerry", 9.5)).toBe(false);
    expect(markerKindAppearsAtZoom("skerry", 9.6)).toBe(true);
    expect(COASTAL_MARKER_MIN_ZOOM.skerry).toBeGreaterThan(
      COASTAL_MARKER_MIN_ZOOM.island_part,
    );
  });
});
