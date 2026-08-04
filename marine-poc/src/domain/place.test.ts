import { describe, expect, it } from "vitest";
import {
  corridorPlaceFromFeature,
  filterPlaceCollection,
  placeMatchesScope,
} from "./place.ts";

const feature = (
  name: string,
  isLocality: boolean,
): GeoJSON.Feature<GeoJSON.Point> => ({
  type: "Feature",
  properties: {
    globalId: name,
    officialName: name,
    isLocality,
    featureKind: isLocality ? "town" : "other",
    typeLabel: isLocality ? "By" : "Ø",
  },
  geometry: { type: "Point", coordinates: [-52.1, 70.7] },
});

describe("place scope", () => {
  it("parses corridor place features", () => {
    const place = corridorPlaceFromFeature(feature("Uummannaq", true));
    expect(place?.officialName).toBe("Uummannaq");
    expect(place?.isLocality).toBe(true);
  });

  it("filters localities vs geography", () => {
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [feature("Uummannaq", true), feature("Torsukattak", false)],
    };
    expect(filterPlaceCollection(collection, "localities").features).toHaveLength(
      1,
    );
    expect(filterPlaceCollection(collection, "geography").features).toHaveLength(
      1,
    );
    expect(filterPlaceCollection(collection, "all").features).toHaveLength(2);
    expect(
      placeMatchesScope(corridorPlaceFromFeature(feature("Qaarsut", true))!, "localities"),
    ).toBe(true);
  });
});
