import { useEffect, useRef } from "react";
import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { disclosureMinZoom } from "../domain/disclosure.ts";
import type { ZoomBand } from "../domain/importance.ts";
import type { Placename } from "../domain/placename.ts";
import {
  allCoastalMarkerLayers,
  allSelectedCoastalMarkerLayers,
  bandCircleLayerId,
  bandLabelLayerId,
  coastalInteractiveLayerIds,
  nonCoastalBandFilter,
  PLACENAMES_SOURCE_ID,
  SELECTED_SOURCE_ID,
  selectedCoastalInteractiveLayerIds,
  selectedNonCoastalDotLayer,
} from "../map/gazetteer-markers.ts";
import { loadTerrainStyle } from "../map/terrain-style.ts";
import { placenameFromMapFeature } from "./map-selection.ts";

const SOURCE_ID = PLACENAMES_SOURCE_ID;
const ADMIN_SOURCE_ID = "administrative-areas";
const ADMIN_LINE_ID = "administrative-areas-outline";
const SELECTED_HALO_ID = "placenames-selected-halo";
const SELECTED_RING_ID = "placenames-selected-ring";
const SELECTED_DOT_ID = "placenames-selected-dot";
const SELECTED_LABEL_ID = "placenames-selected-label";

const EMPTY_POINTS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** Geography first; settlements next; towns last so official By labels stay on top. */
const BANDS: ReadonlyArray<ZoomBand> = [
  "detail",
  "local",
  "regional",
  "major",
  "settlement",
  "town",
];

type Props = {
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, Placename> | null;
  selectedId: number | null;
  onSelect: (place: Placename) => void;
};

/** Admin outlines only — no fills so terrain stays visible. */
function addAdministrativeLayers(map: Map) {
  map.addSource(ADMIN_SOURCE_ID, {
    type: "geojson",
    promoteId: "municipalityCode",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: ADMIN_LINE_ID,
    type: "line",
    source: ADMIN_SOURCE_ID,
    paint: {
      "line-color": [
        "match",
        ["get", "kind"],
        "national_park",
        "#6a7a72",
        "#1c465a",
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2.5,
        0.7,
        5,
        1.15,
        8,
        1.6,
      ],
      "line-opacity": [
        "match",
        ["get", "kind"],
        "national_park",
        0.55,
        0.7,
      ],
    },
  });
}

function sourceReady(map: Map): boolean {
  return Boolean(map.isStyleLoaded() && map.getSource(SOURCE_ID));
}

function whenSourceReady(map: Map, run: () => void): () => void {
  if (sourceReady(map)) {
    run();
    return () => {};
  }

  const tryRun = () => {
    if (!sourceReady(map)) return;
    map.off("load", tryRun);
    map.off("styledata", tryRun);
    run();
  };

  map.on("load", tryRun);
  map.on("styledata", tryRun);
  return () => {
    map.off("load", tryRun);
    map.off("styledata", tryRun);
  };
}

function addBandLayers(map: Map, band: ZoomBand, minzoom: number) {
  const filter = nonCoastalBandFilter(band);

  map.addLayer({
    id: bandCircleLayerId(band),
    type: "circle",
    source: SOURCE_ID,
    minzoom,
    filter,
    paint: {
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        [
          "match",
          ["get", "featureKind"],
          "town",
          6.5,
          "settlement",
          5.5,
          3.0,
        ],
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        [
          "match",
          ["get", "featureKind"],
          "other",
          0.7,
          1.4,
        ],
      ],
      "circle-color": [
        "match",
        ["get", "featureKind"],
        "town",
        "#c45c26",
        "settlement",
        "#f0c27a",
        [
          "interpolate",
          ["linear"],
          ["get", "importance"],
          180,
          "#8eb9c6",
          700,
          "#d9e7ee",
        ],
      ],
      "circle-opacity": [
        "case",
        ["boolean", ["feature-state", "inactive"], false],
        0.42,
        [
          "match",
          ["get", "featureKind"],
          "town",
          1,
          "settlement",
          0.95,
          0.78,
        ],
      ],
      "circle-stroke-color": "#102029",
    },
  });

  map.addLayer({
    id: bandLabelLayerId(band),
    type: "symbol",
    source: SOURCE_ID,
    minzoom,
    filter,
    layout: {
      "text-field": ["get", "officialName"],
      "text-font": ["Noto Sans Regular"],
      "text-size": [
        "match",
        ["get", "featureKind"],
        "town",
        13,
        "settlement",
        12,
        [
          "interpolate",
          ["linear"],
          ["get", "importance"],
          180,
          10.5,
          800,
          12,
        ],
      ],
      "text-variable-anchor": [
        "top",
        "bottom",
        "right",
        "left",
        "top-right",
        "top-left",
        "bottom-right",
        "bottom-left",
      ],
      "text-radial-offset": band === "town" ? 0.95 : 0.85,
      "text-optional": true,
      "text-padding": band === "town" ? 8 : 10,
      "text-max-width": 8,
      "symbol-sort-key": ["get", "importance"],
      "text-allow-overlap": false,
      "text-ignore-placement": false,
      "icon-allow-overlap": false,
    },
    paint: {
      "text-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "rgba(244, 247, 248, 0)",
        "#f4f7f8",
      ],
      "text-halo-color": "#0d2a38",
      "text-halo-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        1.45,
      ],
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0,
        ["boolean", ["feature-state", "inactive"], false],
        0.48,
        band === "town" ? 1 : 0.92,
      ],
    },
  });
}

