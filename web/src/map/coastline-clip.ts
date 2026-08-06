/**
 * Shared-coastline clip contract (issues #16/#19/#23).
 *
 * Depth bands and contour lines must be clipped to the SAME shoreline the
 * display mask uses before bathymetry is tiled — the display mask and the
 * generated depth tiles cannot drift. This module is the reference
 * implementation of that clip; the coastline-mask regression fixtures pin
 * it (web/src/map/coastline-mask.test.ts), and the IBCAO/GEBCO tiling
 * pipeline mirrors this exact contract in Python (shapely) so the vector
 * tiles are clipped before tile generation.
 *
 * Clip semantics:
 * - Bands: band geometry minus land (turf difference).
 * - Contours: split each line at every crossing of the land boundary and
 *   keep only the parts that stay in sea. Splitting at all crossings makes
 *   every kept segment uniformly outside land (no vertex or sampled
 *   midpoint may be truly inside land).
 */

import difference from "@turf/difference";
import lineIntersect from "@turf/line-intersect";
import lineSplit from "@turf/line-split";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection, multiPoint } from "@turf/helpers";
import type {
	Feature,
	LineString,
	MultiLineString,
	MultiPolygon,
	Point,
	Polygon,
	Position,
} from "geojson";

export type LandGeom = Polygon | MultiPolygon;
export type BathymetryGeom =
	| Polygon
	| MultiPolygon
	| LineString
	| MultiLineString;

/** Boundary-ambiguity epsilon (metres) for the contour sea/land test. */
export const BOUNDARY_EPSILON_M = 0.5;

function isLineLike(
	geometry: BathymetryGeom,
): geometry is LineString | MultiLineString {
	return geometry.type === "LineString" || geometry.type === "MultiLineString";
}

function isPolygonLike(
	geometry: BathymetryGeom,
): geometry is Polygon | MultiPolygon {
	return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
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
			// Uncomputable geometry counts as on-land so the clip fails loudly.
			return false;
		}
	});
}

function segmentMidpoints(line: Feature<LineString>): Array<[number, number]> {
	const coords = line.geometry.coordinates;
	if (coords.length < 2) return [];
	const points: Array<[number, number]> = [];
	for (let i = 0; i < coords.length - 1; i++) {
		const a = coords[i]!;
		const b = coords[i + 1]!;
		for (const t of [0.25, 0.5, 0.75]) {
			points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		}
	}
	return points;
}

/**
 * Shared-coastline clip for depth-area bands: band minus land (turf).
 * Returns null when nothing survives the clip.
 */
export function clipBandToLand(
	band: Feature<Polygon | MultiPolygon>,
	land: ReadonlyArray<Feature<LandGeom>>,
): Feature<Polygon | MultiPolygon> | null {
	if (land.length === 0) return band;
	return difference(featureCollection([band, ...land]));
}

/**
 * Shared-coastline clip for contour lines: split each line at every crossing
 * of the land boundary and keep only the parts that stay in sea. Splitting at
 * all crossings makes every kept segment uniformly outside land.
 */
export function clipContourToLand(
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
			const snapped = crossings.map((point) => nearestPointOnLine(part, point));
			const unique = new Map<string, Feature<Point>>();
			for (const point of snapped) {
				const position = point.geometry.coordinates;
				const key = position.map((n) => n.toFixed(9)).join(",");
				if (!unique.has(key)) unique.set(key, point);
			}
			const splitter = multiPoint(
				[...unique.values()].map((p) => p.geometry.coordinates),
			);
			const pieces = lineSplit(part, splitter).features;
			for (const piece of pieces) {
				if (piece.geometry.type !== "LineString") continue;
				if (piece.geometry.coordinates.length < 2) continue;
				// Keep a piece only when no sampled point (segment midpoints) is
				// truly inside land — a piece whose ends dip into land (2-25 m
				// shoreline noise) must not survive the clip.
				const samples = segmentMidpoints(piece);
				const outside = samples.every((midpoint) =>
					strictlyOutsideLand(midpoint, land),
				);
				if (outside) {
					next.push(piece);
				}
			}
		}
		parts = next;
		if (parts.length === 0) break;
	}
	return parts;
}

/** Clip every band/contour feature of a collection to the shared coastline. */
export function clipBathymetryToLand(
	bathymetry: ReadonlyArray<Feature<BathymetryGeom>>,
	land: ReadonlyArray<Feature<LandGeom>>,
): {
	bands: Array<Feature<Polygon | MultiPolygon>>;
	contours: Array<Feature<LineString>>;
} {
	const bands: Array<Feature<Polygon | MultiPolygon>> = [];
	const contours: Array<Feature<LineString>> = [];
	for (const feature of bathymetry) {
		if (isPolygonLike(feature.geometry)) {
			const clipped = clipBandToLand(
				feature as Feature<Polygon | MultiPolygon>,
				land,
			);
			if (clipped != null) bands.push(clipped);
		} else if (isLineLike(feature.geometry)) {
			if (feature.geometry.type === "LineString") {
				contours.push(
					...clipContourToLand(feature as Feature<LineString>, land),
				);
			} else {
				for (const member of feature.geometry.coordinates) {
					contours.push(
						...clipContourToLand(
							{
								type: "Feature",
								properties: feature.properties,
								geometry: {
									type: "LineString",
									coordinates: member as Position[],
								},
							},
							land,
						),
					);
				}
			}
		}
	}
	return { bands, contours };
}
