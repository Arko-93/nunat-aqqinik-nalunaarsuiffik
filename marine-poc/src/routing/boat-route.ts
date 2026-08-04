import { haversineDistanceM } from "../domain/trip-metrics.ts";

export type LonLat = { longitude: number; latitude: number };

export type RouteBias = "shortest" | "north" | "south";

export type BoatRoute = {
  id: string;
  label: string;
  bias: RouteBias;
  /** WGS84 [longitude, latitude] path. */
  coordinates: Array<[number, number]>;
  distanceM: number;
  mode: "water" | "straight-fallback";
  cellCount: number;
  warning: string | null;
};

export type BoatRoutePlan = {
  routes: BoatRoute[];
  selectedIndex: number;
};

type Ring = ReadonlyArray<readonly [number, number]>;

type PolygonRings = {
  outer: Ring;
  holes: Ring[];
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

const pointInRing = (lon: number, lat: number, ring: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const ringBBox = (ring: Ring) => {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
};

const asRing = (coords: GeoJSON.Position[]): Ring =>
  coords.map((c) => [Number(c[0]), Number(c[1])] as const);

const collectPolygons = (
  geometry: GeoJSON.Geometry | null | undefined,
  out: PolygonRings[],
) => {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    const outer = asRing(geometry.coordinates[0] ?? []);
    if (outer.length < 4) return;
    const holes = geometry.coordinates.slice(1).map((ring) => asRing(ring));
    out.push({ outer, holes, ...ringBBox(outer) });
    return;
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const outer = asRing(poly[0] ?? []);
      if (outer.length < 4) continue;
      const holes = poly.slice(1).map((ring) => asRing(ring));
      out.push({ outer, holes, ...ringBBox(outer) });
    }
    return;
  }
  // prepare-regions may emit GeometryCollection (many island polygons).
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectPolygons(child, out);
    }
  }
};

export type LandMask = {
  polygons: PolygonRings[];
  /** Spatial hash for fast point-in-land queries. */
  cellDeg: number;
  /** Packed cell key → polygon indices (numeric keys; faster than strings). */
  cells: Map<number, number[]>;
};

const CELL_DEG = 0.25;

/** Pack spatial-hash coordinates into one number (supports negative cells). */
const cellKey = (c: number, r: number): number =>
  (c + 10_000) * 100_003 + (r + 10_000);

export const buildLandMask = (
  polygons: PolygonRings[],
  cellDeg = CELL_DEG,
): LandMask => {
  const cells = new Map<number, number[]>();
  polygons.forEach((poly, index) => {
    const c0 = Math.floor(poly.minLon / cellDeg);
    const c1 = Math.floor(poly.maxLon / cellDeg);
    const r0 = Math.floor(poly.minLat / cellDeg);
    const r1 = Math.floor(poly.maxLat / cellDeg);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const key = cellKey(c, r);
        const bucket = cells.get(key);
        if (bucket) bucket.push(index);
        else cells.set(key, [index]);
      }
    }
  });
  return { polygons, cellDeg, cells };
};

export const extractLandPolygons = (
  land: GeoJSON.FeatureCollection,
): PolygonRings[] => {
  const out: PolygonRings[] = [];
  for (const feature of land.features) {
    const kind = (feature.properties as { kind?: string } | null)?.kind;
    if (kind && kind !== "land") continue;
    collectPolygons(feature.geometry, out);
  }
  return out;
};

export const extractLandMask = (land: GeoJSON.FeatureCollection): LandMask =>
  buildLandMask(extractLandPolygons(land));

export const filterPolygonsInBBox = (
  polygons: ReadonlyArray<PolygonRings>,
  west: number,
  south: number,
  east: number,
  north: number,
): PolygonRings[] =>
  polygons.filter(
    (poly) =>
      poly.maxLon >= west &&
      poly.minLon <= east &&
      poly.maxLat >= south &&
      poly.minLat <= north,
  );

