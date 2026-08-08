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
  /** Skip link target: jump focus to the place search field. */
  skipToSearch: string;
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
  /** Quiet status when no corridor pack is installed. */
  packNone: string;
  notForNavigation: string;
  /** Quiet chrome note where land DEM/relief tiles are absent (issue #26). */
  tileGapLabel: string;
  /** Quiet chrome note where ocean depth tiles are absent (issue #26). */
  oceanDepthGapLabel: string;
  iosHomeScreenHint: string;
  packVersion: string;
  legendLabel: string;
  /** Short label for the passive land peak-band legend line (issue #24). */
  landPeakLegend: string;
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
  skipToSearch: "Skip to place search",
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
  offlineLocal: "Release on this device",
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
  downloadArea: "Download corridor",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline map pack",
  downloadProgress: "Downloading…",
  downloadReady: "Corridor ready offline",
  downloadStubInstalled: "Stub only — terrain still needs network",
  downloadStubHint:
    "Stub pack saved for wiring checks. Terrain and depth stay online until a full pack verifies.",
  downloadFullHint:
    "Offline: land relief, ocean depth fills/contours/labels/hillshade, coastline mask, and localities.",
  downloadDelete: "Remove pack",
  downloadUpdate: "Update pack",
  packNone: "No corridor pack",
  notForNavigation: "Not for navigation — open-grid depth, not a chart",
  tileGapLabel: "Relief data missing here",
  oceanDepthGapLabel: "Depth data missing here",
  iosHomeScreenHint:
    "iPhone/iPad: add to Home Screen so the pack is not cleared.",
  packVersion: "Pack",
  legendLabel: "Named coastal features",
  landPeakLegend: "Land peaks",
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
  skipToSearch: "Spring til stedssøgning",
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
  offlineLocal: "Udgivelse på denne enhed",
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
  downloadArea: "Download korridor",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline-kortpakke",
  downloadProgress: "Downloader…",
  downloadReady: "Korridor klar offline",
  downloadStubInstalled: "Kun stub — terræn kræver stadig netværk",
  downloadStubHint:
    "Stub-pakke gemt til wiring-tjek. Terræn og dybde forbliver online, indtil en fuld pakke verificeres.",
  downloadFullHint:
    "Offline: landrelief, havdybde (felter, konturer, etiketter og hillshade), kystlinjemaske og lokaliteter.",
  downloadDelete: "Fjern pakke",
  downloadUpdate: "Opdater pakke",
  packNone: "Ingen korridorpakke",
  notForNavigation: "Ikke til navigation — åbent dybdegitter, ikke et søkort",
  tileGapLabel: "Relief mangler her",
  oceanDepthGapLabel: "Dybdedata mangler her",
  iosHomeScreenHint:
    "iPhone/iPad: føj til hjemmeskærm, så pakken ikke slettes.",
  packVersion: "Pakke",
  legendLabel: "Navngivne kystforekomster",
  landPeakLegend: "Landtoppe",
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
  skipToSearch: "Nunaasunik ujaasiffimmukarit",
  language: "Oqaatsit",
  placesList: "Nassaarit",
  results: "Nassaarineqartut",
  noResults: "Nunat takutissallugit piginngillat",
  viewMap: "Kort",
  overview: "Takussutissat",
  sources: "Kingumut",
  officialName: "Ateq aqqi",
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
  offlineLocal: "Saqqummersitaq device-imi",
  online: "Internetikkut",
  offline: "Internetikkut atorsinnaanngitsoq",
  loading: "Nunat utertinneqarput…",
  shownCount: "nassaarineqartut",
  closePlace: "Nuna matu",
  expandSheet: "Nunaasuup paasisassai annertusiguk",
  collapseSheet: "Nunaasuup paasisassai annikillisiguk",
  selectPlaceHint: "Nunaasuq toqqaruk aqqinik kingumullu takusinnaajumallugit.",
  dossierPurpose:
    "Panelip akissutai: nunaasuq qanoq ateqarpa, aamma paasissutissat sumit piggerpat?",
  featureId: "Feature-id",
  pendingReviewNote: "UI oqaatsit misileraaneq — kalaallisut nunaqavissunit nalilersorneqassapput.",
  downloadArea: "Korridori downloadi",
  downloadAreaHint: "Qaarsut→Kullorsuaq offline-kortipakke",
  downloadProgress: "Downloadereqarpoq…",
  downloadReady: "Korridori offline-imut piareersimavoq",
  downloadStubInstalled: "Stub kisiat — terræn suli internetikkut",
  downloadStubHint:
    "Stub-pakke toqqorneqarsimavoq. Terræn aamma itissusia internetikkut innarpput pakke naammassimasoq uppernarsarneqanngippat.",
  downloadFullHint:
    "Offline: nunap itisilersuutai, imaap itissusia (fills, contours, labels, hillshade), sinaap mask-a, localities.",
  downloadDelete: "Pakke peeruk",
  downloadUpdate: "Pakke nutarteruk",
  packNone: "Korridoripakke peqanngilaq",
  notForNavigation: "Angalanermut atugassaanngilaq — immap itissusia chartinngilaq",
  tileGapLabel: "Relief-data maani peqanngilaq",
  // Provisional KL UI copy — native review still pending (pendingReviewNote).
  oceanDepthGapLabel: "Immap itissusia maani peqanngilaq",
  iosHomeScreenHint:
    "iPhone/iPad: Home Screen-imut ilanngutikkit pakke peerneqannginnissaa.",
  packVersion: "Pakke",
  // Accessibility chrome reuses existing KL UI word; type words stay NunaGIS Danish.
  legendLabel: "Takussutissat — Skær · Ø · Del af ø · Øgruppe",
  // Provisional KL UI copy — native review still pending (pendingReviewNote).
  landPeakLegend: "Nunap qaammartaasai",
  // NunaGIS Danish register terms until native Kalaallisut review — do not invent KL.
  typeLabelSkerry: "Skær",
  typeLabelIsland: "Ø",
  typeLabelIslandPart: "Del af ø",
  typeLabelIslandGroup: "Øgruppe",
  provenanceSource: "Kingumut",
  provenanceGeometry: "Sumiiffik",
  provenanceMidpoint: "NunaGIS qeqqata sumiiffia",
  provenanceType: "Type",
  provenanceGlobalId: "GlobalID",
  provenanceLayer: "Kingumut-lag",
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
