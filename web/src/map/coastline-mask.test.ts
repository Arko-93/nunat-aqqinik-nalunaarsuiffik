/**
 * Coastline-mask geometry regression (issue #16).
 *
 * Deterministic fixtures around Qaarsut and Naajaat pin the shared-coastline
 * contract: fixture bathymetry (real Open Waters Seascape `depare` bands and
 * `contours`) must not intersect the land-mask fixtures once clipped to the
 * same coastline. The raw fixtures DO cross land — that is the defect this
 * test guards against — so removing the clip (or drifting the shoreline)
 * fails the test.
 *
 * The clip helpers below are the reference implementation of the production
 * contract (clip depth bands and contours to the shared coastline before
 * tiling). V1 repairs the display with the mask layer; the IBCAO/GEBCO
 * tiling pipeline must apply this same clip.
 */

import { describe, expect, it } from "vitest";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import area from "@turf/area";
import difference from "@turf/difference";
import distance from "@turf/distance";
import intersect from "@turf/intersect";
import lineIntersect from "@turf/line-intersect";
import lineSplit from "@turf/line-split";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { featureCollection, lineString, multiPoint } from "@turf/helpers";
import { readFileSync } from "node:fs";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

type LandGeom = Polygon | MultiPolygon;
type BathymetryGeom = Polygon | MultiPolygon | LineString | MultiLineString;
type BathymetryFeature = Feature<BathymetryGeom>;

const FIXTURES = new URL(
  "./__fixtures__/coastline-mask/",
  import.meta.url,
);

function readFixture<T extends Geometry>(
  area: string,
  kind: "land" | "bathymetry",
): FeatureCollection<T> {
  let text: string;
  try {
    text = readFileSync(
      new URL(`${kind}-${area}.geojson`, FIXTURES),
      "utf8",
    );
  } catch (error) {
    throw new Error(
      `Missing coastline-mask fixture ${kind}-${area}.geojson — ` +
        "regenerate with web/scripts/capture-coastline-fixtures.py",
      { cause: error },
    );
  }
  return JSON.parse(text) as FeatureCollection<T>;
}

function isPolygonFeature(
  feature: BathymetryFeature,
): feature is Feature<Polygon | MultiPolygon> {
  return isPolygonLike(feature.geometry);
}

function isLineFeature(
  feature: BathymetryFeature,
): feature is Feature<LineString | MultiLineString> {
  return isLineLike(feature.geometry);
}

function isSingleLineFeature(
  feature: Feature<LineString | MultiLineString>,
): feature is Feature<LineString> {
  return feature.geometry.type === "LineString";
}

function isPolygonLike(
  geometry: BathymetryGeom,
): geometry is Polygon | MultiPolygon {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function isLineLike(
  geometry: BathymetryGeom,
): geometry is LineString | MultiLineString {
  return geometry.type === "LineString" || geometry.type === "MultiLineString";
}

function landPolygons(
  collection: FeatureCollection<LandGeom>,
): Array<Feature<LandGeom>> {
  return collection.features.filter(
    (feature) =>
      feature.geometry.type === "Polygon" ||
      feature.geometry.type === "MultiPolygon",
  );
}

/** Shared-coastline clip for depth-area bands: band minus land (turf). */
function clipBandToLand(
  band: Feature<Polygon | MultiPolygon>,
  land: ReadonlyArray<Feature<LandGeom>>,
): Feature<Polygon | MultiPolygon> | null {
  if (land.length === 0) return band;
  return difference(featureCollection([band, ...land]));
}

/**
 * Positive-area overlap of a clipped band with land, in square metres.
 * Touching the shared coastline boundary yields 0; a real crossing is large.
 */
function overlapAreaM2(
  band: Feature<Polygon | MultiPolygon>,
  poly: Feature<LandGeom>,
): number {
  const intersection = intersect(featureCollection([band, poly]));
  return intersection ? area(intersection) : 0;
}

/** Numeric-noise floor: 5 m x 5 m. Real un-clipped crossings are ≫ this. */
const OVERLAP_TOLERANCE_M2 = 25;

/**
 * Boundary ambiguity epsilon (metres): vertices/samples within this distance
 * of the coastline are treated as on the boundary. Floating-point noise at
 * shared edges is ~1e-8 m; real un-clipped crossings are metres deep.
 */
const BOUNDARY_EPSILON_M = 0.5;

function distanceToLandBoundaryMeters(
  position: [number, number],
  poly: Feature<LandGeom>,
): number {
  const outerRings: Position[][] =
    poly.geometry.type === "Polygon"
      ? [poly.geometry.coordinates[0]!]
      : poly.geometry.coordinates.map((part) => part[0]!);
  let min = Infinity;
  for (const ring of outerRings) {
    const nearest = nearestPointOnLine(
      lineString(ring),
      position,
    );
    min = Math.min(min, distance(position, nearest));
  }
  return min;
}

/** True when a point is strictly inside land and away from its boundary. */
function trulyInsideLand(
  position: [number, number],
  land: ReadonlyArray<Feature<LandGeom>>,
): boolean {
  return land.some((poly) => {
    if (!booleanPointInPolygon(position, poly, { ignoreBoundary: true })) {
      return false;
    }
    return (
      distanceToLandBoundaryMeters(position, poly) > BOUNDARY_EPSILON_M
    );
  });
}

/** True when a point is outside every land polygon (boundary counts as in). */
function strictlyOutsideLand(
  position: [number, number],
  land: ReadonlyArray<Feature<LandGeom>>,
): boolean {
  return land.every((poly) => {
    try {
      return !booleanPointInPolygon(position, poly);
    } catch {
      // Uncomputable geometry counts as on-land so the test fails loudly.
      return false;
    }
  });
}

function segmentMidpoints(
  line: Feature<LineString>,
): Array<[number, number]> {
  const coords = line.geometry.coordinates;
  if (coords.length < 2) return [];
  const points: Array<[number, number]> = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    for (const t of [0.25, 0.5, 0.75]) {
      points.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ]);
    }
  }
  return points;
}