const polygonContains = (
  longitude: number,
  latitude: number,
  poly: PolygonRings,
): boolean => {
  if (
    longitude < poly.minLon ||
    longitude > poly.maxLon ||
    latitude < poly.minLat ||
    latitude > poly.maxLat
  ) {
    return false;
  }
  if (!pointInRing(longitude, latitude, poly.outer)) return false;
  for (const hole of poly.holes) {
    if (pointInRing(longitude, latitude, hole)) return false;
  }
  return true;
};

const isLandMask = (
  value: ReadonlyArray<PolygonRings> | LandMask,
): value is LandMask =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "cells" in value &&
  (value as LandMask).cells instanceof Map;

export const pointOnLand = (
  longitude: number,
  latitude: number,
  polygons: ReadonlyArray<PolygonRings> | LandMask,
): boolean => {
  if (!isLandMask(polygons)) {
    for (const poly of polygons) {
      if (polygonContains(longitude, latitude, poly)) return true;
    }
    return false;
  }
  const c = Math.floor(longitude / polygons.cellDeg);
  const r = Math.floor(latitude / polygons.cellDeg);
  const bucket = polygons.cells.get(cellKey(c, r));
  if (!bucket) return false;
  for (const index of bucket) {
    const poly = polygons.polygons[index];
    if (poly && polygonContains(longitude, latitude, poly)) return true;
  }
  return false;
};

/**
 * Nearest water sample around a point (spiral search).
 * Used to put boat A/B on the shore instead of a town midpoint on land.
 */
export const nearestWaterPoint = (
  longitude: number,
  latitude: number,
  land: LandMask | ReadonlyArray<PolygonRings>,
  options: { maxRadiusDeg?: number; stepDeg?: number } = {},
): LonLat | null => {
  if (!pointOnLand(longitude, latitude, land)) {
    return { longitude, latitude };
  }
  const maxRadius = options.maxRadiusDeg ?? 0.35;
  const step = options.stepDeg ?? 0.008;
  let best: LonLat | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let radius = step; radius <= maxRadius; radius += step) {
    const samples = Math.max(12, Math.ceil((Math.PI * 2 * radius) / step));
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const lon = longitude + Math.cos(angle) * radius;
      const lat = latitude + Math.sin(angle) * radius;
      if (pointOnLand(lon, lat, land)) continue;
      const d = Math.hypot(lon - longitude, lat - latitude);
      if (d < bestD) {
        bestD = d;
        best = { longitude: lon, latitude: lat };
      }
    }
    if (best) return best;
  }
  return best;
};

/**
 * True if the straight segment between two points crosses land.
 * Samples densely so island cuts cannot hide between grid cells.
 */
export const segmentCrossesLand = (
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  land: LandMask | ReadonlyArray<PolygonRings>,
  sampleEveryDeg = 0.004,
): boolean => {
  const dist = Math.hypot(lon2 - lon1, lat2 - lat1);
  const steps = Math.max(2, Math.ceil(dist / sampleEveryDeg));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const lon = lon1 + (lon2 - lon1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    if (pointOnLand(lon, lat, land)) return true;
  }
  return false;
};

/** Harbor stubs (town→first water / last water→town) may touch shore briefly. */
export const pathCrossesLand = (
  coords: ReadonlyArray<readonly [number, number]>,
  land: LandMask | ReadonlyArray<PolygonRings>,
  options: { allowHarborEnds?: boolean } = {},
): boolean => {
  if (coords.length < 2) return false;
  const allowEnds = options.allowHarborEnds ?? true;
  const start = allowEnds ? 1 : 0;
  const end = allowEnds ? coords.length - 2 : coords.length - 1;
  for (let i = start; i < end; i += 1) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    if (segmentCrossesLand(a[0], a[1], b[0], b[1], land)) return true;
  }
  return false;
};

const pathDistanceM = (coords: ReadonlyArray<[number, number]>): number => {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    total += haversineDistanceM(lat1, lon1, lat2, lon2);
  }
  return total;
};

/**
 * String-pull simplification: skip vertices only when the shortcut stays on water.
 */
