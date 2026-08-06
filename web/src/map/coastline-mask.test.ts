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
 * The clip helpers live in ./coastline-clip.ts (production module): they are
 * the reference implementation of the production contract (clip depth bands
 * and contours to the shared coastline before tiling). V1 repairs the
 * display with the mask layer; the IBCAO/GEBCO tiling pipeline
 * (web/scripts/build-ocean-depth.py) mirrors this exact contract in Python
 * and verifies its own output at build time.
 */

import { describe, expect, it } from "vitest";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import area from "@turf/area";
import intersect from "@turf/intersect";
import distance from "@turf/distance";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, featureCollection } from "@turf/helpers";
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
import {
  BOUNDARY_EPSILON_M,
  clipBandToLand,
  clipContourToLand,
  type BathymetryGeom,
  type LandGeom,
} from "./coastline-clip.ts";

type BathymetryFeature = Feature<BathymetryGeom>;

const FIXTURES = new URL(
  "./__fixtures__/coastline-mask/",
  import.meta.url,
);

function readFixture<T extends Geometry>(
  area: string,
  kind: "land" | "bathymetry" | "dem-land",
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
  try {
    return JSON.parse(text) as FeatureCollection<T>;
  } catch (error) {
    throw new Error(`Invalid fixture ${kind}-${area}.geojson`, {
      cause: error,
    });
  }
}

function isPolygonFeature(
  feature: BathymetryFeature,
): feature is Feature<Polygon | MultiPolygon> {
  return (
    feature.geometry.type === "Polygon" ||
    feature.geometry.type === "MultiPolygon"
  );
}

function isLineFeature(
  feature: BathymetryFeature,
): feature is Feature<LineString | MultiLineString> {
  return (
    feature.geometry.type === "LineString" ||
    feature.geometry.type === "MultiLineString"
  );
}

function isSingleLineFeature(
  feature: Feature<LineString | MultiLineString>,
): feature is Feature<LineString> {
  return feature.geometry.type === "LineString";
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

function distanceToLandBoundaryMeters(
  position: [number, number],
  poly: Feature<LandGeom>,
): number {
  const outerRings: Position[][] =
    poly.geometry.type === "Polygon"
      ? [poly.geometry.coordinates[0]!]
      : poly.geometry.coordinates.map((part) => part[0]!);
  let minKm = Infinity;
  for (const ring of outerRings) {
    const nearest = nearestPointOnLine(
      lineString(ring),
      position,
    );
    minKm = Math.min(minKm, distance(position, nearest));
  }
  // turf distance() returns kilometres; the contract is metres.
  return minKm * 1000;
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

const AREAS = ["qaarsut", "naajaat"] as const;

/**
 * Issue #19 regression: DEM land the mask must cover (Naajaat).
 *
 * The Mapterhorn land hillshade renders land the OSM coastline misses
 * (Naajaat: ~0.15 km2 west of the island ring, up to ~120 m elevation).
 * The mask must cover every DEM-land sample point — the mask build unions
 * polygonized DEM land into the OSM coastline. The committed sample points
 * are real Mapterhorn z14 pixels outside the OSM-only shoreline; they fail
 * against an OSM-only land fixture and pass only when the mask carries the
 * DEM union (or a coastline that contains these points).
 */
describe("coastline mask covers Mapterhorn DEM land (issue #19)", () => {
  const land = landPolygons(readFixture<LandGeom>("naajaat", "land"));
  const demLand = readFixture<Point>("naajaat", "dem-land").features as Array<
    Feature<Point>
  >;

  it("fixtures are non-empty", () => {
    expect(land.length).toBeGreaterThan(0);
    expect(demLand.length).toBeGreaterThan(0);
  });

  it("every DEM-land sample point is covered by the land mask", () => {
    const uncovered = demLand.filter((point) => {
      const position = point.geometry.coordinates as [number, number];
      return !trulyInsideLand(position, land);
    });
    expect(uncovered).toEqual([]);
  });
});

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
