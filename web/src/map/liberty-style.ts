/**
 * Runtime validation + construction of OpenFreeMap Liberty (MapLibre style v8).
 * Builds SourceSpecification / LayerSpecification by discriminant — no whole-object casts.
 */

import type {
  BackgroundLayerSpecification,
  CircleLayerSpecification,
  FillExtrusionLayerSpecification,
  FillLayerSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  HeatmapLayerSpecification,
  HillshadeLayerSpecification,
  ImageSourceSpecification,
  LayerSpecification,
  LineLayerSpecification,
  RasterDEMSourceSpecification,
  RasterLayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
  VideoSourceSpecification,
} from "maplibre-gl";

export class StyleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new StyleError(`${label} must be string[]`);
  }
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  return requireStringArray(value, label);
}

function optionalNumberQuad(
  value: unknown,
): [number, number, number, number] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 4) {
    throw new StyleError("Expected [number, number, number, number]");
  }
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new StyleError("Expected [number, number, number, number]");
  }
  return [value[0]!, value[1]!, value[2]!, value[3]!];
}

function requireLngLatPairs(
  value: unknown,
): [[number, number], [number, number], [number, number], [number, number]] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new StyleError("Expected four [lng, lat] pairs");
  }
  const pairs: [number, number][] = [];
  for (const pair of value) {
    if (
      !Array.isArray(pair) ||
      pair.length < 2 ||
      typeof pair[0] !== "number" ||
      typeof pair[1] !== "number"
    ) {
      throw new StyleError("Expected [lng, lat] pair");
    }
    pairs.push([pair[0], pair[1]]);
  }
  return [pairs[0]!, pairs[1]!, pairs[2]!, pairs[3]!];
}

/**
 * Paint/layout bags: plain-object check only.
 * Deep expression validation is MapLibre's job at style load.
 */
function optionalPropertyBag(
  value: unknown,
  label: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new StyleError(`${label} must be an object`);
  }
  return value;
}

function optionalFilter(
  value: unknown,
  label: string,
): FilterSpecification | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    // JSON arrays that pass Array.isArray are expression/filter forms for MapLibre.
    return value as FilterSpecification;
  }
  throw new StyleError(`${label} must be a boolean or expression array`);
}

function parseVectorSource(
  raw: Record<string, unknown>,
  key: string,
): VectorSourceSpecification {
  const url = optionalString(raw.url);
  const tiles = optionalStringArray(raw.tiles, `Source "${key}" tiles`);
  if (!url && (!tiles || tiles.length === 0)) {
    throw new StyleError(`Vector source "${key}" requires url or tiles`);
  }
  const source: VectorSourceSpecification = { type: "vector" };
  if (url !== undefined) source.url = url;
  if (tiles !== undefined) source.tiles = tiles;
  const bounds = optionalNumberQuad(raw.bounds);
  if (bounds) source.bounds = bounds;
  if (raw.scheme === "xyz" || raw.scheme === "tms") source.scheme = raw.scheme;
  const minzoom = optionalNumber(raw.minzoom);
  if (minzoom !== undefined) source.minzoom = minzoom;
  const maxzoom = optionalNumber(raw.maxzoom);
  if (maxzoom !== undefined) source.maxzoom = maxzoom;
  const attribution = optionalString(raw.attribution);
  if (attribution !== undefined) source.attribution = attribution;
  const volatile = optionalBoolean(raw.volatile);
  if (volatile !== undefined) source.volatile = volatile;
  if (raw.encoding === "mvt" || raw.encoding === "mlt") {
    source.encoding = raw.encoding;
  }
  return source;
}