export const simplifyWaterPath = (
  coords: Array<[number, number]>,
  land: LandMask,
): Array<[number, number]> => {
  if (coords.length <= 2) return coords;
  const out: Array<[number, number]> = [coords[0]!];
  let anchor = 0;
  for (let i = 2; i < coords.length; i += 1) {
    const a = coords[anchor]!;
    const b = coords[i]!;
    // Never shortcut across the harbor stubs' outer endpoints loosely —
    // require clear water between pulled points.
    if (segmentCrossesLand(a[0], a[1], b[0], b[1], land)) {
      out.push(coords[i - 1]!);
      anchor = i - 1;
    }
  }
  const last = coords[coords.length - 1]!;
  if (
    out[out.length - 1]![0] !== last[0] ||
    out[out.length - 1]![1] !== last[1]
  ) {
    out.push(last);
  }
  return out;
};

export const straightBoatRoute = (
  from: LonLat,
  to: LonLat,
  warning = "Straight preview",
): BoatRoute => {
  const coordinates: Array<[number, number]> = [
    [from.longitude, from.latitude],
    [to.longitude, to.latitude],
  ];
  return {
    id: "straight",
    label: "Direct",
    bias: "shortest",
    coordinates,
    distanceM: pathDistanceM(coordinates),
    mode: "straight-fallback",
    cellCount: 0,
    warning,
  };
};

type Node = { c: number; r: number };

/** Binary min-heap on f-score. */
class MinHeap {
  private items: Array<{ f: number; g: number; c: number; r: number }> = [];

  get size() {
    return this.items.length;
  }

  push(item: { f: number; g: number; c: number; r: number }) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return undefined;
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.f <= this.items[i]!.f) break;
      const tmp = this.items[parent]!;
      this.items[parent] = this.items[i]!;
      this.items[i] = tmp;
      i = parent;
    }
  }

  private bubbleDown(i: number) {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < n && this.items[left]!.f < this.items[smallest]!.f) {
        smallest = left;
      }
      if (right < n && this.items[right]!.f < this.items[smallest]!.f) {
        smallest = right;
      }
      if (smallest === i) break;
      const tmp = this.items[i]!;
      this.items[i] = this.items[smallest]!;
      this.items[smallest] = tmp;
      i = smallest;
    }
  }
}

const LABEL: Record<RouteBias, string> = {
  shortest: "Shortest water",
  north: "Around north",
  south: "Around south",
};

type LandQuery = ReadonlyArray<PolygonRings> | LandMask;

const asQueryMask = (land: LandQuery): LandMask =>
  isLandMask(land) ? land : buildLandMask([...land]);

/**
 * If a sea segment clips land, insert an offshore waypoint on the clear side.
 * Repeats until the corridor is clear or attempts are exhausted.
 */
export const repairLandCuts = (
  coords: Array<[number, number]>,
  land: LandMask,
  options: { allowHarborEnds?: boolean } = {},
): Array<[number, number]> | null => {
  const allowEnds = options.allowHarborEnds ?? true;
  let path = coords.slice();
  for (let pass = 0; pass < 24; pass += 1) {
    let dirty = false;
    const next: Array<[number, number]> = [path[0]!];
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const isHarbor =
        allowEnds && (i === 0 || i === path.length - 2);
      if (
        !isHarbor &&
        segmentCrossesLand(a[0], a[1], b[0], b[1], land, 0.0035)
      ) {
        dirty = true;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const base = Math.max(0.018, len * 0.2);
        const px = (-dy / len) * base;
        const py = (dx / len) * base;
        let inserted: Array<[number, number]> | null = null;
        for (const scale of [1, 1.4, 2, 2.8, 4, 5.5, 7.5, 10, 13]) {
          for (const sign of [1, -1] as const) {
            const cand: [number, number] = [
              mx + px * scale * sign,
              my + py * scale * sign,
            ];
            if (pointOnLand(cand[0], cand[1], land)) continue;
            if (
              segmentCrossesLand(a[0], a[1], cand[0], cand[1], land, 0.0035)
            ) {
              continue;
            }
            if (
              segmentCrossesLand(cand[0], cand[1], b[0], b[1], land, 0.0035)
            ) {
              continue;
            }
            inserted = [cand];
            break;
          }
          if (inserted) break;
          // Two-point offshore detour when one waypoint is not enough.
          for (const sign of [1, -1] as const) {
            const c1: [number, number] = [
              a[0] + dx / 3 + px * scale * sign,
              a[1] + dy / 3 + py * scale * sign,
            ];
            const c2: [number, number] = [
              a[0] + (2 * dx) / 3 + px * scale * sign,
              a[1] + (2 * dy) / 3 + py * scale * sign,
            ];
            if (pointOnLand(c1[0], c1[1], land) || pointOnLand(c2[0], c2[1], land)) {
              continue;
            }
            if (
              segmentCrossesLand(a[0], a[1], c1[0], c1[1], land, 0.0035) ||
              segmentCrossesLand(c1[0], c1[1], c2[0], c2[1], land, 0.0035) ||
              segmentCrossesLand(c2[0], c2[1], b[0], b[1], land, 0.0035)
            ) {
              continue;
            }
            inserted = [c1, c2];
            break;
          }
          if (inserted) break;
        }
        if (!inserted) return null;
        next.push(...inserted);
      }
      next.push(b);
    }
    path = next;
    if (!dirty) {
      return pathCrossesLand(path, land, { allowHarborEnds: allowEnds })
        ? null
        : path;
    }
  }
  return null;
};

