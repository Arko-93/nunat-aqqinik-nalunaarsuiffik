/**
 * Offline corridor pack policy (Qaarsut→Kullorsuaq).
 * Kept separate from meter-band cartography constants.
 */

/** Planning bbox for Qaarsut→Kullorsuaq offline corridor (W,S,E,N). */
export const CORRIDOR_BBOX: readonly [number, number, number, number] = [
  -58.5, 70.4, -50.5, 74.9,
];

/** Hard size cap for a family-phone corridor pack. */
export const MAX_PACK_BYTES = 250 * 1024 * 1024;

/**
 * Files required before the UI may claim terrain is ready offline.
 * Paths are pack-relative. `coastline-land/land.pmtiles` mirrors the online
 * same-origin mask source (`packages/coastline-land/land.pmtiles`, stripped
 * of the pack base) so a full pack can serve the identical path. The ocean
 * archives mirror the online ocean-depth package file names
 * (`ocean-depth-dem.pmtiles`, `ocean-depth-vector.pmtiles`) so offline
 * serves the same logical tile paths as online.
 */
export const TERRAIN_OFFLINE_FILES = [
  "land-relief.pmtiles",
  "ocean-depth-dem.pmtiles",
  "ocean-depth-vector.pmtiles",
  "coastline-land/land.pmtiles",
] as const;

export const CORRIDOR_PACKAGE_BASE = "/packages/qaarsut-kullorsuaq";