function parseRasterSource(
  raw: Record<string, unknown>,
  key: string,
): RasterSourceSpecification {
  const url = optionalString(raw.url);
  const tiles = optionalStringArray(raw.tiles, `Source "${key}" tiles`);
  if (!url && (!tiles || tiles.length === 0)) {
    throw new StyleError(`Raster source "${key}" requires url or tiles`);
  }
  const source: RasterSourceSpecification = { type: "raster" };
  if (url !== undefined) source.url = url;
  if (tiles !== undefined) source.tiles = tiles;
  const bounds = optionalNumberQuad(raw.bounds);
  if (bounds) source.bounds = bounds;
  const minzoom = optionalNumber(raw.minzoom);
  if (minzoom !== undefined) source.minzoom = minzoom;
  const maxzoom = optionalNumber(raw.maxzoom);
  if (maxzoom !== undefined) source.maxzoom = maxzoom;
  const tileSize = optionalNumber(raw.tileSize);
  if (tileSize !== undefined) source.tileSize = tileSize;
  if (raw.scheme === "xyz" || raw.scheme === "tms") source.scheme = raw.scheme;
  const attribution = optionalString(raw.attribution);
  if (attribution !== undefined) source.attribution = attribution;
  const volatile = optionalBoolean(raw.volatile);
  if (volatile !== undefined) source.volatile = volatile;
  return source;
}

function parseRasterDemSource(
  raw: Record<string, unknown>,
  key: string,
): RasterDEMSourceSpecification {
  const url = optionalString(raw.url);
  const tiles = optionalStringArray(raw.tiles, `Source "${key}" tiles`);
  if (!url && (!tiles || tiles.length === 0)) {
    throw new StyleError(`Raster-DEM source "${key}" requires url or tiles`);
  }
  const source: RasterDEMSourceSpecification = { type: "raster-dem" };
  if (url !== undefined) source.url = url;
  if (tiles !== undefined) source.tiles = tiles;
  const bounds = optionalNumberQuad(raw.bounds);
  if (bounds) source.bounds = bounds;
  const minzoom = optionalNumber(raw.minzoom);
  if (minzoom !== undefined) source.minzoom = minzoom;
  const maxzoom = optionalNumber(raw.maxzoom);
  if (maxzoom !== undefined) source.maxzoom = maxzoom;
  const tileSize = optionalNumber(raw.tileSize);
  if (tileSize !== undefined) source.tileSize = tileSize;
  const attribution = optionalString(raw.attribution);
  if (attribution !== undefined) source.attribution = attribution;
  if (
    raw.encoding === "terrarium" ||
    raw.encoding === "mapbox" ||
    raw.encoding === "custom"
  ) {
    source.encoding = raw.encoding;
  }
  const volatile = optionalBoolean(raw.volatile);
  if (volatile !== undefined) source.volatile = volatile;
  return source;
}

function parseGeoJsonSource(
  raw: Record<string, unknown>,
  key: string,
): GeoJSONSourceSpecification {
  if (raw.data === undefined) {
    throw new StyleError(`GeoJSON source "${key}" requires data`);
  }
  if (typeof raw.data === "string") {
    return { type: "geojson", data: raw.data };
  }
  if (isRecord(raw.data)) {
    const geoType = optionalString(raw.data.type);
    if (
      geoType !== "Feature" &&
      geoType !== "FeatureCollection" &&
      geoType !== "Point" &&
      geoType !== "MultiPoint" &&
      geoType !== "LineString" &&
      geoType !== "MultiLineString" &&
      geoType !== "Polygon" &&
      geoType !== "MultiPolygon" &&
      geoType !== "GeometryCollection"
    ) {
      throw new StyleError(
        `GeoJSON source "${key}" data.type must be a GeoJSON type`,
      );
    }
    const source: GeoJSONSourceSpecification = {
      type: "geojson",
      // Discriminant on data.type checked above; MapLibre owns deep GeoJSON shape.
      data: raw.data as unknown as GeoJSON.GeoJSON,
    };
    const maxzoom = optionalNumber(raw.maxzoom);
    if (maxzoom !== undefined) source.maxzoom = maxzoom;
    const attribution = optionalString(raw.attribution);
    if (attribution !== undefined) source.attribution = attribution;
    return source;
  }
  throw new StyleError(`GeoJSON source "${key}" data must be URL or GeoJSON`);
}

