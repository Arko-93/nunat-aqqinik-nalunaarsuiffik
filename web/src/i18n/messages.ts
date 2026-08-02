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
  searchLabel: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchIdleHint: string;
  language: string;
  mapContent: string;
  inhabitedPlaces: string;
  geography: string;
  geographyZoomHint: string;
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
  dossierPurpose: string;
  featureId: string;
  pendingReviewNote: string;
  mapFilters: string;
  openFilters: string;
  closeFilters: string;
  clearFilters: string;
};

const en: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Find a Greenland place. See how it connects.",
  searchLabel: "Find a place",
  searchPlaceholder: "Name in Kalaallisut, Danish, or an older spelling…",
  searchEmpty: "No matching places",
  searchIdleHint:
    "Type a name to search. Or click a place on the map.",
  language: "Language",
  mapContent: "What the map shows",
  inhabitedPlaces: "Towns and settlements",
  geography: "Geography",
  geographyZoomHint: "Zoom into a coast or fjord to reveal geography names.",
  waters: "Waters",
  islands: "Islands",
  landforms: "Landforms",
  municipality: "Municipality",
  municipalityAll: "All municipalities",
  municipalityOutside: "Outside municipalities",
  placesList: "Find",
  results: "Matches",
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
    "No canonical place identity yet. Access stays unavailable until a place ID is confirmed.",
  noConnections: "No structural connections recorded for this locality yet.",
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
  shownCount: "matches",
  filtered: "filtered",
  closePlace: "Close place",
  expandSheet: "Expand place details",
  collapseSheet: "Collapse place details",
  selectPlaceHint: "Select a place to see names, access, and sources.",
  dossierPurpose:
    "This panel answers: what is this place called, how can you reach it, and where did that claim come from?",
  featureId: "Feature ID",
  pendingReviewNote: "UI language draft — Kalaallisut terms need native review.",
  mapFilters: "Map filters",
  openFilters: "Map layers",
  closeFilters: "Close",
  clearFilters: "Reset",
};

const da: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Find et sted i Grønland. Se hvordan det forbindes.",
  searchLabel: "Find et sted",
  searchPlaceholder: "Navn på kalaallisut, dansk eller ældre stavemåde…",
  searchEmpty: "Ingen matchende steder",
  searchIdleHint: "Skriv et navn for at søge. Eller klik på et sted på kortet.",
  language: "Sprog",
  mapContent: "Hvad kortet viser",
  inhabitedPlaces: "Byer og bygder",
  geography: "Geografi",
  geographyZoomHint: "Zoom ind på en kyst eller fjord for at se geografiske navne.",
  waters: "Vande",
  islands: "Øer",
  landforms: "Landformer",
  municipality: "Kommune",
  municipalityAll: "Alle kommuner",
  municipalityOutside: "Uden for kommuner",
  placesList: "Find",
  results: "Fund",
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
    "Ingen kanonisk stedidentitet endnu. Adgang vises først, når et sted-ID er bekræftet.",
  noConnections: "Ingen strukturelle forbindelser registreret for denne bebyggelse endnu.",
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
  shownCount: "fund",
  filtered: "filtreret",
  closePlace: "Luk sted",
  expandSheet: "Udvid stedoplysninger",
  collapseSheet: "Skjul stedoplysninger",
  selectPlaceHint: "Vælg et sted for at se navne, adgang og kilder.",
  dossierPurpose:
    "Dette panel svarer: hvad hedder stedet, hvordan nås det, og hvor kommer påstanden fra?",
  featureId: "Objekt-ID",
  pendingReviewNote: "UI-sprog er udkast — kalaallisut skal gennemgås lokalt.",
  mapFilters: "Kortfiltre",
  openFilters: "Kortlag",
  closeFilters: "Luk",
  clearFilters: "Nulstil",
};

const kl: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Nunaasuq nassaaruk. Qanoq attaveqarnersoq takukkit.",
  searchLabel: "Nunaasuq nassaaruk",
  searchPlaceholder: "Ateq kalaallisut, qallunaatut imaluunniit itoqqortoq…",
  searchEmpty: "Nunaasuut nassaarineqanngillat",
  searchIdleHint:
    "Ateq allaguk ujarlerniarlugu. Imaluunniit kortimi nunaasuq toqqaruk.",
  language: "Oqaatsit",
  mapContent: "Kortip takutikkai",
  inhabitedPlaces: "Illut nunaqarfiillu",
  geography: "Nunap assinga",
  geographyZoomHint:
    "Zoom-iliuk sinaakkut imaluunniit kangerlummut nunap aqqinik takusinnaajumallugit.",
  waters: "Imaq",
  islands: "Qeqertat",
  landforms: "Nunap ilusai",
  municipality: "Kommune",
  municipalityAll: "Kommunit tamarmik",
  municipalityOutside: "Kommuninut ilaanngitsut",
  placesList: "Nassaarit",
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
    "Nunaasuup id-ia suli uppernarsarneqanngilaq. Angalanerit takutitinneqassanngillat id uppernarsarneqartinnagu.",
  noConnections: "Inoqarfimmut uunga angalanerit suli nalunaarsorneqanngillat.",
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
  shownCount: "nassaarineqartut",
  filtered: "filtereqarluni",
  closePlace: "Nuna matu",
  expandSheet: "Nunaasuup paasisassai annertusiguk",
  collapseSheet: "Nunaasuup paasisassai annikillisiguk",
  selectPlaceHint: "Nunaasuq toqqaruk aqqinik, angalanernik kingumullu takusinnaajumallugit.",
  dossierPurpose:
    "Panelip akissutai: nunaasuq qanoq ateqarpa, qanoq tikinneqarsinnaava, aamma paasissutissat sumit piggerpat?",
  featureId: "Feature ID",
  pendingReviewNote: "UI oqaatsit misileraaneq — kalaallisut nunaqavissunit nalilersorneqassapput.",
  mapFilters: "Kortip filteri",
  openFilters: "Kortip qalipaatai",
  closeFilters: "Matukkit",
  clearFilters: "Nalinginnaasumut",
};

export const MESSAGES: Record<Locale, Messages> = { kl, da, en };

export const DEFAULT_LOCALE: Locale = "kl";
