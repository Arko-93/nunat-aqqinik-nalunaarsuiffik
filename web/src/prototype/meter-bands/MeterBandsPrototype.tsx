/**
 * PROTOTYPE — three meter-band schemes over Uummannaq / Qaarsut.
 * Wayfinder #9. Throwaway. Not for navigation.
 *
 * Uses Mapterhorn land DEM + Open Waters Seascape ocean layers as stand-ins
 * so Ole can judge breaks before the IBCAO self-tile pipeline exists.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type FilterSpecification, type Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  VARIANTS,
  landBandColor,
  oceanBandColor,
  type BandVariant,
} from "./variants.ts";
import "./meter-bands.css";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";
const MAPTERHORN = "https://tiles.mapterhorn.com/tilejson.json";
const SEASCAPE_DEM = "https://tiles.openwaters.io/seascape/raster.json";
const SEASCAPE_VECTOR = "https://tiles.openwaters.io/seascape/vector.json";

/** Qaarsut / Uummannaq looking north toward the corridor. */
const CENTER: [number, number] = [-53.0, 70.7];
const ZOOM = 7.2;

function readVariant(): BandVariant["key"] {
  const raw = new URLSearchParams(window.location.search).get("variant");
  if (raw === "A" || raw === "B" || raw === "C" || raw === "D") return raw;
  return "D";
}

/** Insert ocean under the first land fill so islands are never painted as sea. */
function oceanBeforeId(map: Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  const land = layers.find((l) => {
    if (l.type !== "fill") return false;
    const id = l.id.toLowerCase();
    return (
      id.includes("land") ||
      id.includes("earth") ||
      id.includes("landcover") ||
      id.includes("landuse")
    );
  });
  if (land) return land.id;
  const water = layers.find((l) => l.id.toLowerCase().includes("water"));
  return water?.id;
}

function setVariantInUrl(key: BandVariant["key"]) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState({}, "", url.toString());
}

function contourFilter(breaks: number[]): FilterSpecification {
  return ["in", ["get", "depth_m"], ["literal", breaks]];
}

function applyOceanLayers(map: Map, variant: BandVariant) {
  const ids = [
    "proto-ocean-hillshade",
    "proto-depare",
    "proto-contours",
    "proto-contour-labels",
  ];
  for (const id of ids) {
    if (map.getLayer(id)) map.removeLayer(id);
  }

  const beforeId = oceanBeforeId(map);

  if (!map.getSource("proto-bathymetry-dem")) {
    map.addSource("proto-bathymetry-dem", {
      type: "raster-dem",
      url: SEASCAPE_DEM,
      tileSize: 512,
      encoding: "terrarium",
      attribution: "Ocean DEM © Open Waters (context) — not for navigation",
    });
  }
  if (!map.getSource("proto-bathymetry-vector")) {
    map.addSource("proto-bathymetry-vector", {
      type: "vector",
      url: SEASCAPE_VECTOR,
      attribution: "Ocean vectors © Open Waters (context) — not for navigation",
    });
  }

  const hillshadeEx =
    variant.oceanStyle === "sparse-hybrid"
      ? 0.75
      : variant.oceanStyle === "contours-only"
        ? 0.35
        : variant.oceanStyle === "filled-plus-contours-masked"
          ? 0.45
          : 0.5;

  map.addLayer(
    {
      id: "proto-ocean-hillshade",
      type: "hillshade",
      source: "proto-bathymetry-dem",
      paint: {
        "hillshade-exaggeration": hillshadeEx,
        "hillshade-shadow-color": "#062033",
        "hillshade-highlight-color": "#d7e8f4",
        "hillshade-accent-color": "#1a4a66",
      },
    },
    beforeId,
  );

  const useFills =
    variant.oceanStyle === "filled-bands" ||
    variant.oceanStyle === "sparse-hybrid" ||
    variant.oceanStyle === "filled-plus-contours-masked";

  if (useFills) {
    const opacity =
      variant.oceanStyle === "sparse-hybrid"
        ? 0.35
        : variant.oceanStyle === "filled-plus-contours-masked"
          ? 0.48
          : 0.55;
    map.addLayer(
      {
        id: "proto-depare",
        type: "fill",
        source: "proto-bathymetry-vector",
        "source-layer": "depare",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "drval2"],
            0,
            oceanBandColor(5),
            10,
            oceanBandColor(10),
            20,
            oceanBandColor(20),
            50,
            oceanBandColor(50),
            100,
            oceanBandColor(100),
            200,
            oceanBandColor(200),
            500,
            oceanBandColor(500),
            1000,
            oceanBandColor(1000),
          ],
          "fill-opacity": opacity,
        },
      },
      beforeId,
    );
  }

  map.addLayer(
    {
      id: "proto-contours",
      type: "line",
      source: "proto-bathymetry-vector",
      "source-layer": "contours",
      filter: contourFilter(variant.oceanBreaksM),
      paint: {
        "line-color":
          variant.oceanStyle === "contours-only" ? "#1a4a66" : "#2f6f88",
        "line-width":
          variant.oceanStyle === "sparse-hybrid" ||
          variant.oceanStyle === "filled-plus-contours-masked"
            ? 1.2
            : 0.9,
        "line-opacity": 0.8,
      },
    },
    beforeId,
  );

  // Contour labels sit above land so meter numbers stay readable on water edges.
  map.addLayer({
    id: "proto-contour-labels",
    type: "symbol",
    source: "proto-bathymetry-vector",
    "source-layer": "contours",
    filter: contourFilter(variant.oceanBreaksM),
    minzoom: 6,
    layout: {
      "symbol-placement": "line",
      "text-field": ["concat", ["to-string", ["get", "depth_m"]], " m"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "#0c2438",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  });
}

function applyLandTerrain(map: Map) {
  if (map.getSource("proto-land-dem")) return;
  map.addSource("proto-land-dem", {
    type: "raster-dem",
    url: MAPTERHORN,
    tileSize: 512,
    encoding: "terrarium",
    attribution:
      "Land DEM Klimadatastyrelsen / Mapterhorn (CC BY 4.0) via Mapterhorn",
  });
  map.addLayer(
    {
      id: "proto-land-hillshade",
      type: "hillshade",
      source: "proto-land-dem",
      paint: {
        "hillshade-exaggeration": 0.55,
        "hillshade-shadow-color": "#3a3228",
        "hillshade-highlight-color": "#f0e6d4",
        "hillshade-accent-color": "#6b5e4a",
      },
    },
    map.getStyle().layers?.[1]?.id,
  );
}

function softenWater(map: Map) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "fill") continue;
    const id = layer.id.toLowerCase();
    if (!id.includes("water") && !id.includes("ocean")) continue;
    map.setPaintProperty(layer.id, "fill-opacity", 0.28);
    map.setPaintProperty(layer.id, "fill-color", "#9eb8d8");
  }
}