function addCoastalLayers(map: Map) {
  for (const layer of allCoastalMarkerLayers()) {
    map.addLayer(layer);
  }
}

function addSelectedLayers(map: Map) {
  map.addLayer({
    id: SELECTED_HALO_ID,
    type: "circle",
    source: SELECTED_SOURCE_ID,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        14,
        8,
        22,
        12,
        28,
      ],
      "circle-color": "#f0c27a",
      "circle-opacity": 0.28,
      "circle-blur": 0.55,
    },
  });

  map.addLayer({
    id: SELECTED_RING_ID,
    type: "circle",
    source: SELECTED_SOURCE_ID,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        9,
        8,
        12,
        12,
        14,
      ],
      "circle-color": "transparent",
      "circle-opacity": 1,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#f4f7f8",
      "circle-stroke-opacity": 0.95,
    },
  });

  for (const layer of allSelectedCoastalMarkerLayers()) {
    map.addLayer(layer);
  }
  map.addLayer(selectedNonCoastalDotLayer());

  map.addLayer({
    id: SELECTED_LABEL_ID,
    type: "symbol",
    source: SELECTED_SOURCE_ID,
    layout: {
      "text-field": ["get", "officialName"],
      "text-font": ["Noto Sans Bold", "Noto Sans Regular"],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        14,
        8,
        16.5,
        12,
        18,
      ],
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-max-width": 10,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "symbol-sort-key": 0,
    },
    paint: {
      "text-color": "#fff8f0",
      "text-halo-color": "#0d2a38",
      "text-halo-width": 2.4,
      "text-halo-blur": 0.35,
      "text-opacity": 1,
    },
  });
}

function selectedCollection(
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, Placename> | null,
  selectedId: number | null,
): GeoJSON.FeatureCollection {
  if (!collection || selectedId == null) return EMPTY_POINTS;
  const feature = collection.features.find(
    (entry) => entry.properties.recordId === selectedId,
  );
  if (!feature) return EMPTY_POINTS;
  return {
    type: "FeatureCollection",
    features: [feature],
  };
}

