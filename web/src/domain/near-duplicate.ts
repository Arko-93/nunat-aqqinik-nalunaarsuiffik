import type { Placename } from "./placename.ts";

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase("kl").replace(/\s+/g, " ");

/** Edit distance capped — early exit when above max. */
export const levenshteinAtMost = (
  a: string,
  b: string,
  max: number,
): boolean => {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const curr = new Array<number>(cols);
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    prev = curr;
  }
  return prev[b.length] <= max;
};

/**
 * True when two official names are the same place-name family
 * (Naajat ↔ Naajaat, Nuuk ↔ Nuuk).
 */
export const namesNearDuplicate = (a: string, b: string): boolean => {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen <= 12) {
    const maxDist = maxLen <= 7 ? 2 : 1;
    if (levenshteinAtMost(left, right, maxDist)) return true;
  }
  // One short name is a near-prefix of the other (Naajat / Naajaat Nuuat — no;
  // only when lengths are close).
  if (Math.abs(left.length - right.length) <= 2) {
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    if (longer.startsWith(shorter) && shorter.length >= 4) return true;
  }
  return false;
};

/** Rough km²-free distance check using degrees (~3 km at Greenland latitudes). */
export const nearbyCoordinates = (
  a: Pick<Placename, "longitude" | "latitude">,
  b: Pick<Placename, "longitude" | "latitude">,
  maxDegrees = 0.04,
): boolean => {
  const dLon = a.longitude - b.longitude;
  const dLat = a.latitude - b.latitude;
  return dLon * dLon + dLat * dLat <= maxDegrees * maxDegrees;
};

/**
 * Geographic features that only echo a nearby locality name
 * (e.g. Øgruppe "Naajat" beside Bygd "Naajaat").
 */
export const isLocalityNameShadow = (
  candidate: Placename,
  localities: ReadonlyArray<Placename>,
): boolean => {
  if (candidate.isLocality) return false;
  for (const locality of localities) {
    if (!namesNearDuplicate(candidate.officialName, locality.officialName)) {
      continue;
    }
    const sameMunicipality =
      candidate.municipalityCode != null &&
      candidate.municipalityCode === locality.municipalityCode;
    if (sameMunicipality || nearbyCoordinates(candidate, locality)) {
      return true;
    }
  }
  return false;
};