let lastRouteFail: string | null = null;

export const getLastRouteFail = () => lastRouteFail;

type RouteQuality = "coarse" | "fast" | "precise";

const tryWaterRoute = (
  from: LonLat,
  to: LonLat,
  land: LandQuery,
  pad: number,
  bias: RouteBias,
  quality: RouteQuality = "fast",
  deadlineMs: number | null = null,
): BoatRoute | null => {
  if (deadlineMs != null && performance.now() > deadlineMs) {
    lastRouteFail = "deadline";
    return null;
  }
  lastRouteFail = null;
  const west = Math.min(from.longitude, to.longitude) - pad;
  const east = Math.max(from.longitude, to.longitude) + pad;
  const south = Math.min(from.latitude, to.latitude) - pad;
  const north = Math.max(from.latitude, to.latitude) + pad;
  const full = asQueryMask(land);
  const mask = buildLandMask(
    filterPolygonsInBBox(full.polygons, west, south, east, north),
  );

  // Coarse-first grids stay small; precise uses a tighter step but grid edge tests
  // (not polygon PIP) so A* stays fast.
  const width = Math.max(east - west, 0.01);
  const height = Math.max(north - south, 0.01);
  const spanBox = Math.max(width, height);
  const longHaul = spanBox >= 8;
  const mediumHaul = !longHaul && spanBox >= 4;
  const maxStep =
    quality === "precise"
      ? 0.018
      : quality === "coarse"
        ? longHaul
          ? 0.06
          : 0.04
        : longHaul
          ? 0.05
          : mediumHaul
            ? 0.03
            : 0.022;
  const maxDim =
    quality === "precise"
      ? 220
      : quality === "coarse"
        ? longHaul
          ? 110
          : 140
        : longHaul
          ? 140
          : mediumHaul
            ? 180
            : 160;
  const cols = Math.min(maxDim, Math.max(48, Math.ceil(width / maxStep) + 1));
  const rows = Math.min(maxDim, Math.max(48, Math.ceil(height / maxStep) + 1));
  const dLon = width / (cols - 1);
  const dLat = height / (rows - 1);
  const midLat = (from.latitude + to.latitude) / 2;

  const idx = (c: number, r: number) => r * cols + c;
  const water = new Uint8Array(cols * rows);
  // Center-only fill (1 PIP/cell). Edge-safe A* keeps routes off land.
  for (let r = 0; r < rows; r += 1) {
    if (
      deadlineMs != null &&
      r % 16 === 0 &&
      performance.now() > deadlineMs
    ) {
      lastRouteFail = `deadline-fill pad=${pad.toFixed(2)} grid=${cols}x${rows}`;
      return null;
    }
    const lat = south + r * dLat;
    for (let c = 0; c < cols; c += 1) {
      const lon = west + c * dLon;
      water[idx(c, r)] = pointOnLand(lon, lat, mask) ? 0 : 1;
    }
  }

  const toCell = (longitude: number, latitude: number) => {
    const c = Math.round((longitude - west) / dLon);
    const r = Math.round((latitude - south) / dLat);
    return {
      c: Math.min(cols - 1, Math.max(0, c)),
      r: Math.min(rows - 1, Math.max(0, r)),
    };
  };

  const start = toCell(from.longitude, from.latitude);
  const goal = toCell(to.longitude, to.latitude);
  // Do NOT force start/goal cells to water — that punches holes through land.

  const snapToWater = (c0: number, r0: number): Node | null => {
    if (water[idx(c0, r0)] === 1) return { c: c0, r: r0 };
    let bestC = c0;
    let bestR = r0;
    let bestD = Number.POSITIVE_INFINITY;
    let foundWater = false;
    const maxRad = Math.max(20, Math.ceil(0.18 / Math.max(dLon, dLat)));
    for (let rad = 1; rad <= maxRad; rad += 1) {
      for (let dr = -rad; dr <= rad; dr += 1) {
        for (let dc = -rad; dc <= rad; dc += 1) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          if (water[idx(c, r)] !== 1) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            bestC = c;
            bestR = r;
            foundWater = true;
          }
        }
      }
      if (foundWater) return { c: bestC, r: bestR };
    }
    return null;
  };

  const startW = snapToWater(start.c, start.r);
  const goalW = snapToWater(goal.c, goal.r);
  if (!startW || !goalW) {
    lastRouteFail = `snap-fail pad=${pad.toFixed(2)} start=${!!startW} goal=${!!goalW} grid=${cols}x${rows}`;
    return null;
  }

  const key = (n: Node) => n.r * cols + n.c;
  const heuristic = (n: Node) => {
    const lon = west + n.c * dLon;
    const lat = south + n.r * dLat;
    const goalLon = west + goalW.c * dLon;
    const goalLat = south + goalW.r * dLat;
    return Math.hypot(lon - goalLon, lat - goalLat);
  };

  const biasCost = (lat: number): number => {
    if (bias === "shortest") return 1;
    const delta = lat - midLat;
    if (bias === "north") return delta < 0 ? 1.55 : 0.92;
    return delta > 0 ? 1.55 : 0.92;
  };

  // Lazy edge memo: 0 unknown, 1 clear, 2 blocked. Avoids re-PIP on A* revisits.
  const canRight = new Uint8Array(cols * rows);
  const canUp = new Uint8Array(cols * rows);
  const edgeClear = (c0: number, r0: number, c1: number, r1: number): boolean => {
    const lon0 = west + c0 * dLon;
    const lat0 = south + r0 * dLat;
    const lon1 = west + c1 * dLon;
    const lat1 = south + r1 * dLat;
    for (const t of [0.25, 0.5, 0.75] as const) {
      if (
        pointOnLand(
          lon0 + (lon1 - lon0) * t,
          lat0 + (lat1 - lat0) * t,
          mask,
        )
      ) {
        return false;
      }
    }
    return true;
  };
  const linkClear = (c0: number, r0: number, c1: number, r1: number): boolean => {
    if (r1 === r0 && c1 === c0 + 1) {
      const i = idx(c0, r0);
      if (canRight[i] === 0) canRight[i] = edgeClear(c0, r0, c1, r1) ? 1 : 2;
      return canRight[i] === 1;
    }
    if (r1 === r0 && c1 === c0 - 1) {
      const i = idx(c1, r1);
      if (canRight[i] === 0) canRight[i] = edgeClear(c1, r1, c0, r0) ? 1 : 2;
      return canRight[i] === 1;
    }
    if (c1 === c0 && r1 === r0 + 1) {
      const i = idx(c0, r0);
      if (canUp[i] === 0) canUp[i] = edgeClear(c0, r0, c1, r1) ? 1 : 2;
      return canUp[i] === 1;
    }
    if (c1 === c0 && r1 === r0 - 1) {
      const i = idx(c1, r1);
      if (canUp[i] === 0) canUp[i] = edgeClear(c1, r1, c0, r0) ? 1 : 2;
      return canUp[i] === 1;
    }
    return false;
  };

  const open = new MinHeap();
  // Weighted A* (ε>1): fewer expansions, slightly longer corridors — fine for POC.
  const epsilon = quality === "precise" ? 1.15 : quality === "fast" ? 1.4 : 1.65;
  open.push({ ...startW, f: heuristic(startW) * epsilon, g: 0 });
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(startW), 0]]);
  const closed = new Uint8Array(cols * rows);
  // Orthogonal steps only — diagonals clip thin islands between cell centers.
  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
  ] as const;

  let found = false;
  let guard = 0;
  const maxExpand = cols * rows * (longHaul ? 3 : mediumHaul ? 4 : 5);
  while (open.size > 0 && guard < maxExpand) {
    if (deadlineMs != null && guard % 4096 === 0 && performance.now() > deadlineMs) {
      lastRouteFail = `deadline pad=${pad.toFixed(2)} grid=${cols}x${rows}`;
      return null;
    }
    guard += 1;
    const current = open.pop()!;
    const ck = key(current);
    if (closed[ck] === 1) continue;
    closed[ck] = 1;
    if (current.c === goalW.c && current.r === goalW.r) {
      found = true;
      break;
    }
    for (const [dc, dr, stepCost] of neighbors) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = idx(nc, nr);
      if (water[nk] !== 1 || closed[nk] === 1) continue;
      if (!linkClear(current.c, current.r, nc, nr)) continue;
      const lat1 = south + nr * dLat;
      const tentative =
        (gScore.get(ck) ?? Infinity) + stepCost * biasCost(lat1);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, ck);
      gScore.set(nk, tentative);
      const node = { c: nc, r: nr };
      open.push({
        ...node,
        g: tentative,
        f: tentative + heuristic(node) * epsilon,
      });
    }
  }

  if (!found) {
    lastRouteFail = `astar-fail pad=${pad.toFixed(2)} grid=${cols}x${rows} expand=${guard} water=${water.reduce((a, b) => a + b, 0)}`;
    return null;
  }

  const cells: Node[] = [];
  let cursor: number | undefined = key(goalW);
  while (cursor != null) {
    cells.push({ c: cursor % cols, r: Math.floor(cursor / cols) });
    cursor = cameFrom.get(cursor);
  }
  cells.reverse();

  const waterCoords: Array<[number, number]> = cells.map(
    (cell) =>
      [west + cell.c * dLon, south + cell.r * dLat] as [number, number],
  );

  // Edge-safe A* corridor + shore stubs. Skip heavy repairLandCuts (slow).
  const raw: Array<[number, number]> = [
    [from.longitude, from.latitude],
    ...waterCoords,
    [to.longitude, to.latitude],
  ];
  let chosen = raw;
  if (pathCrossesLand(chosen, mask, { allowHarborEnds: true })) {
    const fixSeg = (
      a: [number, number],
      b: [number, number],
      depth: number,
    ): Array<[number, number]> | null => {
      if (!segmentCrossesLand(a[0], a[1], b[0], b[1], mask, 0.004)) {
        return [a, b];
      }
      if (depth <= 0) return null;
      const wet = nearestWaterPoint((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, mask, {
        maxRadiusDeg: Math.max(dLon, dLat) * 3,
        stepDeg: Math.min(dLon, dLat) * 0.3,
      });
      if (!wet) return null;
      const mid: [number, number] = [wet.longitude, wet.latitude];
      const left = fixSeg(a, mid, depth - 1);
      const right = fixSeg(mid, b, depth - 1);
      if (!left || !right) return null;
      return [...left, ...right.slice(1)];
    };
    const densify = (
      coords: Array<[number, number]>,
    ): Array<[number, number]> | null => {
      const out: Array<[number, number]> = [coords[0]!];
      for (let i = 1; i < coords.length; i += 1) {
        const fixed = fixSeg(out[out.length - 1]!, coords[i]!, 4);
        if (!fixed) return null;
        out.push(...fixed.slice(1));
      }
      return out;
    };
    chosen = densify(raw) ?? densify(waterCoords);
    if (!chosen || pathCrossesLand(chosen, mask, { allowHarborEnds: true })) {
      lastRouteFail = `repair-fail pad=${pad.toFixed(2)} q=${quality} cells=${cells.length}`;
      return null;
    }
  }
  const simplified = simplifyWaterPath(chosen, mask);
  if (!pathCrossesLand(simplified, mask, { allowHarborEnds: true })) {
    chosen = simplified;
  }

  if (pathCrossesLand(chosen, mask, { allowHarborEnds: true })) {
    lastRouteFail = `validate-fail pad=${pad.toFixed(2)} q=${quality} pts=${chosen.length}`;
    return null;
  }

  return {
    id: bias,
    label: LABEL[bias],
    bias,
    coordinates: chosen,
    distanceM: pathDistanceM(chosen),
    mode: "water",
    cellCount: cells.length,
    warning: null,
  };
};

