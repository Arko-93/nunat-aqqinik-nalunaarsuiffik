import { useEffect, useRef } from "react";
import maplibregl, { type Map, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BAND_MIN_ZOOM, type ZoomBand } from "../domain/importance.ts";
import type { Placename } from "../domain/placename.ts";

const SOURCE_ID = "placenames";

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
        8,
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
        "match",
        ["get", "featureKind"],
        "town",
        1,
        "settlement",
        0.95,
        0.78,
      ],
      "circle-stroke-width": [
        "match",
        ["get", "featureKind"],
        "other",
        0.7,
        1.4,
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
      "text-color": "#f4f7f8",
      "text-halo-color": "#0d2a38",
      "text-halo-width": 1.45,
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        minzoom,
        band === "locality" ? 1 : 0.55,
        minzoom + 0.8,
        1,
      ],
    },
  });
}

export function MapCanvas({ collection, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const collectionRef = useRef(collection);
  const fittedRef = useRef(false);
  onSelectRef.current = onSelect;
  collectionRef.current = collection;

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

      for (const band of BANDS) {
        addBandLayers(map, band);
      }
    };

    const bindInteractions = () => {
      for (const band of BANDS) {
        const circleId = circleLayerId(band);
        const labelId = labelLayerId(band);

        const selectFromEvent = (
          event: maplibregl.MapMouseEvent & {
            features?: maplibregl.MapGeoJSONFeature[];
          },
        ) => {
          const place = parsePlacename(event.features?.[0]?.properties ?? null);
          if (!place) return;
          onSelectRef.current(place);
        };

        map.on("click", circleId, selectFromEvent);
        map.on("click", labelId, selectFromEvent);
        map.on("mouseenter", circleId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", circleId, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", labelId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", labelId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
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

      for (const feature of collection.features) {
        const id = feature.properties.recordId;
        map.setFeatureState(
          { source: SOURCE_ID, id },
          { selected: id === selectedId },
        );
      }

      if (selectedId == null) return;
      const selected = collection.features.find(
        (feature) => feature.properties.recordId === selectedId,
      );
      if (!selected) return;
      const targetZoom = Math.max(
        map.getZoom(),
        selected.properties.minZoom + 1.2,
        selected.properties.isLocality ? 6.5 : 9,
      );
      map.easeTo({
        center: selected.geometry.coordinates as [number, number],
        zoom: targetZoom,
        duration: 700,
      });
    });
  }, [collection, selectedId]);

  return <div className="map-root" ref={containerRef} />;
}
