import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  corridorPlaceFromFeature,
  filterPlaceCollection,
  type CorridorPlace,
  type PlaceScope,
} from "../domain/place.ts";
import type { LocationPoint, TrackPoint, Waypoint } from "../domain/types.ts";
import {
  resolveMarineBasemap,
  type BasemapMode,
} from "./basemap.ts";
import { accuracyCirclePolygon, EMPTY_FC } from "./geo.ts";

type Props = {
  track: ReadonlyArray<TrackPoint>;
  waypoints: ReadonlyArray<Waypoint>;
  position: LocationPoint | null;
  packageBaseUrl: string;
  /** [west, south, east, north] — initial view before place fit. */
  regionBbox?: [number, number, number, number];
  offlineReady: boolean;
  badge: string;
  placeScope: PlaceScope;
  selectedPlaceId: string | null;
  flyToPlace: CorridorPlace | null;
  fitPlaces: ReadonlyArray<CorridorPlace>;
  pointA: CorridorPlace | null;
  pointB: CorridorPlace | null;
  /** Coastal boat path [lon, lat] — empty uses straight A→B. */
  routeCoordinates: ReadonlyArray<readonly [number, number]>;
  /** Water path vs straight-line fallback (affects dash style). */
  routeMode: "water" | "straight-fallback" | null;
  /** Other water corridors (drawn faint; selected is `routeCoordinates`). */
  alternateRoutes: ReadonlyArray<{
    coordinates: ReadonlyArray<readonly [number, number]>;
  }>;
  selectedRouteIndex: number;
  /** Increment to fit the recorded track (return-along-track). */
  recenterToken: number;
  followPosition: boolean;
  onSelectPlace: (place: CorridorPlace | null) => void;
};

const travelPlanCollection = (
  pointA: CorridorPlace | null,
  pointB: CorridorPlace | null,
  routeCoordinates: ReadonlyArray<readonly [number, number]>,
  alternateRoutes: ReadonlyArray<{
    coordinates: ReadonlyArray<readonly [number, number]>;
  }>,
  selectedRouteIndex: number,
): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];
  if (pointA && pointB) {
    alternateRoutes.forEach((route, index) => {
      if (index === selectedRouteIndex) return;
      if (route.coordinates.length < 2) return;
      features.push({
        type: "Feature",
        properties: { kind: "alt" },
        geometry: {
          type: "LineString",
          coordinates: route.coordinates.map(
            ([lon, lat]) => [lon, lat] as [number, number],
          ),
        },
      });
    });
    const coordinates =
      routeCoordinates.length >= 2
        ? routeCoordinates.map(([lon, lat]) => [lon, lat] as [number, number])
        : [
            [pointA.longitude, pointA.latitude] as [number, number],
            [pointB.longitude, pointB.latitude] as [number, number],
          ];
    features.push({
      type: "Feature",
      properties: { kind: "leg" },
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }
  if (pointA) {
    features.push({
      type: "Feature",
      properties: { kind: "A", label: `A · ${pointA.officialName}` },
      geometry: {
        type: "Point",
        coordinates: [pointA.longitude, pointA.latitude],
      },
    });
  }
  if (pointB) {
    features.push({
      type: "Feature",
      properties: { kind: "B", label: `B · ${pointB.officialName}` },
      geometry: {
        type: "Point",
        coordinates: [pointB.longitude, pointB.latitude],
      },
    });
  }
  return { type: "FeatureCollection", features };
};

const fitTravel = (
  map: Map,
  pointA: CorridorPlace | null,
  pointB: CorridorPlace | null,
  routeCoordinates: ReadonlyArray<readonly [number, number]>,
) => {
  if (!pointA && !pointB) return;
  if (pointA && pointB) {
    const bounds = new maplibregl.LngLatBounds();
    if (routeCoordinates.length >= 2) {
      for (const [lon, lat] of routeCoordinates) bounds.extend([lon, lat]);
    } else {
      bounds.extend([pointA.longitude, pointA.latitude]);
      bounds.extend([pointB.longitude, pointB.latitude]);
    }
    map.fitBounds(bounds, { padding: 90, maxZoom: 10, duration: 700 });
    return;
  }
  const only = pointA ?? pointB;
  if (!only) return;
  map.easeTo({
    center: [only.longitude, only.latitude],
    zoom: Math.max(map.getZoom(), 9),
    duration: 550,
  });
};

const DEFAULT_CENTER: [number, number] = [-51.9, 70.72];

const centerFromBbox = (
  bbox: [number, number, number, number] | undefined,
): [number, number] => {
  if (!bbox) return DEFAULT_CENTER;
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
};

const zoomFromBbox = (
  bbox: [number, number, number, number] | undefined,
): number => {
  if (!bbox) return 8;
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  if (span > 20) return 4.2;
  if (span > 10) return 5.0;
  if (span > 5) return 5.8;
  return 7.2;
};

let protocolRegistered = false;
const ensurePmtilesProtocol = () => {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
};

const trackCollection = (
  track: ReadonlyArray<TrackPoint>,
): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
  type: "FeatureCollection",
  features:
    track.length >= 2
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: track
                .filter((point) => point.quality !== "rejected")
                .map((point) => [point.longitude, point.latitude]),
            },
          },
        ]
      : [],
});

