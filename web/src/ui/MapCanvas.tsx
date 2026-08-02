import { useEffect, useRef } from "react";
import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { disclosureMinZoom } from "../domain/disclosure.ts";
import type { ZoomBand } from "../domain/importance.ts";
import type {
  ContentLens,
  MunicipalityFilter,
} from "../domain/layers.ts";
import type { Placename } from "../domain/placename.ts";

const SOURCE_ID = "placenames";
const SELECTED_SOURCE_ID = "placenames-selected";
const REACH_SOURCE_ID = "reachability";
const REACH_LAYER_ID = "reachability-line";
const ADMIN_SOURCE_ID = "administrative-areas";
const ADMIN_FILL_ID = "administrative-areas-fill";
const ADMIN_LINE_ID = "administrative-areas-outline";
const SELECTED_HALO_ID = "placenames-selected-halo";
const SELECTED_RING_ID = "placenames-selected-ring";
const SELECTED_DOT_ID = "placenames-selected-dot";
const SELECTED_LABEL_ID = "placenames-selected-label";

/** Soft fills — readable at country scale without drowning town labels. */
const ADMIN_FILL_COLOR: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "municipalityCode"],
  955,
  "#d4b896",
  956,
  "#9ec4cf",
  957,
  "#b5c9a8",
  959,
  "#c2b3d4",
  960,
  "#a8c0d4",
  999,
  "#e6ebe8",
  "#d8d2c4",
];

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

const circleLayerId = (band: ZoomBand) => `placenames-circle-${band}`;
const labelLayerId = (band: ZoomBand) => `placenames-label-${band}`;

type Props = {
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, Placename> | null;
  reachabilityLines: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  selectedId: number | null;
  lens: ContentLens;
  municipalityFilter: MunicipalityFilter;
  onSelect: (place: Placename) => void;
};

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
    id: ADMIN_FILL_ID,
    type: "fill",
    source: ADMIN_SOURCE_ID,
    paint: {
      "fill-color": ADMIN_FILL_COLOR,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "dimmed"], false],
        0.04,
        [
          "match",
          ["get", "kind"],
          "national_park",
          0.22,
          "other",
          0.14,
          0.16,
        ],
      ],
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
        "case",
        ["boolean", ["feature-state", "dimmed"], false],
        0.2,
        [
          "match",
          ["get", "kind"],
          "national_park",
          0.55,
          0.7,
        ],
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

function parsePlacename(props: GeoJSON.GeoJsonProperties): Placename | null {
  if (!props) return null;
  const isLocality =
    props.isLocality === true ||
    props.isLocality === "true" ||
    props.isLocality === 1;
  const globalId = String(props.globalId ?? "");
  const identityStatus =
    props.identityStatus === "canonical" ||
    props.identityStatus === "candidate" ||
    props.identityStatus === "upstream_only"
      ? props.identityStatus
      : "upstream_only";
  return {
    ...(props as Placename),
    featureId:
      typeof props.featureId === "string" && props.featureId.length > 0
        ? props.featureId
        : `nunagis:${globalId}`,
    placeId:
      props.placeId == null || props.placeId === ""
        ? null
        : String(props.placeId),
    identityStatus,
    globalId,
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

function addBandLayers(map: Map, band: ZoomBand, minzoom: number) {
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
      // Zoom expressions must be top-level step/interpolate only — no nesting.
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
      // Try alternate anchors so labels sit in open space instead of stacking.
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
      // Higher importance wins when two labels compete for the same space.
      "symbol-sort-key": ["get", "importance"],
      // Never paint overlapping name tags — hide the loser until zoom frees space.
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
  lens,
  municipalityFilter,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const collectionRef = useRef(collection);
  const reachRef = useRef(reachabilityLines);
  const lensRef = useRef(lens);
  const fittedRef = useRef(false);
  const prevSelectedRef = useRef<number | null>(null);
  const inactiveIdsRef = useRef<Set<number>>(new Set());
  const adminCodesRef = useRef<number[]>([]);
  onSelectRef.current = onSelect;
  collectionRef.current = collection;
  reachRef.current = reachabilityLines;
  lensRef.current = lens;

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

      // Administrative areas under places — country-scale kommune outlines.
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

      const mins = disclosureMinZoom(lensRef.current);
      for (const band of BANDS) {
        addBandLayers(map, band, mins[band]);
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
      void fetch("/data/administrative-areas.geojson")
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<GeoJSON.FeatureCollection>;
        })
        .then((admin) => {
          if (!admin || !map.getSource(ADMIN_SOURCE_ID)) return;
          const source = map.getSource(ADMIN_SOURCE_ID) as GeoJSONSource;
          source.setData(admin);
          adminCodesRef.current = admin.features.map((feature) =>
            Number(
              (feature.properties as { municipalityCode?: number } | null)
                ?.municipalityCode ?? 0,
            ),
          );
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
    if (!map) return;

    return whenSourceReady(map, () => {
      const mins = disclosureMinZoom(lens);
      for (const band of BANDS) {
        const circleId = circleLayerId(band);
        const labelId = labelLayerId(band);
        if (map.getLayer(circleId)) {
          map.setLayerZoomRange(circleId, mins[band], 24);
        }
        if (map.getLayer(labelId)) {
          map.setLayerZoomRange(labelId, mins[band], 24);
        }
      }
    });
  }, [lens]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    return whenSourceReady(map, () => {
      if (!map.getSource(ADMIN_SOURCE_ID)) return;
      const activeCode =
        typeof municipalityFilter === "number"
          ? municipalityFilter
          : municipalityFilter === "outside"
            ? 999
            : null;
      for (const code of adminCodesRef.current) {
        const dimmed =
          activeCode != null &&
          code !== activeCode &&
          !(activeCode === 999 && code === 0);
        map.setFeatureState(
          { source: ADMIN_SOURCE_ID, id: code },
          { dimmed },
        );
      }
    });
  }, [municipalityFilter]);

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

      // Clear prior selection/inactive flags without walking every feature.
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
        // Soft-dim only nearby same-band peers would be ideal; skip mass-dim
        // when the geography source is large (tens of thousands of points).
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