/**
 * Shared-coastline clip for contour lines: split each line at every crossing
 * of the land boundary and keep only the parts that stay in sea. Splitting at
 * all crossings makes every kept segment uniformly outside land.
 */
function clipContourToLand(
  contour: Feature<LineString>,
  land: ReadonlyArray<Feature<LandGeom>>,
): Array<Feature<LineString>> {
  let parts: Array<Feature<LineString>> = [contour];
  for (const poly of land) {
    const next: Array<Feature<LineString>> = [];
    for (const part of parts) {
      const crossings = lineIntersect(part, poly).features;
      if (crossings.length === 0) {
        // Uniformly in or out — keep only sea parts (sample-checked below).
        next.push(part);
        continue;
      }
      const snapped = crossings.map((point) =>
        nearestPointOnLine(part, point),
      );
      const unique = new Map<string, Feature<Point>>();
      for (const point of snapped) {
        const position = point.geometry.coordinates;
        const key = position.map((n) => n.toFixed(9)).join(",");
        if (!unique.has(key)) unique.set(key, point);
      }
      const splitter = multiPoint([...unique.values()].map((p) => p.geometry.coordinates));
      const pieces = lineSplit(part, splitter).features;
      for (const piece of pieces) {
        if (piece.geometry.type !== "LineString") continue;
        if (piece.geometry.coordinates.length < 2) continue;
        const midpoint = piece.geometry.coordinates[
          Math.floor(piece.geometry.coordinates.length / 2)
        ]!;
        if (strictlyOutsideLand(midpoint as [number, number], land)) {
          next.push(piece);
        }
      }
    }
    parts = next;
    if (parts.length === 0) break;
  }
  return parts;
}

const AREAS = ["qaarsut", "naajaat"] as const;

describe("coastline mask geometry regression (Qaarsut + Naajaat)", () => {
  for (const area of AREAS) {
    const land = landPolygons(readFixture<LandGeom>(area, "land"));
    const bathymetry = readFixture<BathymetryGeom>(area, "bathymetry")
      .features as BathymetryFeature[];
    const bands = bathymetry.filter(isPolygonFeature);
    const contours = bathymetry.filter(isLineFeature);

    describe(area, () => {
      it("fixtures are non-empty and carry the metric bands from the issue", () => {
        expect(land.length).toBeGreaterThan(0);
        expect(bands.length).toBeGreaterThan(0);
        expect(contours.length).toBeGreaterThan(0);
        const drvals = new Set(
          bands
            .map((feature) => feature.properties?.drval1)
            .filter((value): value is number => typeof value === "number"),
        );
        expect([...drvals]).toContain(5);
        expect([...drvals]).toContain(20);
      });

      it("raw fixture bathymetry crosses land — the defect is captured", () => {
        const bandCrosses = bands.some((band) =>
          land.some((poly) => booleanIntersects(poly, band)),
        );
        const contourCrosses = contours.some((contour) =>
          land.some((poly) => booleanIntersects(poly, contour)),
        );
        expect(bandCrosses).toBe(true);
        expect(contourCrosses).toBe(true);
      });

      it("shared-coastline clip leaves no depth band on land", () => {
        const clipped = bands
          .map((band) => clipBandToLand(band, land))
          .filter((band): band is Feature<Polygon | MultiPolygon> => band != null);
        expect(clipped.length).toBeGreaterThan(0);
        for (const band of clipped) {
          for (const poly of land) {
            expect(overlapAreaM2(band, poly)).toBeLessThan(
              OVERLAP_TOLERANCE_M2,
            );
          }
        }
      });

      it("shared-coastline clip leaves no contour portion on land", () => {
        const clipped = contours.flatMap((contour) => {
          if (isSingleLineFeature(contour)) {
            return clipContourToLand(contour, land);
          }
          // MultiLineString: clip each member line.
          return contour.geometry.coordinates.flatMap((member) =>
            clipContourToLand(
              {
                type: "Feature",
                properties: contour.properties,
                geometry: {
                  type: "LineString",
                  coordinates: member as Position[],
                },
              },
              land,
            ),
          );
        });
        expect(clipped.length).toBeGreaterThan(0);
        for (const segment of clipped) {
          // No vertex may be truly inside land (near-boundary noise from the
          // shared coastline is allowed; a real crossing is metres deep)…
          for (const position of segment.geometry.coordinates) {
            expect(
              trulyInsideLand(position as [number, number], land),
            ).toBe(false);
          }
          // …and no sampled point along any member segment either.
          for (const position of segmentMidpoints(segment)) {
            expect(trulyInsideLand(position, land)).toBe(false);
          }
        }
      });
    });
  }
});
