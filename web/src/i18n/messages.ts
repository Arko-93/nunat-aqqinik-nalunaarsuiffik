/** UI strings. Kalaallisut terms are provisional pending native review. */
export type Locale = "kl" | "da" | "en";

export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: "kl", label: "Kalaallisut" },
  { id: "da", label: "Dansk" },
  { id: "en", label: "English" },
];

export type Messages = {
  appTitle: string;
  appTagline: string;
  testBranch: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchEmpty: string;
  language: string;
  mapContent: string;
  inhabitedPlaces: string;
  geography: string;
  waters: string;
  islands: string;
  landforms: string;
  municipality: string;
  municipalityAll: string;
  municipalityOutside: string;
  placesList: string;
  results: string;
  noResults: string;
  viewList: string;
  viewMap: string;
  overview: string;
  access: string;
  sources: string;
  officialName: string;
  danishName: string;
  historicalName: string;
  placeId: string;
  coordinates: string;
  identityCanonical: string;
  identityCandidate: string;
  identityUpstream: string;
  inhabitedPlace: string;
  geographicFeature: string;
  noCanonicalIdentity: string;
  noConnections: string;
  reachableFromHere: string;
  structuralConnection: string;
  releaseLabel: string;
  dataAsOf: string;
  publicationBlockers: string;
  publishReady: string;
  offlineLocal: string;
  online: string;
  offline: string;
  loading: string;
  shownCount: string;
  filtered: string;
  closePlace: string;
  expandSheet: string;
  collapseSheet: string;
  selectPlaceHint: string;
  featureId: string;
  pendingReviewNote: string;
  mapFilters: string;
  openFilters: string;
  closeFilters: string;
  clearFilters: string;
};

const en: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Places and access for Greenland decisions",
  testBranch: "Test branch · not main",
  searchLabel: "Search places",
  searchPlaceholder: "Current, old, Danish, or local name…",
  searchEmpty: "No matching places",
  language: "Language",
  mapContent: "Map content",
  inhabitedPlaces: "Inhabited places",
  geography: "Geography",
  waters: "Waters",
  islands: "Islands",
  landforms: "Landforms",
  municipality: "Municipality",
  municipalityAll: "All municipalities",
  municipalityOutside: "Outside municipalities",
  placesList: "Places",
  results: "Results",
  noResults: "No places to show",
  viewList: "List",
  viewMap: "Map",
  overview: "Overview",
  access: "Access",
  sources: "Sources",
  officialName: "Official",
  danishName: "Danish",
  historicalName: "Historical",
  placeId: "Place ID",
  coordinates: "Coordinates",
  identityCanonical: "Verified place identity",
  identityCandidate: "Candidate identity",
  identityUpstream: "No canonical identity yet",
  inhabitedPlace: "Inhabited place",
  geographicFeature: "Geographical feature",
  noCanonicalIdentity:
    "No canonical place identity yet. Access and other operational claims stay unavailable until a place ID is confirmed.",
  noConnections: "No structural connections in the seed graph for this locality.",
  reachableFromHere: "Reachable from here",
  structuralConnection: "Structural connection",
  releaseLabel: "Release",
  dataAsOf: "Data as of",
  publicationBlockers: "publication blockers",
  publishReady: "Publish-ready",
  offlineLocal: "Local release copy",
  online: "Online",
  offline: "Offline",
  loading: "Loading places…",
  shownCount: "shown",
  filtered: "filtered",
  closePlace: "Close place",
  expandSheet: "Expand place details",
  collapseSheet: "Collapse place details",
  selectPlaceHint: "Search or select a place to open its dossier.",
  featureId: "Feature ID",
  pendingReviewNote: "UI language draft — Kalaallisut terms need native review.",
  mapFilters: "Map filters",
  openFilters: "Filters",
  closeFilters: "Close filters",
  clearFilters: "Reset",
};