const waypointCollection = (
  waypoints: ReadonlyArray<Waypoint>,
): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: waypoints.map((waypoint) => ({
    type: "Feature",
    properties: { category: waypoint.category, note: waypoint.note },
    geometry: {
      type: "Point",
      coordinates: [waypoint.longitude, waypoint.latitude],
    },
  })),
});

const positionCollection = (
  position: LocationPoint | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: position
    ? [
        {
          type: "Feature",
          properties: {
            accuracy: position.horizontalAccuracyM,
          },
          geometry: {
            type: "Point",
            coordinates: [position.longitude, position.latitude],
          },
        },
      ]
    : [],
});

const accuracyCollection = (
  position: LocationPoint | null,
): GeoJSON.FeatureCollection => {
  if (!position || position.horizontalAccuracyM == null) return EMPTY_FC;
  return accuracyCirclePolygon(
    position.latitude,
    position.longitude,
    position.horizontalAccuracyM,
  );
};

const fitToPlaces = (map: Map, places: ReadonlyArray<CorridorPlace>) => {
  if (places.length === 0) return;
  if (places.length === 1) {
    const only = places[0]!;
    map.easeTo({
      center: [only.longitude, only.latitude],
      zoom: 9.5,
      duration: 600,
    });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const place of places) {
    bounds.extend([place.longitude, place.latitude]);
  }
  map.fitBounds(bounds, { padding: 72, maxZoom: 10, duration: 700 });
};

const fitTrack = (map: Map, track: ReadonlyArray<TrackPoint>) => {
  const accepted = track.filter((point) => point.quality !== "rejected");
  if (accepted.length === 0) return;
  if (accepted.length === 1) {
    const only = accepted[0]!;
    map.easeTo({
      center: [only.longitude, only.latitude],
      zoom: Math.max(map.getZoom(), 12),
      duration: 500,
    });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const point of accepted) {
    bounds.extend([point.longitude, point.latitude]);
  }
  map.fitBounds(bounds, { padding: 64, maxZoom: 13, duration: 650 });
};

const absolutePackageUrl = (packageBaseUrl: string, relative: string): string => {
  const base = packageBaseUrl.replace(/\/$/, "");
  const path = `${base}/${relative.replace(/^\.\//, "")}`;
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
};

const rewriteStyleUrls = (
  style: StyleSpecification,
  packageBaseUrl: string,
): StyleSpecification => {
  const next = structuredClone(style);
  for (const source of Object.values(next.sources ?? {})) {
    if (!source || typeof source !== "object") continue;
    if ("data" in source && typeof source.data === "string") {
      if (!source.data.startsWith("http") && !source.data.startsWith("blob:")) {
        source.data = absolutePackageUrl(packageBaseUrl, source.data);
      }
    }
    if ("url" in source && typeof source.url === "string") {
      if (source.url.startsWith("pmtiles://")) {
        const file = source.url.slice("pmtiles://".length);
        source.url = `pmtiles://${absolutePackageUrl(packageBaseUrl, file)}`;
      }
    }
  }
  return next;
};

/** MapLibre glyph CDN — required for place-name text layers. */
const GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

