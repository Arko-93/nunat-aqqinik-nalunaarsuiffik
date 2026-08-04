import { useEffect, useRef } from "react";
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
import { accuracyCirclePolygon, EMPTY_FC } from "./geo.ts";

type Props = {
  track: ReadonlyArray<TrackPoint>;
  waypoints: ReadonlyArray<Waypoint>;
  position: LocationPoint | null;
  packageBaseUrl: string;
  offlineReady: boolean;
  badge: string;
  placeScope: PlaceScope;
  selectedPlaceId: string | null;
  flyToPlace: CorridorPlace | null;
  fitPlaces: ReadonlyArray<CorridorPlace>;
  /** Increment to fit the recorded track (return-along-track). */
  recenterToken: number;
  followPosition: boolean;
  onSelectPlace: (place: CorridorPlace | null) => void;
};

const CORRIDOR_CENTER: [number, number] = [-51.9, 70.72];

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

const fallbackStyle = (packageBaseUrl: string): StyleSpecification => ({
  version: 8,
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

export function MarineMap({
  track,
  waypoints,
  position,
  packageBaseUrl,
  offlineReady,
  badge,
  placeScope,
  selectedPlaceId,
  flyToPlace,
  fitPlaces,
  recenterToken,
  followPosition,
  onSelectPlace,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const placesRef = useRef<GeoJSON.FeatureCollection>(EMPTY_FC);
  const onSelectRef = useRef(onSelectPlace);
  const fittedRef = useRef(false);
  const followRef = useRef(followPosition);
  onSelectRef.current = onSelectPlace;
  followRef.current = followPosition;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();
    let cancelled = false;

    const boot = async () => {
      let style: StyleSpecification = fallbackStyle(packageBaseUrl);
      try {
        const response = await fetch(`${packageBaseUrl}/style.json`);
        if (response.ok) {
          style = rewriteStyleUrls(
            (await response.json()) as StyleSpecification,
            packageBaseUrl,
          );
        }
      } catch {
        // use fallback
      }
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: CORRIDOR_CENTER,
        zoom: 8.0,
        attributionControl: {},
      });

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

          if (!map.getLayer("places-hit")) {
            map.addLayer({
              id: "places-hit",
              type: "circle",
              source: "corridor-places",
              paint: {
                "circle-radius": 22,
                "circle-color": "#000000",
                "circle-opacity": 0,
              },
            });
          }

          if (!map.getLayer("places-halo")) {
            map.addLayer({
              id: "places-halo",
              type: "circle",
              source: "corridor-places",
              filter: ["==", ["get", "isLocality"], true],
              paint: {
                "circle-radius": 14,
                "circle-color": "rgba(240, 198, 116, 0.28)",
              },
            });
          }

          if (!map.getLayer("places-circle-overlay")) {
            map.addLayer({
              id: "places-circle-overlay",
              type: "circle",
              source: "corridor-places",
              paint: {
                "circle-radius": [
                  "case",
                  ["==", ["get", "isLocality"], true],
                  9,
                  5,
                ],
                "circle-color": [
                  "case",
                  ["==", ["get", "isLocality"], true],
                  "#f0c674",
                  "#8fb8c9",
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#041018",
                "circle-opacity": 0.98,
              },
            });
          }

          map.on("click", "places-hit", selectFromEvent);
          map.on("click", "places-circle-overlay", selectFromEvent);
          map.on("mouseenter", "places-hit", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "places-hit", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("click", (event) => {
            const hits = map.queryRenderedFeatures(event.point, {
              layers: ["places-hit", "places-circle-overlay"],
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
    if (!map?.getLayer("places-circle-overlay")) return;
    map.setPaintProperty("places-circle-overlay", "circle-stroke-width", [
      "case",
      ["==", ["get", "globalId"], selectedPlaceId ?? ""],
      4,
      2,
    ]);
    map.setPaintProperty("places-circle-overlay", "circle-stroke-color", [
      "case",
      ["==", ["get", "globalId"], selectedPlaceId ?? ""],
      "#ffffff",
      "#041018",
    ]);
    map.setPaintProperty("places-circle-overlay", "circle-radius", [
      "case",
      ["==", ["get", "globalId"], selectedPlaceId ?? ""],
      12,
      ["case", ["==", ["get", "isLocality"], true], 9, 5],
    ]);
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

  return (
    <div className="map-panel fullscreen">
      <div className="map-root" ref={containerRef} />
      <div className="map-badge">{badge}</div>
    </div>
  );
}