function parseVideoSource(
  raw: Record<string, unknown>,
  key: string,
): VideoSourceSpecification {
  const urls = optionalStringArray(raw.urls, `Video source "${key}" urls`);
  if (!urls || urls.length === 0) {
    throw new StyleError(`Video source "${key}" requires urls`);
  }
  return {
    type: "video",
    urls,
    coordinates: requireLngLatPairs(raw.coordinates),
  };
}

function parseImageSource(
  raw: Record<string, unknown>,
  key: string,
): ImageSourceSpecification {
  const url = optionalString(raw.url);
  if (!url) {
    throw new StyleError(`Image source "${key}" requires url`);
  }
  return {
    type: "image",
    url,
    coordinates: requireLngLatPairs(raw.coordinates),
  };
}

export function parseSource(raw: unknown, key: string): SourceSpecification {
  if (!isRecord(raw)) {
    throw new StyleError(`Style source "${key}" must be an object`);
  }
  switch (raw.type) {
    case "vector":
      return parseVectorSource(raw, key);
    case "raster":
      return parseRasterSource(raw, key);
    case "raster-dem":
      return parseRasterDemSource(raw, key);
    case "geojson":
      return parseGeoJsonSource(raw, key);
    case "video":
      return parseVideoSource(raw, key);
    case "image":
      return parseImageSource(raw, key);
    default:
      throw new StyleError(
        `Unsupported source type "${String(raw.type)}" for "${key}"`,
      );
  }
}

type SourcedLayer =
  | FillLayerSpecification
  | LineLayerSpecification
  | SymbolLayerSpecification
  | CircleLayerSpecification
  | HeatmapLayerSpecification
  | FillExtrusionLayerSpecification
  | RasterLayerSpecification
  | HillshadeLayerSpecification;

function attachSourcedLayerFields(
  layer: SourcedLayer,
  raw: Record<string, unknown>,
  index: number,
): void {
  const sourceLayer = optionalString(raw["source-layer"]);
  if (sourceLayer !== undefined) layer["source-layer"] = sourceLayer;
  const minzoom = optionalNumber(raw.minzoom);
  if (minzoom !== undefined) layer.minzoom = minzoom;
  const maxzoom = optionalNumber(raw.maxzoom);
  if (maxzoom !== undefined) layer.maxzoom = maxzoom;
  const filter = optionalFilter(raw.filter, `layer[${index}].filter`);
  if (filter !== undefined) layer.filter = filter;
  const layout = optionalPropertyBag(raw.layout, `layer[${index}].layout`);
  if (layout !== undefined) {
    // Property bags are layer-type-specific; structure checked as plain object.
    (layer as { layout?: Record<string, unknown> }).layout = layout;
  }
  const paint = optionalPropertyBag(raw.paint, `layer[${index}].paint`);
  if (paint !== undefined) {
    (layer as { paint?: Record<string, unknown> }).paint = paint;
  }
  if (raw.metadata !== undefined) layer.metadata = raw.metadata;
}

function requireLayerId(raw: Record<string, unknown>, index: number): string {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new StyleError(`Style layer[${index}] missing id`);
  }
  return raw.id;
}

function requireSource(
  raw: Record<string, unknown>,
  index: number,
  type: string,
): string {
  if (typeof raw.source !== "string" || raw.source.length === 0) {
    throw new StyleError(`Style layer[${index}] type ${type} requires source`);
  }
  return raw.source;
}

