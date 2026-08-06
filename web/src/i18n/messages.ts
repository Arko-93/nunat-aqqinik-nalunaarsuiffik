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
  placesList: string;
  results: string;
  noResults: string;
  viewMap: string;
  overview: string;
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
  releaseLabel: string;
  dataAsOf: string;
  publicationBlockers: string;
  publishReady: string;
  offlineLocal: string;
  online: string;
  offline: string;
  loading: string;
  shownCount: string;
  closePlace: string;
  expandSheet: string;
  collapseSheet: string;
  selectPlaceHint: string;
  dossierPurpose: string;
  featureId: string;
  pendingReviewNote: string;
  downloadArea: string;
  downloadAreaHint: string;
  downloadProgress: string;
  downloadReady: string;
  downloadStubInstalled: string;
  downloadStubHint: string;
  downloadFullHint: string;
  downloadDelete: string;
  downloadUpdate: string;
  notForNavigation: string;
  tileGapLabel: string;
  iosHomeScreenHint: string;
  packVersion: string;
  legendLabel: string;
  typeLabelSkerry: string;
  typeLabelIsland: string;
  typeLabelIslandPart: string;
  typeLabelIslandGroup: string;
  provenanceSource: string;
  provenanceGeometry: string;
  provenanceMidpoint: string;
  provenanceType: string;
  provenanceGlobalId: string;
  provenanceLayer: string;
};

const en: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Greenland places on land and sea.",
  searchLabel: "Find a place",
  searchPlaceholder: "Name in Kalaallisut, Danish, or an older spelling…",
  searchEmpty: "No matching places",
  searchIdleHint: "Type a name, or browse the map.",
  language: "Language",
  placesList: "Find",
  results: "Matches",
  noResults: "No places to show",
  viewMap: "Map",
  overview: "Overview",
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
  releaseLabel: "Release",
  dataAsOf: "Data as of",
  publicationBlockers: "publication blockers",
  publishReady: "Publish-ready",
  offlineLocal: "Local release copy",
  online: "Online",
  offline: "Offline",
  loading: "Loading places…",
  shownCount: "matches",
  closePlace: "Close place",
  expandSheet: "Expand place details",
  collapseSheet: "Collapse place details",
  selectPlaceHint: "Select a place to see names and sources.",
  dossierPurpose:
    "This panel answers: what is this place called, and where did that claim come from?",
  featureId: "Feature ID",
  pendingReviewNote: "UI language draft — Kalaallisut terms need native review.",
  downloadArea: "Download area",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline corridor",
  downloadProgress: "Downloading…",
  downloadReady: "Ready offline",
  downloadStubInstalled: "Stub saved",
  downloadStubHint:
    "Wiring stub only — no terrain offline. The full pack is in the Download area when it verifies (kind=full).",
  downloadFullHint:
    "Full pack installed: land relief, ocean depth (fills, contours, labels — the hillshade raster stays online), coastline mask and localities work offline.",
  downloadDelete: "Delete download",
  downloadUpdate: "Update available",
  notForNavigation: "Not for navigation — open-grid depth, not a chart",
  tileGapLabel: "Relief data missing here",
  iosHomeScreenHint:
    "On iPhone/iPad: Add to Home Screen so the offline pack is not cleared.",
  packVersion: "Pack",
  legendLabel: "Named coastal features",
  typeLabelSkerry: "Skerry",
  typeLabelIsland: "Island",
  typeLabelIslandPart: "Island part",
  typeLabelIslandGroup: "Island group",
  provenanceSource: "Source register",
  provenanceGeometry: "Geometry",
  provenanceMidpoint: "NunaGIS midpoint point",
  provenanceType: "Register type",
  provenanceGlobalId: "GlobalID",
  provenanceLayer: "Source layer",
};

const da: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Grønlandske steder til lands og til vands.",
  searchLabel: "Find et sted",
  searchPlaceholder: "Navn på kalaallisut, dansk eller ældre stavemåde…",
  searchEmpty: "Ingen matchende steder",
  searchIdleHint: "Skriv et navn, eller browse kortet.",
  language: "Sprog",
  placesList: "Find",
  results: "Fund",
  noResults: "Ingen steder at vise",
  viewMap: "Kort",
  overview: "Overblik",
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
  releaseLabel: "Udgivelse",
  dataAsOf: "Data pr.",
  publicationBlockers: "publiceringsblokeringer",
  publishReady: "Klar til publicering",
  offlineLocal: "Lokal udgivelseskopi",
  online: "Online",
  offline: "Offline",
  loading: "Indlæser steder…",
  shownCount: "fund",
  closePlace: "Luk sted",
  expandSheet: "Udvid stedoplysninger",
  collapseSheet: "Skjul stedoplysninger",
  selectPlaceHint: "Vælg et sted for at se navne og kilder.",
  dossierPurpose:
    "Dette panel svarer: hvad hedder stedet, og hvor kommer påstanden fra?",
  featureId: "Objekt-ID",
  pendingReviewNote: "UI-sprog er udkast — kalaallisut skal gennemgås lokalt.",
  downloadArea: "Download område",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline-korridor",
  downloadProgress: "Downloader…",
  downloadReady: "Klar offline",
  downloadStubInstalled: "Stub gemt",
  downloadStubHint:
    "Kun wiring-stub — ingen offline-terræn. Den fulde pakke er i Download-området, når den verificeres (kind=full).",
  downloadFullHint:
    "Fuld pakke installeret: landrelief, havdybde (felter, konturer, etiketter — hillshade-raster forbliver online), kystlinjemaske og lokaliteter virker offline.",
  downloadDelete: "Slet download",
  downloadUpdate: "Opdatering klar",
  notForNavigation: "Ikke til navigation — åbent dybdegitter, ikke et søkort",
  tileGapLabel: "Relief mangler her",
  iosHomeScreenHint:
    "På iPhone/iPad: Føj til hjemmeskærm, så offline-pakken ikke slettes.",
  packVersion: "Pakke",
  legendLabel: "Navngivne kystforekomster",
  typeLabelSkerry: "Skær",
  typeLabelIsland: "Ø",
  typeLabelIslandPart: "Del af ø",
  typeLabelIslandGroup: "Øgruppe",
  provenanceSource: "Kilderegister",
  provenanceGeometry: "Geometri",
  provenanceMidpoint: "NunaGIS-midtpunkt",
  provenanceType: "Registertype",
  provenanceGlobalId: "GlobalID",
  provenanceLayer: "Kildelag",
};

