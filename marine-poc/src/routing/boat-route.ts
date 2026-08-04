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
  cells: Map<string, number[]>;
};

const CELL_DEG = 0.25;

const cellKey = (c: number, r: number) => `${c},${r}`;

export const buildLandMask = (
  polygons: PolygonRings[],
  cellDeg = CELL_DEG,
): LandMask => {
  const cells = new Map<string, number[]>();
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

type RouteQuality = "fast" | "precise";

const tryWaterRoute = (
  from: LonLat,
  to: LonLat,
  land: LandQuery,
  pad: number,
  bias: RouteBias,
  quality: RouteQuality = "fast",
): BoatRoute | null => {
  lastRouteFail = null;
  const west = Math.min(from.longitude, to.longitude) - pad;
  const east = Math.max(from.longitude, to.longitude) + pad;
  const south = Math.min(from.latitude, to.latitude) - pad;
  const north = Math.max(from.latitude, to.latitude) + pad;
  const full = asQueryMask(land);
  const mask = buildLandMask(
    filterPolygonsInBBox(full.polygons, west, south, east, north),
  );

  // Keep steps small enough that neighbor edges do not jump islands.
  const width = Math.max(east - west, 0.01);
  const height = Math.max(north - south, 0.01);
  const maxStep = quality === "precise" ? 0.015 : 0.02;
  const maxDim = quality === "precise" ? 280 : 180;
  const cols = Math.min(maxDim, Math.max(64, Math.ceil(width / maxStep) + 1));
  const rows = Math.min(maxDim, Math.max(64, Math.ceil(height / maxStep) + 1));
  const dLon = width / (cols - 1);
  const dLat = height / (rows - 1);
  const midLat = (from.latitude + to.latitude) / 2;

  const idx = (c: number, r: number) => r * cols + c;
  const water = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    const lat = south + r * dLat;
    for (let c = 0; c < cols; c += 1) {
      const lon = west + c * dLon;
      // Center sample only — keep corridors connected; repair clips after A*.
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

  const open = new MinHeap();
  open.push({ ...startW, f: heuristic(startW), g: 0 });
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(startW), 0]]);
  const closed = new Uint8Array(cols * rows);
  // Orthogonal + diagonal (diagonals need both side cells + clear segment).
  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ] as const;

  let found = false;
  let guard = 0;
  const maxExpand = cols * rows * 5;
  const edgeSample = Math.max(0.007, Math.min(dLon, dLat) * 0.6);
  const checkEdges = quality === "precise";
  while (open.size > 0 && guard < maxExpand) {
    guard += 1;
    const current = open.pop()!;
    const ck = key(current);
    if (closed[ck] === 1) continue;
    closed[ck] = 1;
    if (current.c === goalW.c && current.r === goalW.r) {
      found = true;
      break;
    }
    const lon0 = west + current.c * dLon;
    const lat0 = south + current.r * dLat;
    for (const [dc, dr, stepCost] of neighbors) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = idx(nc, nr);
      if (water[nk] !== 1 || closed[nk] === 1) continue;
      if (dc !== 0 && dr !== 0) {
        if (
          water[idx(current.c + dc, current.r)] !== 1 ||
          water[idx(current.c, current.r + dr)] !== 1
        ) {
          continue;
        }
      }
      const lon1 = west + nc * dLon;
      const lat1 = south + nr * dLat;
      if (
        checkEdges &&
        segmentCrossesLand(lon0, lat0, lon1, lat1, mask, edgeSample)
      ) {
        continue;
      }
      const tentative =
        (gScore.get(ck) ?? Infinity) + stepCost * biasCost(lat1);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, ck);
      gScore.set(nk, tentative);
      const node = { c: nc, r: nr };
      open.push({ ...node, g: tentative, f: tentative + heuristic(node) });
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
  // Full path: town → harbor water → sea corridor → harbor water → town.
  const raw: Array<[number, number]> = [
    [from.longitude, from.latitude],
    ...waterCoords,
    [to.longitude, to.latitude],
  ];
  const repaired = repairLandCuts(raw, mask, { allowHarborEnds: true });
  if (!repaired) {
    lastRouteFail = `repair-fail pad=${pad.toFixed(2)} q=${quality} cells=${cells.length}`;
    return null;
  }
  const simplified = simplifyWaterPath(repaired, mask);
  const chosen = pathCrossesLand(simplified, mask, { allowHarborEnds: true })
    ? repaired
    : simplified;

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
): BoatRoute | null => {
  // Keep pads moderate — huge pads make cells so coarse that every edge clips land.
  const pads = [basePad, basePad * 1.7, basePad * 2.6];
  // Prefer precise (edge-safe). Fall back to fast+repair if needed.
  for (const quality of ["precise", "fast"] as const) {
    for (const pad of pads) {
      const route = tryWaterRoute(from, to, land, pad, bias, quality);
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

  const spanLon = Math.abs(to.longitude - from.longitude);
  const spanLat = Math.abs(to.latitude - from.latitude);
  // Pad enough to leave fjords, but not so wide that the grid becomes coarse.
  const basePad = Math.min(
    3.0,
    Math.max(0.7, Math.max(spanLon, spanLat) * 0.55 + 0.25),
  );
  const biases = options.biases ?? (["shortest", "north", "south"] as const);

  const routes: BoatRoute[] = [];
  for (const bias of biases) {
    const pad = bias === "shortest" ? basePad : basePad * 1.2;
    const route = routeWithPads(from, to, mask, bias, pad);
    if (!route) continue;
    if (routes.length === 0) {
      routes.push(route);
      continue;
    }
    if (
      routes.every((existing) =>
        routesAreDistinct(existing.coordinates, route.coordinates),
      )
    ) {
      routes.push(route);
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