export function parseLayer(raw: unknown, index: number): LayerSpecification {
  if (!isRecord(raw)) {
    throw new StyleError(`Style layer[${index}] must be an object`);
  }
  const id = requireLayerId(raw, index);

  switch (raw.type) {
    case "background": {
      const layer: BackgroundLayerSpecification = { id, type: "background" };
      const layout = optionalPropertyBag(raw.layout, `layer[${index}].layout`);
      if (layout !== undefined) {
        (layer as { layout?: Record<string, unknown> }).layout = layout;
      }
      const paint = optionalPropertyBag(raw.paint, `layer[${index}].paint`);
      if (paint !== undefined) {
        (layer as { paint?: Record<string, unknown> }).paint = paint;
      }
      if (raw.metadata !== undefined) layer.metadata = raw.metadata;
      return layer;
    }
    case "fill": {
      const layer: FillLayerSpecification = {
        id,
        type: "fill",
        source: requireSource(raw, index, "fill"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "line": {
      const layer: LineLayerSpecification = {
        id,
        type: "line",
        source: requireSource(raw, index, "line"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "symbol": {
      const layer: SymbolLayerSpecification = {
        id,
        type: "symbol",
        source: requireSource(raw, index, "symbol"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "circle": {
      const layer: CircleLayerSpecification = {
        id,
        type: "circle",
        source: requireSource(raw, index, "circle"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "heatmap": {
      const layer: HeatmapLayerSpecification = {
        id,
        type: "heatmap",
        source: requireSource(raw, index, "heatmap"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "fill-extrusion": {
      const layer: FillExtrusionLayerSpecification = {
        id,
        type: "fill-extrusion",
        source: requireSource(raw, index, "fill-extrusion"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "raster": {
      const layer: RasterLayerSpecification = {
        id,
        type: "raster",
        source: requireSource(raw, index, "raster"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    case "hillshade": {
      const layer: HillshadeLayerSpecification = {
        id,
        type: "hillshade",
        source: requireSource(raw, index, "hillshade"),
      };
      attachSourcedLayerFields(layer, raw, index);
      return layer;
    }
    default:
      throw new StyleError(
        `Unsupported layer type "${String(raw.type)}" at layer[${index}]`,
      );
  }
}

/**
 * Validate remote Liberty JSON and construct a StyleSpecification.
 */
export function parseLibertyStyle(raw: unknown): StyleSpecification {
  if (!isRecord(raw)) {
    throw new StyleError("Style JSON must be an object");
  }
  if (raw.version !== 8) {
    throw new StyleError(`Style version must be 8 (got ${String(raw.version)})`);
  }
  if (!isRecord(raw.sources)) {
    throw new StyleError("Style missing sources object");
  }
  if (!Array.isArray(raw.layers)) {
    throw new StyleError("Style missing layers array");
  }

  const sources: { [key: string]: SourceSpecification } = {};
  for (const [key, value] of Object.entries(raw.sources)) {
    sources[key] = parseSource(value, key);
  }

  const layers: LayerSpecification[] = raw.layers.map((layer, index) =>
    parseLayer(layer, index),
  );

  const style: StyleSpecification = {
    version: 8,
    sources,
    layers,
  };

  const name = optionalString(raw.name);
  if (name !== undefined) style.name = name;
  const sprite = optionalString(raw.sprite);
  if (sprite !== undefined) style.sprite = sprite;
  const glyphs = optionalString(raw.glyphs);
  if (glyphs !== undefined) style.glyphs = glyphs;
  if (raw.metadata !== undefined) style.metadata = raw.metadata;

  if (raw.center !== undefined) {
    if (
      !Array.isArray(raw.center) ||
      raw.center.length < 2 ||
      typeof raw.center[0] !== "number" ||
      typeof raw.center[1] !== "number"
    ) {
      throw new StyleError("Style center must be [lng, lat]");
    }
    style.center = [raw.center[0], raw.center[1]];
  }
  const zoom = optionalNumber(raw.zoom);
  if (zoom !== undefined) style.zoom = zoom;
  const bearing = optionalNumber(raw.bearing);
  if (bearing !== undefined) style.bearing = bearing;
  const pitch = optionalNumber(raw.pitch);
  if (pitch !== undefined) style.pitch = pitch;

  return style;
}