export function MapCanvas({ collection, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const collectionRef = useRef(collection);
  const fittedRef = useRef(false);
  const prevSelectedRef = useRef<number | null>(null);
  const inactiveIdsRef = useRef<Set<number>>(new Set());
  onSelectRef.current = onSelect;
  collectionRef.current = collection;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0c2430" },
          },
        ],
      },
      center: [-42.5, 69.2],
      zoom: 3.4,
      maxPitch: 0,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const ensureLayers = () => {
      if (map.getSource(SOURCE_ID)) return;

      addAdministrativeLayers(map);

      map.addSource(SOURCE_ID, {
        type: "geojson",
        promoteId: "recordId",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addSource(SELECTED_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_POINTS,
      });

      const mins = disclosureMinZoom("geography");
      // Coastal markers first (under locality labels), then band layers, then selection.
      addCoastalLayers(map);
      for (const band of BANDS) {
        addBandLayers(map, band, mins[band]);
      }

      addSelectedLayers(map);
    };

    const bindInteractions = () => {
      const selectFromEvent = (
        event: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => {
        const place = placenameFromMapFeature(
          event.features?.[0]?.properties ?? null,
        );
        if (!place) return;
        onSelectRef.current(place);
      };

      const bindPointer = (layerId: string) => {
        map.on("click", layerId, selectFromEvent);
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      };

      for (const band of BANDS) {
        bindPointer(bandCircleLayerId(band));
        bindPointer(bandLabelLayerId(band));
      }
      for (const layerId of coastalInteractiveLayerIds()) {
        bindPointer(layerId);
      }

      bindPointer(SELECTED_DOT_ID);
      for (const layerId of selectedCoastalInteractiveLayerIds()) {
        bindPointer(layerId);
      }
      bindPointer(SELECTED_RING_ID);
      bindPointer(SELECTED_LABEL_ID);
    };

    void loadTerrainStyle()
      .then((style) => {
        if (cancelled) return;
        map.setStyle(style);
        map.once("style.load", () => {
          ensureLayers();
          bindInteractions();
          void fetch("/data/administrative-areas.geojson")
            .then(async (response) => {
              if (!response.ok) return null;
              return response.json() as Promise<GeoJSON.FeatureCollection>;
            })
            .then((admin) => {
              if (!admin || !map.getSource(ADMIN_SOURCE_ID)) return;
              const source = map.getSource(ADMIN_SOURCE_ID) as GeoJSONSource;
              source.setData(admin);
            })
            .catch(() => {
              /* basemap still usable without admin outlines */
            });
          const data = collectionRef.current;
          if (data) {
            const source = map.getSource(SOURCE_ID) as GeoJSONSource;
            source.setData(data);
            if (!fittedRef.current && data.features.length > 0) {
              const bounds = new maplibregl.LngLatBounds();
              for (const feature of data.features) {
                if (feature.properties?.isLocality) {
                  bounds.extend(
                    feature.geometry.coordinates as [number, number],
                  );
                }
              }
              if (!bounds.isEmpty()) {
                map.fitBounds(bounds, {
                  padding: 72,
                  maxZoom: 5.2,
                  duration: 0,
                });
                fittedRef.current = true;
              }
            }
          }
        });
      })
      .catch(() => {
        // Fallback: Liberty alone if terrain compose fails — still usable.
        map.setStyle("https://tiles.openfreemap.org/styles/liberty");
        map.once("style.load", () => {
          ensureLayers();
          bindInteractions();
        });
      });

    mapRef.current = map;
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !collection) return;

    return whenSourceReady(map, () => {
      if (!sourceReady(map)) return;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      source.setData(collection);
      if (fittedRef.current || collection.features.length === 0) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of collection.features) {
        if (feature.properties?.isLocality) {
          bounds.extend(feature.geometry.coordinates as [number, number]);
        }
      }
      if (bounds.isEmpty()) {
        for (const feature of collection.features) {
          bounds.extend(feature.geometry.coordinates as [number, number]);
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 72, maxZoom: 5.2, duration: 0 });
        fittedRef.current = true;
      }
    });
  }, [collection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !collection) return;

    return whenSourceReady(map, () => {
      if (!sourceReady(map)) return;
      if (!map.getSource(SELECTED_SOURCE_ID)) return;

      const clearId = (id: number) => {
        map.setFeatureState(
          { source: SOURCE_ID, id },
          { selected: false, inactive: false },
        );
      };
      if (prevSelectedRef.current != null) clearId(prevSelectedRef.current);
      for (const id of inactiveIdsRef.current) clearId(id);
      inactiveIdsRef.current.clear();

      if (selectedId != null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: selectedId },
          { selected: true, inactive: false },
        );
        if (collection.features.length <= 400) {
          for (const feature of collection.features) {
            const id = feature.properties.recordId;
            if (id === selectedId) continue;
            map.setFeatureState(
              { source: SOURCE_ID, id },
              { selected: false, inactive: true },
            );
            inactiveIdsRef.current.add(id);
          }
        }
      }
      prevSelectedRef.current = selectedId;

      const selectedSource = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource;
      selectedSource.setData(selectedCollection(collection, selectedId));

      if (selectedId == null) return;
      const selected = collection.features.find(
        (feature) => feature.properties.recordId === selectedId,
      );
      if (!selected) return;
      const center = selected.geometry.coordinates as [number, number];
      const targetZoom = Math.max(
        map.getZoom(),
        selected.properties.minZoom + 1.2,
        selected.properties.isLocality ? 6.2 : 7.4,
      );
      map.easeTo({
        center,
        zoom: targetZoom,
        duration: 280,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    });
  }, [collection, selectedId]);

  return <div className="map-root" ref={containerRef} />;
}
