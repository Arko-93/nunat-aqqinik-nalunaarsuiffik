/**
 * Progressive map disclosure — Google/Apple style.
 * Higher importance wins label collisions; minZoom gates when a name may appear.
 */

export const TYPE_LABEL_DA: Readonly<Record<number, string>> = {
  0: "Banke",
  5: "Ankerplads",
  8: "Fjeldvæg",
  10: "Bredning",
  11: "Skråning",
  12: "Bræ",
  13: "Dal",
  17: "Kombination",
  18: "Bugt",
  19: "Bund",
  21: "By",
  22: "Bydel",
  23: "Bygd",
  24: "Avlested",
  26: "Munding",
  29: "Lavning",
  31: "Delta",
  35: "Elv",
  36: "Elve",
  37: "Slette",
  40: "Hytte",
  41: "Fangstplads",
  44: "Fjeldområde",
  48: "Fjeldknold",
  49: "Fjeld",
  50: "Plateau",
  51: "Fjeldryg",
  54: "Top",
  56: "Fjordarm",
  57: "Fjord",
  58: "Landingsbane",
  59: "Forbjerg",
  64: "Vandfald",
  65: "Fuglefjeld",
  68: "Nedlagt bosted",
  73: "Halvø",
  74: "Havn",
  82: "Bakke",
  86: "Vig",
  87: "Isområde",
  88: "Indlandsis",
  95: "Klippe",
  96: "Kløft",
  101: "Kyst",
  105: "Landareal",
  117: "Nunatak",
  118: "Næs",
  119: "Odde",
  123: "Overbæringssted",
  124: "Pas",
  127: "Pynt",
  131: "Ruin",
  132: "Eskimoisk ruin",
  134: "Nordboruin",
  140: "Skrænt",
  143: "Skær",
  146: "Slædevej",
  149: "Indsnævring",
  155: "Nedlagt station",
  158: "Sten",
  159: "Varde",
  163: "Strand",
  164: "Stræde",
  165: "Strøm",
  166: "Sund",
  167: "Sø",
  170: "Søer",
  173: "Tange",
  178: "Hav",
  181: "Ø",
  182: "Del af ø",
  183: "Øgruppe",
  184: "Andet",
  186: "Stor havområde",
  187: "Stor landområde",
};

/** Explicit importance + earliest zoom for named feature classes. */
const TYPE_RANK: Readonly<
  Record<number, { importance: number; minZoom: number }>
> = {
  // Inhabited places — visible from country scale
  21: { importance: 1000, minZoom: 2.6 }, // By
  23: { importance: 920, minZoom: 3.6 }, // Bygd
  22: { importance: 520, minZoom: 9.0 }, // Bydel
  68: { importance: 480, minZoom: 8.0 }, // Nedlagt bosted

  // Large named regions / seas
  187: { importance: 880, minZoom: 3.2 }, // Stor landområde
  186: { importance: 860, minZoom: 3.2 }, // Stor havområde
  178: { importance: 820, minZoom: 3.8 }, // Hav
  88: { importance: 780, minZoom: 4.2 }, // Indlandsis

  // Major hydrography & archipelagos
  57: { importance: 760, minZoom: 4.6 }, // Fjord
  166: { importance: 740, minZoom: 5.0 }, // Sund
  164: { importance: 730, minZoom: 5.2 }, // Stræde
  183: { importance: 720, minZoom: 5.0 }, // Øgruppe
  10: { importance: 700, minZoom: 5.2 }, // Bredning
  18: { importance: 680, minZoom: 5.6 }, // Bugt
  73: { importance: 670, minZoom: 5.6 }, // Halvø
  56: { importance: 660, minZoom: 6.0 }, // Fjordarm
  12: { importance: 650, minZoom: 5.8 }, // Bræ

  // Islands & landforms (dense — collision thins them)
  181: { importance: 600, minZoom: 6.4 }, // Ø
  105: { importance: 560, minZoom: 7.0 }, // Landareal
  44: { importance: 540, minZoom: 7.2 }, // Fjeldområde
  49: { importance: 520, minZoom: 7.4 }, // Fjeld
  74: { importance: 510, minZoom: 7.5 }, // Havn

  // Mid-scale geography
  167: { importance: 460, minZoom: 8.0 }, // Sø
  35: { importance: 450, minZoom: 8.2 }, // Elv
  13: { importance: 440, minZoom: 8.2 }, // Dal
  101: { importance: 430, minZoom: 8.4 }, // Kyst
  86: { importance: 420, minZoom: 8.5 }, // Vig
  59: { importance: 410, minZoom: 8.5 }, // Forbjerg
  117: { importance: 400, minZoom: 8.6 }, // Nunatak
  54: { importance: 390, minZoom: 8.8 }, // Top
  182: { importance: 380, minZoom: 9.0 }, // Del af ø

  // Dense coastal / local names
  118: { importance: 320, minZoom: 9.4 }, // Næs
  143: { importance: 300, minZoom: 9.6 }, // Skær
  127: { importance: 290, minZoom: 9.8 }, // Pynt
  119: { importance: 280, minZoom: 9.8 }, // Odde
  8: { importance: 270, minZoom: 10.0 }, // Fjeldvæg
  96: { importance: 260, minZoom: 10.0 }, // Kløft
  123: { importance: 250, minZoom: 10.2 }, // Overbæringssted
};

const DEFAULT_RANK = { importance: 180, minZoom: 10.5 };

export const typeLabel = (typeCode: number): string =>
  TYPE_LABEL_DA[typeCode] ?? `Type ${typeCode}`;

export const rankForType = (
  typeCode: number,
): { importance: number; minZoom: number } =>
  TYPE_RANK[typeCode] ?? DEFAULT_RANK;

/** MapLibre band for layer filters — progressive disclosure. */
export type ZoomBand = "locality" | "major" | "regional" | "local" | "detail";

export const zoomBandFor = (
  importance: number,
  isLocality: boolean,
): ZoomBand => {
  if (isLocality) return "locality";
  if (importance >= 650) return "major";
  if (importance >= 500) return "regional";
  if (importance >= 280) return "local";
  return "detail";
};

export const BAND_MIN_ZOOM: Readonly<Record<ZoomBand, number>> = {
  locality: 2.4,
  major: 4.4,
  regional: 6.2,
  local: 8.4,
  detail: 10.6,
};