const da: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Steder og adgang for beslutninger i Grønland",
  testBranch: "Testgren · ikke main",
  searchLabel: "Søg steder",
  searchPlaceholder: "Nuværende, gammelt, dansk eller lokalt navn…",
  searchEmpty: "Ingen matchende steder",
  language: "Sprog",
  mapContent: "Kortindhold",
  inhabitedPlaces: "Bebyggelser",
  geography: "Geografi",
  waters: "Vande",
  islands: "Øer",
  landforms: "Landformer",
  municipality: "Kommune",
  municipalityAll: "Alle kommuner",
  municipalityOutside: "Uden for kommuner",
  placesList: "Steder",
  results: "Resultater",
  noResults: "Ingen steder at vise",
  viewList: "Liste",
  viewMap: "Kort",
  overview: "Overblik",
  access: "Adgang",
  sources: "Kilder",
  officialName: "Officielt",
  danishName: "Dansk",
  historicalName: "Historisk",
  placeId: "Sted-ID",
  coordinates: "Koordinater",
  identityCanonical: "Bekræftet stedidentitet",
  identityCandidate: "Kandidat-identitet",
  identityUpstream: "Ingen kanonisk identitet endnu",
  inhabitedPlace: "Beboet sted",
  geographicFeature: "Geografisk forekomst",
  noCanonicalIdentity:
    "Ingen kanonisk stedidentitet endnu. Adgang og andre driftsoplysninger vises først, når et sted-ID er bekræftet.",
  noConnections: "Ingen strukturelle forbindelser i frøgrafen for denne bebyggelse.",
  reachableFromHere: "Kan nås herfra",
  structuralConnection: "Strukturel forbindelse",
  releaseLabel: "Udgivelse",
  dataAsOf: "Data pr.",
  publicationBlockers: "publiceringsblokeringer",
  publishReady: "Klar til publicering",
  offlineLocal: "Lokal udgivelseskopi",
  online: "Online",
  offline: "Offline",
  loading: "Indlæser steder…",
  shownCount: "vist",
  filtered: "filtreret",
  closePlace: "Luk sted",
  expandSheet: "Udvid stedoplysninger",
  collapseSheet: "Skjul stedoplysninger",
  selectPlaceHint: "Søg eller vælg et sted for at åbne dossieret.",
  featureId: "Objekt-ID",
  pendingReviewNote: "UI-sprog er udkast — kalaallisut skal gennemgås lokalt.",
  mapFilters: "Kortfiltre",
  openFilters: "Filtre",
  closeFilters: "Luk filtre",
  clearFilters: "Nulstil",
};

const kl: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Nunat aqqinillu angalanerit aalajangiinermut",
  testBranch: "Misileraaneq · main pinnagu",
  searchLabel: "Nunat ujarlerit",
  searchPlaceholder: "Aqqut, atoqqaaneq, qallunaatut imaluunniit nunami aqqineq…",
  searchEmpty: "Nunaasuut nassaarineqanngillat",
  language: "Oqaatsit",
  mapContent: "Kortip imarisai",
  inhabitedPlaces: "Inoqarfiit",
  geography: "Nunap assinga",
  waters: "Imaq",
  islands: "Qeqertat",
  landforms: "Nunap ilusai",
  municipality: "Kommune",
  municipalityAll: "Kommunit tamarmik",
  municipalityOutside: "Kommuninut ilaanngitsut",
  placesList: "Nunat",
  results: "Nassaarineqartut",
  noResults: "Nunat takutissallugit piginngillat",
  viewList: "Allattorsimaffik",
  viewMap: "Kort",
  overview: "Takussutissat",
  access: "Angalanerit",
  sources: "Kingumut",
  officialName: "Official",
  danishName: "Qallunaatut",
  historicalName: "Itoqqortoq",
  placeId: "Nuna ID",
  coordinates: "Sumiiffiit",
  identityCanonical: "Nunaasuup id-ia uppernarsarneqarsimavoq",
  identityCandidate: "Id kandidati",
  identityUpstream: "Id kanoniski suli peqanngilaq",
  inhabitedPlace: "Inoqarfik",
  geographicFeature: "Nunap ilusia",
  noCanonicalIdentity:
    "Nunaasuup id-ia suli uppernarsarneqanngilaq. Angalanerit allallu aalajangersimasut takutitinneqassanngillat id uppernarsarneqartinnagu.",
  noConnections: "Inoqarfimmut uunga angalanerit seed-grafimi suli peqanngillat.",
  reachableFromHere: "Uuma angalanera",
  structuralConnection: "Angalanerit aaqqissuussimasut",
  releaseLabel: "Saqqummersitaq",
  dataAsOf: "Data ullumi",
  publicationBlockers: "saqqummersinneqarnissamut akornutit",
  publishReady: "Saqqummersinneqarsinnaavoq",
  offlineLocal: "Saqqummersitap kopi lokalit",
  online: "Internetikkut",
  offline: "Internetikkut atorsinnaanngitsoq",
  loading: "Nunat loadereqarput…",
  shownCount: "takutinneqarput",
  filtered: "filtereqarluni",
  closePlace: "Nuna matu",
  expandSheet: "Nunaasuup paasisassai annertusiguk",
  collapseSheet: "Nunaasuup paasisassai annikillisiguk",
  selectPlaceHint: "Nuna ujarleruk imaluunniit toqqaruk dossierimik ammaaniarlugu.",
  featureId: "Feature ID",
  pendingReviewNote: "UI oqaatsit misileraaneq — kalaallisut nunaqavissunit nalilersorneqassapput.",
  mapFilters: "Kortip filteri",
  openFilters: "Filterit",
  closeFilters: "Filterit matukkit",
  clearFilters: "Nalinginnaasumut",
};

export const MESSAGES: Record<Locale, Messages> = { kl, da, en };

export const DEFAULT_LOCALE: Locale = "kl";
