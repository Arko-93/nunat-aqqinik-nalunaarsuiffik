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

/** Files required before the UI may claim terrain is ready offline. */
export const TERRAIN_OFFLINE_FILES = [
  "land-relief.pmtiles",
  "ocean-depth.pmtiles",
] as const;

export const CORRIDOR_PACKAGE_BASE = "/packages/qaarsut-kullorsuaq";