export function MeterBandsPrototype() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [variantKey, setVariantKey] = useState<BandVariant["key"]>(readVariant);
  const variant = useMemo(
    () => VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]!,
    [variantKey],
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: LIBERTY,
      center: CENTER,
      zoom: ZOOM,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      softenWater(map);
      applyLandTerrain(map);
      applyOceanLayers(map, variant);
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyOceanLayers(map, variant);
    setVariantInUrl(variant.key);
  }, [variant, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      const keys = VARIANTS.map((v) => v.key);
      const i = keys.indexOf(variantKey);
      if (e.key === "ArrowLeft") {
        const next = keys[(i - 1 + keys.length) % keys.length]!;
        setVariantKey(next);
      }
      if (e.key === "ArrowRight") {
        const next = keys[(i + 1) % keys.length]!;
        setVariantKey(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variantKey]);

  const cycle = (dir: -1 | 1) => {
    const keys = VARIANTS.map((v) => v.key);
    const i = keys.indexOf(variantKey);
    setVariantKey(keys[(i + dir + keys.length) % keys.length]!);
  };

  return (
    <div className="mb-proto">
      <div className="mb-proto__banner">
        PROTOTYPE · Meter band breaks (#9) · Not for navigation · Throwaway
      </div>
      <div ref={containerRef} className="mb-proto__map" />
      <aside className="mb-proto__legend" aria-live="polite">
        <h1>
          {variant.key} — {variant.name}
        </h1>
        <p>{variant.blurb}</p>
        <h2>Ocean depth (m)</h2>
        <ul>
          {variant.oceanBreaksM.map((d) => (
            <li key={`o-${d}`}>
              <span
                className="mb-proto__swatch"
                style={{ background: oceanBandColor(d) }}
              />
              −{d} m
            </li>
          ))}
        </ul>
        <h2>Land height (m)</h2>
        <p className="mb-proto__note">
          {variant.landPeaksOnly
            ? "Peaks only — bands/labels on high island and mountain tops (≥500 m). Not a full land wash."
            : "Land breaks are for the future color-relief layer. Map shows Mapterhorn hillshade only in this prototype."}
        </p>
        <ul>
          {variant.landBreaksM.map((e) => (
            <li key={`l-${e}`}>
              <span
                className="mb-proto__swatch"
                style={{ background: landBandColor(e) }}
              />
              {e} m
            </li>
          ))}
        </ul>
        <p className="mb-proto__state">
          state: variant={variant.key} oceanStyle={variant.oceanStyle}{" "}
          landPeaksOnly={String(variant.landPeaksOnly)} breaks=
          {JSON.stringify({
            ocean: variant.oceanBreaksM,
            land: variant.landBreaksM,
          })}
        </p>
      </aside>
      <div className="mb-proto__switcher" role="group" aria-label="Variant">
        <button type="button" onClick={() => cycle(-1)} aria-label="Previous">
          ←
        </button>
        <span>
          {variant.key} — {variant.name}
        </span>
        <button type="button" onClick={() => cycle(1)} aria-label="Next">
          →
        </button>
      </div>
    </div>
  );
}