const routeWithPads = (
  from: LonLat,
  to: LonLat,
  land: LandQuery,
  bias: RouteBias,
  basePad: number,
  options: {
    deadlineMs?: number | null;
    precise?: boolean;
    /** Endpoint span in degrees — used to pick quality ladder. */
    spanDeg?: number;
  } = {},
): BoatRoute | null => {
  const deadlineMs = options.deadlineMs ?? null;
  const spanDeg = options.spanDeg ?? 0;
  // Keep the search box in the medium-haul regime when possible.
  // Over-wide pads force a coarse long-haul grid that fails edge-safe A*.
  const pads =
    spanDeg >= 2 && spanDeg < 5
      ? [basePad, basePad * 1.7, basePad * 2.4]
      : [basePad * 1.35, basePad, basePad * 2.1];
  // Coarse-first for medium/long coastal hops; precise only if needed.
  let qualities: RouteQuality[];
  if (options.precise === false) {
    qualities = ["coarse", "fast"];
  } else if (spanDeg >= 1.0) {
    qualities = ["coarse", "fast", "precise"];
  } else {
    qualities = ["fast", "precise"];
  }
  for (const quality of qualities) {
    const padList = quality === "precise" ? pads : pads.slice(0, 2);
    for (const pad of padList) {
      if (deadlineMs != null && performance.now() > deadlineMs) {
        lastRouteFail = "deadline";
        return null;
      }
      const attemptT0 = performance.now();
      const route = tryWaterRoute(
        from,
        to,
        land,
        pad,
        bias,
        quality,
        deadlineMs,
      );
      if (typeof process !== "undefined" && process.env?.ROUTE_DEBUG) {
        console.error(
          `[route] ${quality} pad=${pad.toFixed(2)} ${route ? "ok" : lastRouteFail} ${(performance.now() - attemptT0).toFixed(0)}ms`,
        );
      }
      if (route) return route;
    }
  }
  return null;
};

