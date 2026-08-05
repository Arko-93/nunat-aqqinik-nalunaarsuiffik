import { describe, expect, it } from "vitest";
import type { SymbolLayerSpecification } from "maplibre-gl";
import {
  COASTAL_KINDS,
  COASTAL_MARKER_GLYPH,
  COASTAL_MARKER_MIN_ZOOM,
  COASTAL_REGISTRY,
} from "../domain/coastal-features.ts";
import {
  allCoastalMarkerLayers,
  allSelectedCoastalMarkerLayers,
  coastalInteractiveLayerIds,
  coastalMarkerLayerId,
  coastalTypeFilter,
  markerKindAppearsAtZoom,
  nonCoastalBandFilter,
  selectedCoastalMarkerLayerId,
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
    expect(JSON.stringify(group?.paint)).toContain("transparent");
  });

  it("keeps coastal labels from stealing town/settlement placement", () => {
    for (const kind of COASTAL_KINDS) {
      const label = allCoastalMarkerLayers().find(
        (layer) => layer.id === `placenames-label-${kind}`,
      ) as SymbolLayerSpecification | undefined;
      expect(label?.layout?.["text-ignore-placement"]).toBe(true);
      expect(label?.layout?.["text-optional"]).toBe(true);
    }
  });

  it("preserves each coastal marker shape while selected", () => {
    const selected = Object.fromEntries(
      allSelectedCoastalMarkerLayers().map((layer) => [layer.id, layer]),
    );
    expect(selected[selectedCoastalMarkerLayerId("skerry")]?.type).toBe(
      "symbol",
    );
    expect(
      (selected[selectedCoastalMarkerLayerId("skerry")] as SymbolLayerSpecification)
        .layout?.["text-field"],
    ).toBe("×");

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
    expect(ids).toContain("placenames-label-skerry");
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
