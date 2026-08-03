import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LocationPoint, TrackPoint, Waypoint } from "../domain/types.ts";

type Props = {
  track: ReadonlyArray<TrackPoint>;
  waypoints: ReadonlyArray<Waypoint>;
  position: LocationPoint | null;
  demoBasemap: boolean;
  badge: string;
};

const CORRIDOR_CENTER: [number, number] = [-51.5, 70.75];

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

export function MarineMap({
  track,
  waypoints,
  position,
  demoBasemap,
  badge,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: demoBasemap
          ? {
              demoraster: {
                type: "raster",
                tiles: [
                  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                ],
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
      zoom: 8.2,
      attributionControl: {},
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      "top-right",
    );

    map.on("load", async () => {
      try {
        const places = await fetch(
          "/packages/uummannaq-qaarsut/places.geojson",
        ).then((response) => response.json());
        map.addSource("corridor-places", { type: "geojson", data: places });
        map.addLayer({
          id: "places-circle",
          type: "circle",
          source: "corridor-places",
          paint: {
            "circle-radius": 4,
            "circle-color": [
              "case",
              ["==", ["get", "isLocality"], true],
              "#f0c674",
              "#8fb8c9",
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#041018",
          },
        });
        // Labels omitted in POC to avoid remote glyph dependency offline.
      } catch {
        // Package may be deleted; map still shows track/position.
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
    // Initial map bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoBasemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const trackSource = map.getSource("track") as GeoJSONSource | undefined;
    trackSource?.setData(trackCollection(track));
    const waypointSource = map.getSource("waypoints") as GeoJSONSource | undefined;
    waypointSource?.setData(waypointCollection(waypoints));
    const positionSource = map.getSource("position") as GeoJSONSource | undefined;
    positionSource?.setData(positionCollection(position));
    if (position) {
      map.easeTo({
        center: [position.longitude, position.latitude],
        duration: 500,
      });
    }
  }, [track, waypoints, position]);

  return (
    <div className="map-panel">
      <div className="map-root" ref={containerRef} />
      <div className="map-badge">{badge}</div>
    </div>
  );
}
