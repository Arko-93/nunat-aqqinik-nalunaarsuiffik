import type { Placename } from "./placename.ts";
import { levenshteinAtMost } from "./near-duplicate.ts";

export type SearchHit = {
  place: Placename;
  score: number;
  match: "exact" | "prefix" | "word" | "contains" | "fuzzy";
};

/** Minimum trimmed length before search results / sheet open. */
export const SEARCH_MIN_CHARS = 2;

/** True when the query is long enough to open the result sheet. */
export const isSearchQueryActive = (query: string): boolean =>
  query.trim().length >= SEARCH_MIN_CHARS;

const normalize = (value: string): string =>
  value.trim().toLocaleLowerCase("kl").replace(/\s+/g, " ");

type FieldMatch = {
  score: number;
  match: SearchHit["match"];
};

const scoreField = (field: string, query: string): FieldMatch | null => {
  if (!field) return null;
  if (field === query) return { score: 1000, match: "exact" };
  if (field.startsWith(query)) {
    const lengthPenalty = Math.min(80, Math.max(0, field.length - query.length));
    return { score: 820 - lengthPenalty, match: "prefix" };
  }
  const words = field.split(/[\s,/:-]+/);
  if (words.some((word) => word === query)) {
    return { score: 700, match: "word" };
  }
  if (words.some((word) => word.startsWith(query))) {
    return { score: 640, match: "word" };
  }
  const idx = field.indexOf(query);
  if (idx >= 0) {
    return { score: 420 - Math.min(100, idx), match: "contains" };
  }
  return null;
};

const bestFieldMatch = (place: Placename, query: string): FieldMatch | null => {
  const fields = [
    { value: normalize(place.officialName), weight: 1 },
    { value: normalize(place.danishName ?? ""), weight: 0.96 },
    { value: normalize(place.oldOfficialName ?? ""), weight: 0.72 },
  ];

  let best: FieldMatch | null = null;
  for (const field of fields) {
    if (!field.value) continue;
    const hit = scoreField(field.value, query);
    if (!hit) continue;
    const scored = {
      score: hit.score * field.weight,
      match: hit.match,
    };
    if (!best || scored.score > best.score) best = scored;
  }
  return best;
};

/** Locality near-miss: Naajat→Naajaat, Nuke→Nuuk. Strong enough to beat geo exact. */
const localityFuzzy = (place: Placename, query: string): FieldMatch | null => {
  if (!place.isLocality || query.length < 3 || query.length > 12) return null;
  const fields = [place.officialName, place.danishName ?? ""].map(normalize);
  for (const field of fields) {
    if (!field || field.length > 18) continue;
    const maxDist =
      Math.abs(field.length - query.length) <= 1 && Math.max(field.length, query.length) <= 8
        ? 2
        : query.length <= 5 && field.length === query.length
          ? 2
          : 1;
    if (levenshteinAtMost(field, query, maxDist)) {
      // Sit just under exact so true exact locality still wins, but above geo exact.
      return { score: maxDist === 1 ? 980 : 940, match: "fuzzy" };
    }
  }
  return null;
};

const tierBoost = (place: Placename): number => {
  if (place.featureKind === "town") return 500;
  if (place.featureKind === "settlement") return 420;
  if (place.isLocality) return 400;
  if (place.isLocalityShadow) return -400;
  if (place.importance >= 700) return 80;
  if (place.importance >= 500) return 40;
  return 0;
};

export const scorePlacename = (
  place: Placename,
  rawQuery: string,
): SearchHit | null => {
  const query = normalize(rawQuery);
  if (query.length < 2) return null;
  if (place.isLocalityShadow) return null;

  const field = bestFieldMatch(place, query) ?? localityFuzzy(place, query);
  if (!field) return null;

  const score =
    field.score +
    tierBoost(place) +
    place.importance / 100 -
    Math.min(20, place.officialName.length) * 0.15;

  return { place, score, match: field.match };
};

export const searchPlacenames = (
  places: ReadonlyArray<Placename>,
  rawQuery: string,
  limit = 12,
): ReadonlyArray<SearchHit> => {
  const query = normalize(rawQuery);
  if (query.length < SEARCH_MIN_CHARS) return [];

  const hits: SearchHit[] = [];
  for (const place of places) {
    const hit = scorePlacename(place, query);
    if (hit) hits.push(hit);
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.place.importance !== a.place.importance) {
      return b.place.importance - a.place.importance;
    }
    return a.place.officialName.length - b.place.officialName.length;
  });

  return hits.slice(0, limit);
};
