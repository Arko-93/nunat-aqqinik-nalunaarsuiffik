import { useEffect, useRef } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  corridorPlaceFromFeature,
  filterPlaceCollection,
  type CorridorPlace,
  type PlaceScope,
} from "../domain/place.ts";
import type { LocationPoint, TrackPoint, Waypoint } from "../domain/types.ts";

type Props = {
  track: ReadonlyArray<TrackPoint>;
  waypoints: ReadonlyArray<Waypoint>;
  position: LocationPoint | null;
  demoBasemap: boolean;
  badge: string;
  placeScope: PlaceScope;
  selectedPlaceId: string | null;
  onSelectPlace: (place: CorridorPlace | null) => void;
};

const CORRIDOR_CENTER: [number, number] = [-51.9, 70.72];
const PLACES_URL = "/packages/uummannaq-qaarsut/places.geojson";

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

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function MarineMap({
  track,
  waypoints,
  position,
  demoBasemap,
  badge,
  placeScope,
  selectedPlaceId,
  onSelectPlace,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const placesRef = useRef<GeoJSON.FeatureCollection>(EMPTY);
  const onSelectRef = useRef(onSelectPlace);
  onSelectRef.current = onSelectPlace;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: demoBasemap
          ? {
              demoraster: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "© OpenStreetMap",
              },
            }
          : {},
        layers: demoBasemap
          ? [
              {
                id: "demoraster",
                type: "raster",
                source: "demoraster",
              },
            ]
          : [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#0b1c28" },
              },
            ],
      },
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
      if (place) {
        map.easeTo({
          center: [place.longitude, place.latitude],
          zoom: Math.max(map.getZoom(), place.isLocality ? 9.2 : 10),
          duration: 450,
        });
      }
    };

    map.on("load", async () => {
      try {
        const places = (await fetch(PLACES_URL).then((response) =>
          response.json(),
        )) as GeoJSON.FeatureCollection;
        placesRef.current = places;
        map.addSource("corridor-places", {
          type: "geojson",
          data: filterPlaceCollection(places, placeScope),
          promoteId: "globalId",
        });

        map.addLayer({
          id: "places-hit",
          type: "circle",
          source: "corridor-places",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "isLocality"], true],
              16,
              12,
            ],
            "circle-color": "#000000",
            "circle-opacity": 0,
          },
        });

        map.addLayer({
          id: "places-circle",
          type: "circle",
          source: "corridor-places",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              ["case", ["==", ["get", "isLocality"], true], 5, 2.5],
              11,
              ["case", ["==", ["get", "isLocality"], true], 9, 5],
            ],
            "circle-color": [
              "case",
              ["==", ["get", "isLocality"], true],
              "#f0c674",
              [
                "match",
                ["get", "featureKind"],
                "settlement",
                "#f0c674",
                "town",
                "#f0c674",
                "#8fb8c9",
              ],
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "globalId"], selectedPlaceId ?? ""],
              3,
              1,
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "globalId"], selectedPlaceId ?? ""],
              "#ffffff",
              "#041018",
            ],
            "circle-opacity": 0.95,
          },
        });

        map.addLayer({
          id: "places-label",
          type: "symbol",
          source: "corridor-places",
          minzoom: 7.2,
          layout: {
            "text-field": ["get", "officialName"],
            "text-size": [
              "case",
              ["==", ["get", "isLocality"], true],
              13,
              11,
            ],
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-optional": true,
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-max-width": 10,
          },
          paint: {
            "text-color": "#e8f1f4",
            "text-halo-color": "#041018",
            "text-halo-width": 1.4,
          },
        });

        map.on("click", "places-hit", selectFromEvent);
        map.on("click", "places-circle", selectFromEvent);
        map.on("click", "places-label", selectFromEvent);
        map.on("mouseenter", "places-hit", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "places-hit", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", (event) => {
          const hits = map.queryRenderedFeatures(event.point, {
            layers: ["places-hit", "places-circle", "places-label"],
          });
          if (hits.length === 0) onSelectRef.current(null);
        });
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
          "line-width": 3,
          "line-opacity": 0.9,
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
          "circle-radius": 6,
          "circle-color": "#d96b5c",
          "circle-stroke-color": "#041018",
          "circle-stroke-width": 1.5,
        },
      });

      map.addSource("position", {
        type: "geojson",
        data: positionCollection(position),
      });
      map.addLayer({
        id: "accuracy-circle",
        type: "circle",
        source: "position",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "accuracy"], 30],
            5,
            8,
            80,
            28,
          ],
          "circle-color": "rgba(111, 191, 138, 0.18)",
          "circle-stroke-color": "rgba(111, 191, 138, 0.7)",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "position-puck",
        type: "circle",
        source: "position",
        paint: {
          "circle-radius": 6,
          "circle-color": "#6fbf8a",
          "circle-stroke-color": "#041018",
          "circle-stroke-width": 2,
        },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Bootstrap once; filter/selection update via later effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("corridor-places")) return;
    const source = map.getSource("corridor-places") as GeoJSONSource;
    source.setData(filterPlaceCollection(placesRef.current, placeScope));
  }, [placeScope]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("places-circle")) return;
    map.setPaintProperty("places-circle", "circle-stroke-width", [
      "case",
      ["==", ["get", "globalId"], selectedPlaceId ?? ""],
      3,
      1,
    ]);
    map.setPaintProperty("places-circle", "circle-stroke-color", [
      "case",
      ["==", ["get", "globalId"], selectedPlaceId ?? ""],
      "#ffffff",
      "#041018",
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
  }, [track, waypoints, position]);

  return (
    <div className="map-panel">
      <div className="map-root" ref={containerRef} />
      <div className="map-badge">{badge}</div>
    </div>
  );
}
