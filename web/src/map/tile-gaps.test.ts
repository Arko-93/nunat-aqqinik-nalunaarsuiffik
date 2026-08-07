import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveKindFor,
  bboxesIntersect,
  demSourceLacksRenderableTiles,
  emptyTileGapState,
  projectGapVisibility,
  TileGapTracker,
  tileBoundsWgs84,
  tileGapZoneForArchive,
  type TileGapMiss,
  type TileGapState,
  type TileManagerRegistry,
  type TileManagerSurface,
} from "./tile-gaps.ts";

const WORLD: [number, number, number, number] = [-180, -85, 180, 85];

const landMiss = (): TileGapMiss => ({ zone: "land", z: 2, x: 0, y: 0 });
const oceanMiss = (): TileGapMiss => ({ zone: "ocean", z: 2, x: 1, y: 0 });

/** Registry where each tile id either has or lacks DEM data. */
function landRegistry(
  tiles: { id: string; hasData: boolean }[],
): TileManagerRegistry {
  const surface: TileManagerSurface = {
    getIds: () => tiles.map((t) => t.id),
    getTileByID: (id) => {
      const found = tiles.find((t) => t.id === id);
      return found ? { hasData: () => found.hasData } : undefined;
    },
  };
  return { "land-relief": surface };
}

describe("archive zone mapping", () => {
  it.each([
    ["ocean-depth-vector.pmtiles", "ocean", false],
    ["ocean-depth-dem.pmtiles", "ocean", true],
    ["land-peaks.pmtiles", "land", true],
    ["land-relief.pmtiles", "land", true],
  ] as const)("maps %s to %s (raster=%s)", (suffix, zone, raster) => {
    expect(tileGapZoneForArchive(`/packages/x/${suffix}`)).toBe(zone);
    expect(archiveKindFor(`/packages/x/${suffix}`)).toEqual({ zone, raster });
  });

  it("ignores archives that are not terrain gap sources", () => {
    expect(
      tileGapZoneForArchive("/packages/coastline-land/land.pmtiles"),
    ).toBeNull();
    expect(
      archiveKindFor("/packages/coastline-land/land.pmtiles"),
    ).toBeNull();
  });
});

describe("tile geographic trimming", () => {
  it("yields world bounds at z0 and overlaps the world viewport", () => {
    const [w, s, e, n] = tileBoundsWgs84(0, 0, 0);
    expect(w).toBeCloseTo(-180);
    expect(e).toBeCloseTo(180);
    expect(s).toBeCloseTo(-85.0511, 1);
    expect(n).toBeCloseTo(85.0511, 1);
    expect(bboxesIntersect(tileBoundsWgs84(2, 0, 0), WORLD)).toBe(true);
  });
});

describe("projectGapVisibility", () => {
  it("marks a zone only when its missing tile is in the viewport", () => {
    const state = projectGapVisibility([landMiss()], WORLD);
    expect(state.land).toBe(true);
    expect(state.ocean).toBe(false);
  });

  it("hides the label when the missing tile is outside the viewport", () => {
    // A small viewport in Antarctica, far from the NW tile at z2 x0 y0.
    const antarctica: [number, number, number, number] = [-30, -80, 30, -60];
    expect(projectGapVisibility([landMiss()], antarctica).land).toBe(false);
  });

  it("combines both zones", () => {
    expect(projectGapVisibility([landMiss(), oceanMiss()], WORLD)).toEqual({
      land: true,
      ocean: true,
    });
  });

  it("ignores empty misses", () => {
    expect(projectGapVisibility([], WORLD)).toEqual(emptyTileGapState());
  });
});

describe("demSourceLacksRenderableTiles", () => {
  it("reports a gap only when claimed tiles all lack data", () => {
    const registry = landRegistry([
      { id: "a", hasData: false },
      { id: "b", hasData: false },
    ]);
    expect(
      demSourceLacksRenderableTiles(registry, "land-relief"),
    ).toBe(true);
  });

  it("reports no gap when any tile carries data", () => {
    const registry = landRegistry([
      { id: "a", hasData: true },
      { id: "b", hasData: false },
    ]);
    expect(
      demSourceLacksRenderableTiles(registry, "land-relief"),
    ).toBe(false);
  });

  it("reports no gap while the source claims no tiles yet", () => {
    expect(
      demSourceLacksRenderableTiles(landRegistry([]), "land-relief"),
    ).toBe(false);
    expect(demSourceLacksRenderableTiles(undefined, "land-relief")).toBe(
      false,
    );
  });
});

describe("TileGapTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const viewport = () => WORLD;

  it("reflects protocol misses for the current viewport", () => {
    const seen: TileGapState[] = [];
    const tracker = new TileGapTracker({
      getViewport: viewport,
      getTileManagers: () => undefined,
      onChange: (state) => seen.push(state),
    });
    tracker.record(landMiss());
    tracker.refresh();
    expect(seen.at(-1)).toEqual({ land: true, ocean: false });
    tracker.dispose();
  });

  it("hides again once the viewport pans off the missing tile", () => {
    const seen: TileGapState[] = [];
    // Tracker pinned to an Antarctic viewport far from the NW z2 tile.
    const tracker = new TileGapTracker({
      getViewport: () => [-30, -80, 30, -60],
      getTileManagers: () => undefined,
      onChange: (state) => seen.push(state),
    });
    tracker.record(landMiss());
    tracker.refresh();
    expect(seen.at(-1)).toEqual(emptyTileGapState());
    tracker.dispose();
  });

  it("debounces recorded misses through the settle window", () => {
    const seen: TileGapState[] = [];
    const tracker = new TileGapTracker({
      getViewport: viewport,
      getTileManagers: () => undefined,
      onChange: (state) => seen.push(state),
      settleMs: 150,
    });
    tracker.record(landMiss());
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(149);
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(seen.at(-1)).toEqual({ land: true, ocean: false });
    tracker.dispose();
  });

  it("probes the remote land source once it has rendered data", () => {
    const seen: TileGapState[] = [];
    let registry = landRegistry([{ id: "a", hasData: true }]);
    const tracker = new TileGapTracker({
      getViewport: viewport,
      getTileManagers: () => registry,
      remoteLandSourceId: "land-relief",
      onChange: (state) => seen.push(state),
    });

    // Latch engages once the DEM rendered at least one tile.
    tracker.refresh();
    expect(seen.at(-1)?.land).toBe(false);

    // Remote DEM now blank in view → land gap via the probe.
    registry = landRegistry([
      { id: "a", hasData: false },
      { id: "b", hasData: false },
    ]);
    tracker.refresh();
    expect(seen.at(-1)).toEqual({ land: true, ocean: false });

    // DEM tiles arrive async (map 'data' event → refresh): label clears
    // rather than staying stuck on a gap that no longer exists.
    registry = landRegistry([
      { id: "a", hasData: true },
      { id: "b", hasData: true },
    ]);
    tracker.refresh();
    expect(seen.at(-1)?.land).toBe(false);
    tracker.dispose();
  });

  it("reset drops recorded misses", () => {
    const seen: TileGapState[] = [];
    const tracker = new TileGapTracker({
      getViewport: viewport,
      getTileManagers: () => undefined,
      onChange: (state) => seen.push(state),
    });
    tracker.record(landMiss());
    tracker.refresh();
    expect(seen.at(-1)?.land).toBe(true);
    tracker.reset();
    expect(seen.at(-1)).toEqual(emptyTileGapState());
    tracker.dispose();
  });
});