const LOCALITY_FILTER: maplibregl.FilterSpecification = [
  "any",
  ["==", ["get", "isLocality"], true],
  ["==", ["get", "isLocality"], "true"],
  ["==", ["get", "isLocality"], 1],
];

const GEOGRAPHY_FILTER: maplibregl.FilterSpecification = [
  "!",
  LOCALITY_FILTER,
];

const ZOOM_VISIBLE_FILTER: maplibregl.FilterSpecification = [
  "<=",
  ["coalesce", ["get", "minZoom"], 5],
  ["zoom"],
];

const fallbackStyle = (packageBaseUrl: string): StyleSpecification => ({
  version: 8,
  glyphs: GLYPHS_URL,
  sources: {
    land: {
      type: "geojson",
      data: `${packageBaseUrl}/land.geojson`,
    },
    "corridor-places": {
      type: "geojson",
      data: `${packageBaseUrl}/places.geojson`,
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0b1c28" },
    },
    {
      id: "land-fill",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#1d3a2f", "fill-opacity": 0.92 },
    },
    {
      id: "land-outline",
      type: "line",
      source: "land",
      paint: { "line-color": "#3d6b57", "line-width": 1.2 },
    },
  ],
});

const ensureGlyphs = (style: StyleSpecification): StyleSpecification => {
  if (style.glyphs) return style;
  return { ...style, glyphs: GLYPHS_URL };
};

