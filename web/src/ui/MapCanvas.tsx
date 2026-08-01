import { useEffect, useRef } from "react";
import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BAND_MIN_ZOOM, type ZoomBand } from "../domain/importance.ts";
import type { Placename } from "../domain/placename.ts";

const SOURCE_ID = "placenames";
const SELECTED_SOURCE_ID = "placenames-selected";
const REACH_SOURCE_ID = "reachability";
const REACH_LAYER_ID = "reachability-line";
const SELECTED_HALO_ID = "placenames-selected-halo";
const SELECTED_RING_ID = "placenames-selected-ring";
const SELECTED_DOT_ID = "placenames-selected-dot";
const SELECTED_LABEL_ID = "placenames-selected-label";

const EMPTY_POINTS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BANDS: ReadonlyArray<ZoomBand> = [
  "locality",
  "major",
  "regional",
  "local",
  "detail",
];

const circleLayerId = (band: ZoomBand) => `placenames-circle-${band}`;
const labelLayerId = (band: ZoomBand) => `placenames-label-${band}`;

type Props = {
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, Placename> | null;
  reachabilityLines: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  selectedId: number | null;
  onSelect: (place: Placename) => void;
};

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

function parsePlacename(props: GeoJSON.GeoJsonProperties): Placename | null {
  if (!props) return null;
  const isLocality =
    props.isLocality === true ||
    props.isLocality === "true" ||
    props.isLocality === 1;
  return {
    ...(props as Placename),
    isLocality,
    isLocalityShadow:
      props.isLocalityShadow === true ||
      props.isLocalityShadow === "true" ||
      props.isLocalityShadow === 1,
    typeCode: Number(props.typeCode),
    recordId: Number(props.recordId),
    importance: Number(props.importance),
    minZoom: Number(props.minZoom),
    longitude: Number(props.longitude),
    latitude: Number(props.latitude),
    typeLabel: String(props.typeLabel ?? ""),
    zoomBand: props.zoomBand as Placename["zoomBand"],
    municipalityCode:
      props.municipalityCode == null || props.municipalityCode === ""
        ? null
        : Number(props.municipalityCode),
    danishName:
      props.danishName == null || props.danishName === ""
        ? null
        : String(props.danishName),
    oldOfficialName:
      props.oldOfficialName == null || props.oldOfficialName === ""
        ? null
        : String(props.oldOfficialName),
    municipalityName:
      props.municipalityName == null || props.municipalityName === ""
        ? null
        : String(props.municipalityName),
    localityCode:
      props.localityCode == null || props.localityCode === ""
        ? null
        : String(props.localityCode),
  };
}

function addBandLayers(map: Map, band: ZoomBand) {
  const minzoom = BAND_MIN_ZOOM[band];
  const filter: maplibregl.FilterSpecification = [
    "==",
    ["get", "zoomBand"],
    band,
  ];

  map.addLayer({
    id: circleLayerId(band),
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
          ["interpolate", ["linear"], ["zoom"], minzoom, 2.2, minzoom + 3, 3.6],
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
    id: labelLayerId(band),
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
        13.5,
        "settlement",
        12.5,
        [
          "interpolate",
          ["linear"],
          ["get", "importance"],
          180,
          10.5,
          800,
          12.5,
        ],
      ],
      "text-offset": [0, 1.05],
      "text-anchor": "top",
      "text-optional": true,
      "text-padding": band === "locality" ? 2 : 6,
      "text-max-width": 9,
      // Higher importance keeps the label when names collide.
      "symbol-sort-key": ["get", "importance"],
      "text-allow-overlap": false,
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
        [
          "case",
          ["boolean", ["feature-state", "inactive"], false],
          0.48,
          [
            "interpolate",
            ["linear"],
            ["zoom"],
            minzoom,
            band === "locality" ? 1 : 0.55,
            minzoom + 0.8,
            1,
          ],
        ],
      ],
    },
  });
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

  map.addLayer({
    id: SELECTED_DOT_ID,
    type: "circle",
    source: SELECTED_SOURCE_ID,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        6.5,
        8,
        8.5,
        12,
        9.5,
      ],
      "circle-color": "#c45c26",
      "circle-opacity": 1,
      "circle-stroke-width": 1.8,
      "circle-stroke-color": "#0d2a38",
    },
  });

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

export function MapCanvas({
  collection,
  reachabilityLines,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const collectionRef = useRef(collection);
  const reachRef = useRef(reachabilityLines);
  const fittedRef = useRef(false);
  onSelectRef.current = onSelect;
  collectionRef.current = collection;
  reachRef.current = reachabilityLines;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
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

      map.addSource(REACH_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: REACH_LAYER_ID,
        type: "line",
        source: REACH_SOURCE_ID,
        paint: {
          "line-color": "#c45c26",
          "line-width": 2.4,
          "line-opacity": 0.85,
          "line-dasharray": [1.2, 1.4],
        },
      });

      for (const band of BANDS) {
        addBandLayers(map, band);
      }

      // Selected marker/label paint above band layers and reach lines.
      addSelectedLayers(map);
    };

    const bindInteractions = () => {
      const selectFromEvent = (
        event: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => {
        const place = parsePlacename(event.features?.[0]?.properties ?? null);
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
        bindPointer(circleLayerId(band));
        bindPointer(labelLayerId(band));
      }

      bindPointer(SELECTED_DOT_ID);
      bindPointer(SELECTED_RING_ID);
      bindPointer(SELECTED_LABEL_ID);
    };

    map.on("load", () => {
      ensureLayers();
      bindInteractions();
      const data = collectionRef.current;
      if (data) {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.setData(data);
        if (!fittedRef.current && data.features.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          for (const feature of data.features) {
            if (feature.properties?.isLocality) {
              bounds.extend(feature.geometry.coordinates as [number, number]);
            }
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 72, maxZoom: 5.2, duration: 0 });
            fittedRef.current = true;
          }
        }
      }
      const reach = reachRef.current;
      if (reach) {
        const reachSource = map.getSource(REACH_SOURCE_ID) as GeoJSONSource;
        reachSource.setData(reach);
      }
    });

    mapRef.current = map;
    return () => {
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

      const hasSelection = selectedId != null;
      for (const feature of collection.features) {
        const id = feature.properties.recordId;
        const isSelected = id === selectedId;
        map.setFeatureState(
          { source: SOURCE_ID, id },
          {
            selected: isSelected,
            inactive: hasSelection && !isSelected,
          },
        );
      }

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
        selected.properties.isLocality ? 6.2 : 8.5,
      );
      // Occasional camera move — keep under 300ms feel with ease-out punch.
      map.easeTo({
        center,
        zoom: targetZoom,
        duration: 280,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      });
    });
  }, [collection, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !reachabilityLines) return;

    return whenSourceReady(map, () => {
      if (!map.getSource(REACH_SOURCE_ID)) return;
      const source = map.getSource(REACH_SOURCE_ID) as GeoJSONSource;
      source.setData(reachabilityLines);

      if (reachabilityLines.features.length === 0) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of reachabilityLines.features) {
        for (const coord of feature.geometry.coordinates) {
          bounds.extend(coord as [number, number]);
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 96,
          maxZoom: 8.2,
          duration: 320,
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
      }
    });
  }, [reachabilityLines]);

  return <div className="map-root" ref={containerRef} />;
}
