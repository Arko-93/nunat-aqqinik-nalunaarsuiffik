/**
 * Tile-gap labelling (issue #26).
 *
 * Where land DEM / land-peak or ocean-depth tiles are absent, the map must
 * say so instead of letting users read empty space as flat sea or empty
 * land. Detection is driven by the pmtiles protocol (deterministic: a
 * requested tile that resolves empty IS a gap) plus, for the remote
 * Mapterhorn land-relief source, a probe of whether any in-view DEM tile
 * actually carries data.
 *
 * The label itself is quiet chrome (a DOM chip over the map), never a style
 * symbol layer — it must not compete with NunaGIS official place names.
 */

export type TileGapZone = "land" | "ocean";

/** One absent tile as reported by the pmtiles protocol. */
export type TileGapMiss = {
  zone: TileGapZone;
  z: number;
  x: number;
  y: number;
};

export type TileGapState = {
  /** Land DEM (hillshade + peak bands) absent in the current viewport. */
  land: boolean;
  /** Ocean depth (fills/contours/hillshade) absent in the current viewport. */
  ocean: boolean;
};

export function emptyTileGapState(): TileGapState {
  return { land: false, ocean: false };
}

/**
 * Which terrain zone each pmtiles archive belongs to, and whether it stores
 * raster (image/DEM) or vector (MVT) tiles. Unknown archives (e.g. the
 * coastline mask) are not gap sources.
 */
type ArchiveKind = { zone: TileGapZone; raster: boolean };

const ARCHIVE_KINDS: ReadonlyArray<{ suffix: string } & ArchiveKind> = [
  { suffix: "ocean-depth-vector.pmtiles", zone: "ocean", raster: false },
  { suffix: "ocean-depth-dem.pmtiles", zone: "ocean", raster: true },
  { suffix: "land-peaks.pmtiles", zone: "land", raster: true },
  { suffix: "land-relief.pmtiles", zone: "land", raster: true },
];

/** Map a protocol archive path to its terrain zone + storage type. */
export function archiveKindFor(archivePath: string): ArchiveKind | null {
  for (const entry of ARCHIVE_KINDS) {
    if (archivePath.endsWith(entry.suffix)) {
      return { zone: entry.zone, raster: entry.raster };
    }
  }
  return null;
}

export function tileGapZoneForArchive(archivePath: string): TileGapZone | null {
  return archiveKindFor(archivePath)?.zone ?? null;
}

/** WGS84 bbox as [west, south, east, north]. */
export type BBox = readonly [number, number, number, number];

function mercatorYToLatitude(y: number): number {
  const clamped = Math.max(0, Math.min(1, y));
  return (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * clamped)));
}

/** Geographic bounds of one slippy-map tile at z/x/y. */
export function tileBoundsWgs84(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  // Rows count top (y = 0 = north) to bottom (y = n = south).
  const north = mercatorYToLatitude(y / n);
  const south = mercatorYToLatitude((y + 1) / n);
  return [west, south, east, north];
}

/** Inclusive-ish overlap test for two [w, s, e, n] boxes. */
export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/**
 * Which zones are gapped for the current viewport, given the tiles the
 * protocol has seen resolve empty. Pure — the unit-testable core.
 */
export function projectGapVisibility(
  misses: ReadonlyArray<TileGapMiss>,
  viewport: BBox,
): TileGapState {
  const state = emptyTileGapState();
  for (const miss of misses) {
    if (!bboxesIntersect(tileBoundsWgs84(miss.z, miss.x, miss.y), viewport)) {
      continue;
    }
    if (miss.zone === "land") state.land = true;
    else state.ocean = true;
    if (state.land && state.ocean) break;
  }
  return state;
}

/**
 * Narrow surface of MapLibre's per-source tile manager (`map.style
 * .tileManagers[sourceId]`). Kept as a seam so the DEM probe is testable
 * without a live MapLibre instance.
 */
export type TileManagerSurface = {
  getIds?: () => string[];
  getTileByID?: (id: string) => { hasData(): boolean } | undefined;
};

export type TileManagerRegistry = Record<string, TileManagerSurface | undefined>;

/**
 * True when the source's in-view tiles exist but none carries data — the
 * remote-land (Mapterhorn) gap signal, where tiles arrive via a plain URL
 * source the pmtiles protocol cannot observe.
 */
export function demSourceLacksRenderableTiles(
  registry: TileManagerRegistry | undefined,
  sourceId: string,
): boolean {
  const tm = registry?.[sourceId];
  if (!tm || typeof tm.getIds !== "function") return false;
  const ids = tm.getIds();
  if (ids.length === 0) return false; // nothing claimed yet — not a gap.
  return ids.every((id) => !tm.getTileByID?.(id)?.hasData());
}

export type TileGapTrackerDeps = {
  /** Current viewport bbox, or null while the map is not usable. */
  getViewport: () => BBox | null;
  /** MapLibre per-source tile managers (may be absent pre-style). */
  getTileManagers: () => TileManagerRegistry | undefined;
  /** Source id of the remote land DEM (probed when it is a plain URL). */
  remoteLandSourceId?: string;
  /** Debounce window before a recompute lands (ms). */
  settleMs?: number;
  onChange: (state: Readonly<TileGapState>) => void;
};

/**
 * Session-scoped gap tracker: collects protocol-reported misses and
 * re-projects them against the current viewport whenever the map settles.
 * Keeps the label truthful across the offline corridor — panning past pack
 * tiles resolves empty through the same protocol path.
 */
export class TileGapTracker {
  private misses: TileGapMiss[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** Remote DEM probe only fires after that source once rendered data. */
  private landEverHadData = false;
  private readonly settleMs: number;

  constructor(private readonly deps: TileGapTrackerDeps) {
    this.settleMs = deps.settleMs ?? 150;
  }

  /** Record an empty tile reported by the pmtiles protocol. */
  record(miss: TileGapMiss): void {
    if (this.disposed) return;
    this.misses.push(miss);
    // Bounded: stale misses age out of the window, not the memory.
    if (this.misses.length > 4096) {
      this.misses = this.misses.slice(-2048);
    }
    this.schedule();
  }

  /** Recompute the label now (map settled: moveend/zoomend/style load). */
  refresh(): void {
    if (this.disposed) return;
    this.updateLandLatch();
    const viewport = this.deps.getViewport();
    const state = viewport
      ? projectGapVisibility(this.misses, viewport)
      : emptyTileGapState();
    if (viewport && this.landEverHadData && this.deps.remoteLandSourceId) {
      const registry = this.deps.getTileManagers();
      if (
        demSourceLacksRenderableTiles(
          registry,
          this.deps.remoteLandSourceId,
        )
      ) {
        state.land = true;
      }
    }
    this.deps.onChange(state);
  }

  /** Drop recorded misses (style/source reset). */
  reset(): void {
    this.misses = [];
    this.landEverHadData = false;
    this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer != null || this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, this.settleMs);
  }

  private updateLandLatch(): void {
    if (this.landEverHadData || !this.deps.remoteLandSourceId) return;
    const registry = this.deps.getTileManagers();
    const tm = registry?.[this.deps.remoteLandSourceId];
    const ids = tm?.getIds?.() ?? [];
    this.landEverHadData = ids.some(
      (id) => tm?.getTileByID?.(id)?.hasData() === true,
    );
  }
}