/** True if two paths take a clearly different corridor. */
export const routesAreDistinct = (
  a: ReadonlyArray<readonly [number, number]>,
  b: ReadonlyArray<readonly [number, number]>,
): boolean => {
  if (a.length < 2 || b.length < 2) return false;
  const sample = (coords: ReadonlyArray<readonly [number, number]>) => {
    const mid = coords[Math.floor(coords.length / 2)]!;
    const q1 = coords[Math.floor(coords.length / 4)]!;
    const q3 = coords[Math.floor((coords.length * 3) / 4)]!;
    return [q1, mid, q3];
  };
  const as = sample(a);
  const bs = sample(b);
  let maxSep = 0;
  for (let i = 0; i < 3; i += 1) {
    maxSep = Math.max(
      maxSep,
      Math.hypot(as[i]![0] - bs[i]![0], as[i]![1] - bs[i]![1]),
    );
  }
  // ~0.08° ≈ 3–9 km at Greenland latitudes — enough to count as another way.
  return maxSep > 0.08;
};

/**
 * Grid A* through water cells, avoiding land polygons.
 * Companion routing only — not for navigation.
 */
export const planBoatRoute = (
  from: LonLat,
  to: LonLat,
  land: GeoJSON.FeatureCollection | LandMask | PolygonRings[],
): BoatRoute => {
  const plan = planBoatRoutes(from, to, land, {
    biases: ["shortest"],
  });
  return plan.routes[plan.selectedIndex] ?? straightBoatRoute(from, to);
};