export function MarineMap({
  track,
  waypoints,
  position,
  packageBaseUrl,
  regionBbox,
  offlineReady,
  badge,
  placeScope,
  selectedPlaceId,
  flyToPlace,
  fitPlaces,
  pointA,
  pointB,
  routeCoordinates,
  routeMode,
  alternateRoutes,
  selectedRouteIndex,
  recenterToken,
  followPosition,
  onSelectPlace,
}: Props) {
  const lastFitKeyRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const placesRef = useRef<GeoJSON.FeatureCollection>(EMPTY_FC);
  const onSelectRef = useRef(onSelectPlace);
  const fittedRef = useRef(false);
  const followRef = useRef(followPosition);
  const basemapModeRef = useRef<BasemapMode>("offline");
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("offline");
  onSelectRef.current = onSelectPlace;
  followRef.current = followPosition;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();
    let cancelled = false;

    const boot = async () => {
      let packageStyle: StyleSpecification | null = null;
      try {
        const response = await fetch(`${packageBaseUrl}/style.json`);
        if (response.ok) {
          packageStyle = ensureGlyphs(
            rewriteStyleUrls(
              (await response.json()) as StyleSpecification,
              packageBaseUrl,
            ),
          );
        }
      } catch {
        // ignore — fallback below
      }
      if (!packageStyle) packageStyle = ensureGlyphs(fallbackStyle(packageBaseUrl));

      let style = packageStyle;
      let basemapMode: BasemapMode = "offline";
      try {
        const resolved = await resolveMarineBasemap(packageStyle);
        style = ensureGlyphs(resolved.style);
        basemapMode = resolved.mode;
      } catch {
        style = packageStyle;
        basemapMode = "offline";
      }
      basemapModeRef.current = basemapMode;
      setBasemapMode(basemapMode);
      if (cancelled || !containerRef.current) return;

      const lightUi = basemapMode === "realistic";
      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: centerFromBbox(regionBbox),
        zoom: zoomFromBbox(regionBbox),
        maxPitch: 0,
        attributionControl: { compact: true },
      });
      containerRef.current.dataset.basemap = basemapMode;

      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: false }),
        "top-right",
      );

      const selectFromEvent = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        event.originalEvent.stopPropagation();
        const place = corridorPlaceFromFeature(
          feature as unknown as GeoJSON.Feature,
        );
        onSelectRef.current(place);
      };

      map.on("load", async () => {
        try {
          // Style packages may ship static place layers; named overlays replace them.
          for (const layerId of [
            "places-circle",
            "places-label",
            "places-label-locality",
            "places-label-geography",
          ]) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
          }

          const places = (await fetch(
            `${packageBaseUrl}/places.geojson`,
          ).then((response) => response.json())) as GeoJSON.FeatureCollection;
          placesRef.current = places;

          if (!map.getSource("corridor-places")) {
            map.addSource("corridor-places", {
              type: "geojson",
              data: filterPlaceCollection(places, placeScope),
            });
          } else {
            const source = map.getSource("corridor-places") as GeoJSONSource;
            source.setData(filterPlaceCollection(places, placeScope));
          }

          // Tiny markers only — names carry the map.
          if (!map.getLayer("places-circle-overlay")) {
            map.addLayer({
              id: "places-circle-overlay",
              type: "circle",
              source: "corridor-places",
              filter: [
                "all",
                ZOOM_VISIBLE_FILTER,
                LOCALITY_FILTER,
              ] as maplibregl.FilterSpecification,
              paint: {
                "circle-radius": 3.2,
                "circle-color": lightUi ? "#c45c26" : "#f0c674",
                "circle-stroke-width": 1,
                "circle-stroke-color": lightUi ? "#ffffff" : "#041018",
                "circle-opacity": 0.95,
              },
            });
          }

          if (!map.getLayer("places-label-locality")) {
            map.addLayer({
              id: "places-label-locality",
              type: "symbol",
              source: "corridor-places",
              filter: [
                "all",
                ZOOM_VISIBLE_FILTER,
                LOCALITY_FILTER,
              ] as maplibregl.FilterSpecification,
              layout: {
                "text-field": ["get", "officialName"],
                "text-font": ["Open Sans Bold", "Open Sans Regular"],
                "text-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  3,
                  12,
                  8,
                  15,
                  12,
                  17,
                ],
                "text-variable-anchor": [
                  "top",
                  "bottom",
                  "right",
                  "left",
                  "top-right",
                  "bottom-left",
                ],
                "text-radial-offset": 0.7,
                "text-padding": 4,
                "text-max-width": 9,
                "text-optional": false,
                "symbol-sort-key": [
                  "-",
                  ["coalesce", ["get", "importance"], 0],
                ],
                "text-allow-overlap": false,
                "text-ignore-placement": false,
              },
              paint: {
                "text-color": lightUi ? "#1a2a32" : "#f7efd8",
                "text-halo-color": lightUi ? "#f4f7f8" : "#0a1a22",
                "text-halo-width": 1.6,
              },
            });
          }

          if (!map.getLayer("places-label-geography")) {
            map.addLayer({
              id: "places-label-geography",
              type: "symbol",
              source: "corridor-places",
              filter: [
                "all",
                ZOOM_VISIBLE_FILTER,
                GEOGRAPHY_FILTER,
              ] as maplibregl.FilterSpecification,
              layout: {
                "text-field": ["get", "officialName"],
                "text-font": ["Open Sans Regular"],
                "text-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  10,
                  8,
                  12.5,
                  12,
                  14,
                ],
                "text-variable-anchor": [
                  "top",
                  "bottom",
                  "left",
                  "right",
                  "top-left",
                  "bottom-right",
                ],
                "text-radial-offset": 0.55,
                "text-padding": 6,
                "text-max-width": 8,
                "text-optional": true,
                "symbol-sort-key": [
                  "-",
                  ["coalesce", ["get", "importance"], 0],
                ],
                "text-allow-overlap": false,
                "text-ignore-placement": false,
              },
              paint: {
                "text-color": lightUi ? "#3a5a68" : "#b7d3df",
                "text-halo-color": lightUi ? "#f4f7f8" : "#0a1a22",
                "text-halo-width": 1.35,
                "text-opacity": 0.92,
              },
            });
          }

          const placeLayers = [
            "places-circle-overlay",
            "places-label-locality",
            "places-label-geography",
          ];
          for (const layerId of placeLayers) {
            map.on("click", layerId, selectFromEvent);
            map.on("mouseenter", layerId, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", layerId, () => {
              map.getCanvas().style.cursor = "";
            });
          }
          map.on("click", (event) => {
            const hits = map.queryRenderedFeatures(event.point, {
              layers: placeLayers,
            });
            if (hits.length === 0) onSelectRef.current(null);
          });

          if (!fittedRef.current && fitPlaces.length > 0) {
            fittedRef.current = true;
            fitToPlaces(map, fitPlaces);
          }
        } catch {
          // Package may be missing; track/position still work.
        }

        map.addSource("track", {
          type: "geojson",
          data: trackCollection(track),
        });
        map.addLayer({
          id: "track-line",
          type: "line",
          source: "track",
          paint: {
            "line-color": "#e3a23a",
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });

        map.addSource("waypoints", {
          type: "geojson",
          data: waypointCollection(waypoints),
        });
        map.addLayer({
          id: "waypoints-circle",
          type: "circle",
          source: "waypoints",
          paint: {
            "circle-radius": 7,
            "circle-color": "#d96b5c",
            "circle-stroke-color": "#041018",
            "circle-stroke-width": 2,
          },
        });

        map.addSource("accuracy", {
          type: "geojson",
          data: accuracyCollection(position),
        });
        map.addLayer({
          id: "accuracy-fill",
          type: "fill",
          source: "accuracy",
          paint: {
            "fill-color": "rgba(111, 191, 138, 0.18)",
            "fill-outline-color": "rgba(111, 191, 138, 0.75)",
          },
        });

        map.addSource("position", {
          type: "geojson",
          data: positionCollection(position),
        });
        map.addLayer({
          id: "position-puck",
          type: "circle",
          source: "position",
          paint: {
            "circle-radius": 7,
            "circle-color": "#6fbf8a",
            "circle-stroke-color": "#041018",
            "circle-stroke-width": 2,
          },
        });

        map.addSource("travel-plan", {
          type: "geojson",
          data: travelPlanCollection(
            pointA,
            pointB,
            routeCoordinates,
            alternateRoutes,
            selectedRouteIndex,
          ),
        });
        map.addLayer({
          id: "travel-alt",
          type: "line",
          source: "travel-plan",
          filter: ["==", ["get", "kind"], "alt"],
          paint: {
            "line-color": "#7eb6c9",
            "line-width": 2.4,
            "line-opacity": 0.55,
            "line-dasharray": [1.4, 1.8],
          },
        });
        map.addLayer({
          id: "travel-leg-casing",
          type: "line",
          source: "travel-plan",
          filter: ["==", ["get", "kind"], "leg"],
          paint: {
            "line-color": "#041018",
            "line-width": 7,
            "line-opacity": 0.55,
          },
        });
        map.addLayer({
          id: "travel-leg",
          type: "line",
          source: "travel-plan",
          filter: ["==", ["get", "kind"], "leg"],
          paint: {
            "line-color": "#f0c674",
            "line-width": 3.8,
            "line-opacity": 0.98,
            "line-dasharray": [1, 0],
          },
        });
        map.addLayer({
          id: "travel-points",
          type: "circle",
          source: "travel-plan",
          filter: [
            "any",
            ["==", ["get", "kind"], "A"],
            ["==", ["get", "kind"], "B"],
          ],
          paint: {
            "circle-radius": 11,
            "circle-color": [
              "match",
              ["get", "kind"],
              "A",
              "#6fbf8a",
              "B",
              "#e3a23a",
              "#ffffff",
            ],
            "circle-stroke-color": "#041018",
            "circle-stroke-width": 2.5,
          },
        });
        map.addLayer({
          id: "travel-labels",
          type: "symbol",
          source: "travel-plan",
          filter: [
            "any",
            ["==", ["get", "kind"], "A"],
            ["==", ["get", "kind"], "B"],
          ],
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Open Sans Bold", "Open Sans Regular"],
            "text-size": 14,
            "text-offset": [0, 1.35],
            "text-anchor": "top",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": lightUi ? "#1a2a32" : "#f7efd8",
            "text-halo-color": lightUi ? "#f4f7f8" : "#0a1a22",
            "text-halo-width": 1.8,
          },
        });
      });

      mapRef.current = map;
    };

    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageBaseUrl, offlineReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("corridor-places")) return;
    const source = map.getSource("corridor-places") as GeoJSONSource;
    source.setData(filterPlaceCollection(placesRef.current, placeScope));
  }, [placeScope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToPlace) return;
    map.easeTo({
      center: [flyToPlace.longitude, flyToPlace.latitude],
      zoom: Math.max(map.getZoom(), flyToPlace.isLocality ? 10 : 11),
      duration: 650,
    });
  }, [flyToPlace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || fittedRef.current || fitPlaces.length === 0) {
      return;
    }
    if (!map.getSource("corridor-places")) return;
    fittedRef.current = true;
    fitToPlaces(map, fitPlaces);
  }, [fitPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("places-label-locality")) return;
    const selected = selectedPlaceId ?? "";
    map.setPaintProperty("places-circle-overlay", "circle-radius", [
      "case",
      ["==", ["get", "globalId"], selected],
      6,
      3.2,
    ]);
    const lightUi = basemapModeRef.current === "realistic";
    map.setPaintProperty("places-circle-overlay", "circle-stroke-color", [
      "case",
      ["==", ["get", "globalId"], selected],
      lightUi ? "#c45c26" : "#ffffff",
      lightUi ? "#ffffff" : "#041018",
    ]);
    for (const layerId of [
      "places-label-locality",
      "places-label-geography",
    ] as const) {
      if (!map.getLayer(layerId)) continue;
      const idle =
        layerId === "places-label-locality"
          ? lightUi
            ? "#1a2a32"
            : "#f7efd8"
          : lightUi
            ? "#3a5a68"
            : "#b7d3df";
      map.setPaintProperty(layerId, "text-color", [
        "case",
        ["==", ["get", "globalId"], selected],
        lightUi ? "#c45c26" : "#ffffff",
        idle,
      ]);
      map.setPaintProperty(layerId, "text-halo-width", [
        "case",
        ["==", ["get", "globalId"], selected],
        2.2,
        layerId === "places-label-locality" ? 1.6 : 1.35,
      ]);
    }
  }, [selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const trackSource = map.getSource("track") as GeoJSONSource | undefined;
    trackSource?.setData(trackCollection(track));
    const waypointSource = map.getSource("waypoints") as
      | GeoJSONSource
      | undefined;
    waypointSource?.setData(waypointCollection(waypoints));
    const positionSource = map.getSource("position") as
      | GeoJSONSource
      | undefined;
    positionSource?.setData(positionCollection(position));
    const accuracySource = map.getSource("accuracy") as
      | GeoJSONSource
      | undefined;
    accuracySource?.setData(accuracyCollection(position));

    if (followRef.current && position) {
      map.easeTo({
        center: [position.longitude, position.latitude],
        duration: 400,
      });
    }
  }, [track, waypoints, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || recenterToken === 0) return;
    fitTrack(map, track);
  }, [recenterToken, track]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("travel-plan") as GeoJSONSource | undefined;
    source?.setData(
      travelPlanCollection(
        pointA,
        pointB,
        routeCoordinates,
        alternateRoutes,
        selectedRouteIndex,
      ),
    );
    if (map.getLayer("travel-leg")) {
      map.setPaintProperty(
        "travel-leg",
        "line-dasharray",
        routeMode === "straight-fallback" ? [1.2, 1.6] : [1, 0],
      );
      map.setPaintProperty(
        "travel-leg",
        "line-color",
        routeMode === "straight-fallback" ? "#d08a5a" : "#f0c674",
      );
    }
    // Fit once per A/B pair (and when water routes first appear), not every alt tap.
    if (pointA && pointB && routeCoordinates.length >= 2) {
      const fitKey = `${pointA.globalId}|${pointB.globalId}|${routeMode}|${alternateRoutes.length}`;
      if (lastFitKeyRef.current !== fitKey) {
        lastFitKeyRef.current = fitKey;
        const boundsCoords =
          alternateRoutes.length > 0
            ? alternateRoutes.flatMap((route) => route.coordinates)
            : routeCoordinates;
        fitTravel(map, pointA, pointB, boundsCoords);
      }
    } else {
      lastFitKeyRef.current = "";
    }
  }, [
    pointA,
    pointB,
    routeCoordinates,
    routeMode,
    alternateRoutes,
    selectedRouteIndex,
  ]);

  return (
    <div className="map-panel fullscreen">
      <div className="map-root" ref={containerRef} />
      <div className="map-badge">
        {badge}
        {basemapMode === "realistic"
          ? " · Relief + depth (context)"
          : " · Offline package style"}
      </div>
    </div>
  );
}