const kl: Messages = {
  appTitle: "Nunat Aqqinik Nalunaarsuiffik",
  appTagline: "Kalaallit Nunaata nunaasuisa nunami imaanilu.",
  searchLabel: "Nunaasuq nassaaruk",
  searchPlaceholder: "Ateq kalaallisut, qallunaatut imaluunniit itoqqortoq…",
  searchEmpty: "Nunaasuut nassaarineqanngillat",
  searchIdleHint: "Ateq allaguk, imaluunniit kortimi ujarlerit.",
  language: "Oqaatsit",
  placesList: "Nassaarit",
  results: "Nassaarineqartut",
  noResults: "Nunat takutissallugit piginngillat",
  viewMap: "Kort",
  overview: "Takussutissat",
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
  releaseLabel: "Saqqummersitaq",
  dataAsOf: "Data ullumi",
  publicationBlockers: "saqqummersinneqarnissamut akornutit",
  publishReady: "Saqqummersinneqarsinnaavoq",
  offlineLocal: "Saqqummersitap kopi lokalit",
  online: "Internetikkut",
  offline: "Internetikkut atorsinnaanngitsoq",
  loading: "Nunat loadereqarput…",
  shownCount: "nassaarineqartut",
  closePlace: "Nuna matu",
  expandSheet: "Nunaasuup paasisassai annertusiguk",
  collapseSheet: "Nunaasuup paasisassai annikillisiguk",
  selectPlaceHint: "Nunaasuq toqqaruk aqqinik kingumullu takusinnaajumallugit.",
  dossierPurpose:
    "Panelip akissutai: nunaasuq qanoq ateqarpa, aamma paasissutissat sumit piggerpat?",
  featureId: "Feature ID",
  pendingReviewNote: "UI oqaatsit misileraaneq — kalaallisut nunaqavissunit nalilersorneqassapput.",
  downloadArea: "Download-eqareaq",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline-korridori",
  downloadProgress: "Downloadereqarpoq…",
  downloadReady: "Offline-imut piareersimavoq",
  downloadStubInstalled: "Stub toqqorneqarsimavoq",
  downloadStubHint:
    "Wiring-stub kisiat — offline-terræn aningaanngilaq. Pakke naammassimasoq Download-eqarfeqarneraniippoq kind=full-ikkut naliliffigineqarsimappat.",
  downloadFullHint:
    "Pakke naammassimasoq installeret: nunap itisilersuutai, imaap itissusia (fills, contours, labels — hillshade raster online-imik), sinaap mask-a localities offline atorlugu sulisarput.",
  downloadDelete: "Download peeruk",
  downloadUpdate: "Nutarterneqarsinnaavoq",
  notForNavigation: "Angalanermut atugassaanngilaq — immap itissusia chartinngilaq",
  tileGapLabel: "Relief-data maani peqanngilaq",
  iosHomeScreenHint:
    "iPhone/iPad-imi: Home Screen-imut ilanngutikkit offline-pakke peerneqannginnissaa.",
  packVersion: "Pakke",
  // Accessibility chrome reuses existing KL UI word; type words stay NunaGIS Danish.
  legendLabel: "Takussutissat — Skær · Ø · Del af ø · Øgruppe",
  // NunaGIS Danish register terms until native Kalaallisut review — do not invent KL.
  typeLabelSkerry: "Skær",
  typeLabelIsland: "Ø",
  typeLabelIslandPart: "Del af ø",
  typeLabelIslandGroup: "Øgruppe",
  provenanceSource: "Kingumut",
  provenanceGeometry: "Sumiiffik",
  provenanceMidpoint: "NunaGIS midpoint",
  provenanceType: "Type",
  provenanceGlobalId: "GlobalID",
  provenanceLayer: "Source layer",
};

export const MESSAGES: Record<Locale, Messages> = { kl, da, en };

/** Coastal type labels in KL still use register Danish terms pending native review. */
export const TYPE_LABELS_NEED_NATIVE_REVIEW: Readonly<Record<Locale, boolean>> =
  {
    kl: true,
    da: false,
    en: false,
  };

export const DEFAULT_LOCALE: Locale = "kl";