export type PlanBoatRoutesOptions = {
  /** Which corridors to search. Default: shortest + north + south. */
  biases?: ReadonlyArray<RouteBias>;
  /** Wall-clock budget; after this, return best found or straight fallback. */
  budgetMs?: number;
  /** When false, skip precise (edge-safe) refinement. Default: auto by span. */
  precise?: boolean;
};

/**
 * Several water corridors (shortest / north / south) when they differ.
 * Always returns at least one route (straight fallback if needed).
 */
export const planBoatRoutes = (
  from: LonLat,
  to: LonLat,
  land: GeoJSON.FeatureCollection | LandMask | PolygonRings[],
  options: PlanBoatRoutesOptions = {},
): BoatRoutePlan => {
  const mask: LandMask = isLandMask(land as LandQuery)
    ? (land as LandMask)
    : Array.isArray(land)
      ? buildLandMask(land)
      : extractLandMask(land as GeoJSON.FeatureCollection);
  if (mask.polygons.length === 0) {
    const only = straightBoatRoute(from, to, "No land mask — straight line only.");
    return { routes: [only], selectedIndex: 0 };
  }

  // Town midpoints often sit inland — sail from the nearest shore water.
  const fromShore =
    nearestWaterPoint(from.longitude, from.latitude, mask) ?? from;
  const toShore = nearestWaterPoint(to.longitude, to.latitude, mask) ?? to;

  const spanLon = Math.abs(toShore.longitude - fromShore.longitude);
  const spanLat = Math.abs(toShore.latitude - fromShore.latitude);
  const span = Math.max(spanLon, spanLat);
  // Pad enough to leave fjords, but not so wide that the grid becomes coarse.
  const basePad = Math.min(
    span >= 3 ? 2.2 : 3.0,
    Math.max(0.7, span * 0.55 + 0.25),
  );
  const biases = options.biases ?? (["shortest", "north", "south"] as const);
  // Coarse-first keeps medium hops interactive; worker still preferred in the UI.
  const budgetMs =
    options.budgetMs ?? (span >= 4 ? 8_000 : span >= 1 ? 14_000 : 5_000);
  const deadlineMs = performance.now() + budgetMs;
  const precise = options.precise ?? true;

  const attachHarborStubs = (route: BoatRoute): BoatRoute => {
    const start: [number, number] = [from.longitude, from.latitude];
    const end: [number, number] = [to.longitude, to.latitude];
    const head = route.coordinates[0]!;
    const tail = route.coordinates[route.coordinates.length - 1]!;
    const needHead = head[0] !== start[0] || head[1] !== start[1];
    const needTail = tail[0] !== end[0] || tail[1] !== end[1];
    if (!needHead && !needTail) return route;
    const coords: Array<[number, number]> = [
      ...(needHead ? [start] : []),
      ...route.coordinates,
      ...(needTail ? [end] : []),
    ];
    return {
      ...route,
      coordinates: coords,
      distanceM: pathDistanceM(coords),
    };
  };

  const routes: BoatRoute[] = [];
  for (const bias of biases) {
    if (performance.now() > deadlineMs) break;
    const pad = bias === "shortest" ? basePad : basePad * 1.2;
    const route = routeWithPads(fromShore, toShore, mask, bias, pad, {
      deadlineMs,
      precise,
      spanDeg: span,
    });
    if (!route) continue;
    const withStubs = attachHarborStubs(route);
    if (routes.length === 0) {
      routes.push(withStubs);
      continue;
    }
    if (
      routes.every((existing) =>
        routesAreDistinct(existing.coordinates, withStubs.coordinates),
      )
    ) {
      routes.push(withStubs);
    }
  }

  if (routes.length === 0) {
    const only = straightBoatRoute(
      from,
      to,
      "No water path found — showing straight line.",
    );
    return { routes: [only], selectedIndex: 0 };
  }

  if (biases.length > 1) {
    routes.sort((a, b) => a.distanceM - b.distanceM);
  }
  return { routes, selectedIndex: 0 };
};
