/** UI strings. Kalaallisut terms are provisional pending native review. */

export type Locale = "kl" | "da" | "en";

export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: "kl", label: "Kalaallisut" },
  { id: "da", label: "Dansk" },
  { id: "en", label: "English" },
];

export type MessageKey =
  | "appTitle"
  | "appTagline"
  | "safetyTitle"
  | "safetyBody"
  | "safetyPrivate"
  | "safetyAccept"
  | "language"
  | "corridorTitle"
  | "download"
  | "downloaded"
  | "verify"
  | "verified"
  | "deletePackage"
  | "dataAsOf"
  | "bytes"
  | "notForNavigation"
  | "startTrip"
  | "pauseTrip"
  | "resumeTrip"
  | "stopTrip"
  | "addWaypoint"
  | "waypointNote"
  | "saveWaypoint"
  | "tripSummary"
  | "duration"
  | "distance"
  | "points"
  | "largestGap"
  | "exportGpx"
  | "exportGeojson"
  | "deleteTrip"
  | "gpsState"
  | "accuracy"
  | "lastPoint"
  | "profile"
  | "offlineReady"
  | "onlineDemoBasemap"
  | "weather"
  | "ice"
  | "stale"
  | "validTo"
  | "landing"
  | "rockShallow"
  | "current"
  | "shelter"
  | "note"
  | "privateOnly"
  | "recordingForegroundOnly"
  | "forceQuitLimit"
  | "loading"
  | "error"
  | "mapContent"
  | "scopeAll"
  | "scopeLocalities"
  | "scopeGeography"
  | "clickPlaceHint"
  | "closePlace"
  | "danishName"
  | "historicalName"
  | "municipality"
  | "coordinates"
  | "inhabitedPlace"
  | "geographicFeature"
  | "placeList"
  | "localitiesCount"
  | "openMap"
  | "backPrepare"
  | "showPanel"
  | "hidePanel"
  | "demoGpsNote";

type Dict = Record<MessageKey, string>;

const kl: Dict = {
  appTitle: "Nunat Marine",
  appTagline: "Angalanermut nalunaarsuiffik — privatinngorlugu (provisional)",
  safetyTitle: "Ikiortissaavoq — soqortaanngilaq",
  safetyBody:
    "App-i uannga ikiortigineqassaaq: angalanerit, nunaqarfiit aqqi, GPS. Soqqutinut, ENC-inut, VHF-imut, AIS-imut, PLB/EPIRB-imut taarsiutinngilaq. (provisional)",
  safetyPrivate:
    "Angalanerit aamma waypoints privatipput. Sync aallarneraniik. (provisional)",
  safetyAccept: "Paasivara",
  language: "Oqaatsit",
  corridorTitle: "Uummannaq–Qaarsut",
  download: "Download",
  downloaded: "Downloadereqqaarneq",
  verify: "Checksuummiuk",
  verified: "Checksum OK",
  deletePackage: "Package-imik peeruk",
  dataAsOf: "Data-p ullua",
  bytes: "Byte",
  notForNavigation: "Context only — soqortaatigineqassanngilaq",
  startTrip: "Angalaneruk aallartit",
  pauseTrip: "Unitsit",
  resumeTrip: "Ingerlatiinnarit",
  stopTrip: "Unitsikkuk",
  addWaypoint: "Waypoint-imik ilanngut",
  waypointNote: "Allagartaq",
  saveWaypoint: "Toqqoruk",
  tripSummary: "Angalanerup nalunaarutaa",
  duration: "Piffissaq",
  distance: "Ungasissuseq",
  points: "Punktit",
  largestGap: "Gap-i anginerpaaq",
  exportGpx: "GPX-imik aniguk",
  exportGeojson: "GeoJSON-imik aniguk",
  deleteTrip: "Angalaneruk peeruk",
  gpsState: "GPS",
  accuracy: "Eqqornerussuseq",
  lastPoint: "Kingulleq punkti",
  profile: "Recording profile",
  offlineReady: "Offline-imi ammaasinnaavoq",
  onlineDemoBasemap: "Demo basemap — soqortaatigineqassanngilaq",
  weather: "Sila",
  ice: "Siku",
  stale: "Piffissanngortoq / STALE",
  validTo: "Atorusinnaanera",
  landing: "Mittarfik / landing",
  rockShallow: "Qaqqaq / ikkattumik",
  current: "Sarva",
  shelter: "Qarmaq / shelter",
  note: "Allagartaq",
  privateOnly: "Privatikiinnarluni",
  recordingForegroundOnly:
    "Web/PWA: screen-i ammasoq kisiat. Locked-screen native plugin-ikkut kingorna. (provisional)",
  forceQuitLimit:
    "Force-quit / location-off unitsikkumaaq. Paasissutissat safety-tekstimiipput.",
  loading: "Uterenneq...",
  error: "Kukkuneq",
  mapContent: "Kortip imarisai",
  scopeAll: "Tamarmik aqqi",
  scopeLocalities: "Nunaqarfiit / bygdit",
  scopeGeography: "Nunap qeqqani",
  clickPlaceHint: "Nunaqarfik / aqqi tooruk — paasissutissat takutinneqassapput.",
  closePlace: "Matuk",
  danishName: "Qallunaat aqqa",
  historicalName: "Aqqi itoqanngitsoq",
  municipality: "Kommune",
  coordinates: "Koordinater",
  inhabitedPlace: "Nunaqarfik",
  geographicFeature: "Nunap ilusaa",
  placeList: "Nunaqarfiit",
  localitiesCount: "Nunaqarfiit corridor-imi",
  openMap: "Kortimuk",
  backPrepare: "Uterit",
  showPanel: "Panel",
  hidePanel: "Matuk panel",
  demoGpsNote:
    "HTTP Omarchy: GPS simulator atorneqarpoq (secure context pissaanngilaq).",
};

const da: Dict = {
  appTitle: "Nunat Marine",
  appTagline: "Privat rejsejournal for småbåde",
  safetyTitle: "Et hjælpeværktøj — ikke et søkort",
  safetyBody:
    "Dette er en lokal-videns- og turjournal. Den erstatter ikke officielle søkort, plotter, VHF, AIS, PLB/EPIRB eller redningstjenester.",
  safetyPrivate:
    "Ture og waypoints er private som standard. Synkronisering er slået fra.",
  safetyAccept: "Jeg forstår",
  language: "Sprog",
  corridorTitle: "Uummannaq–Qaarsut",
  download: "Download",
  downloaded: "Downloadet",
  verify: "Verificér",
  verified: "Checksum OK",
  deletePackage: "Slet pakke",
  dataAsOf: "Data pr.",
  bytes: "Bytes",
  notForNavigation: "Kun kontekst — ikke til navigation",
  startTrip: "Start tur",
  pauseTrip: "Pause",
  resumeTrip: "Fortsæt",
  stopTrip: "Stop tur",
  addWaypoint: "Tilføj waypoint",
  waypointNote: "Note",
  saveWaypoint: "Gem",
  tripSummary: "Turoversigt",
  duration: "Varighed",
  distance: "Distance",
  points: "Punkter",
  largestGap: "Største hul",
  exportGpx: "Eksportér GPX",
  exportGeojson: "Eksportér GeoJSON",
  deleteTrip: "Slet tur",
  gpsState: "GPS",
  accuracy: "Nøjagtighed",
  lastPoint: "Seneste punkt",
  profile: "Profil",
  offlineReady: "Klar offline",
  onlineDemoBasemap: "Demo-basiskort — ikke til navigation",
  weather: "Vejr",
  ice: "Is",
  stale: "Forældet / STALE",
  validTo: "Gyldig til",
  landing: "Landing",
  rockShallow: "Sten / lavt vand",
  current: "Strøm",
  shelter: "Læ",
  note: "Note",
  privateOnly: "Kun privat",
  recordingForegroundOnly:
    "Web/PWA: optager kun mens appen er synlig. Locked-screen kræver native plugin.",
  forceQuitLimit:
    "Force-quit / slået lokation stopper optagelse. Begrænsninger står i sikkerhedsteksten.",
  loading: "Indlæser…",
  error: "Fejl",
  mapContent: "Kortindhold",
  scopeAll: "Alle navne",
  scopeLocalities: "Byer / bygder",
  scopeGeography: "Geografi",
  clickPlaceHint: "Klik et sted på kortet for detaljer.",
  closePlace: "Luk",
  danishName: "Dansk navn",
  historicalName: "Historisk navn",
  municipality: "Kommune",
  coordinates: "Koordinater",
  inhabitedPlace: "Bebyggelse",
  geographicFeature: "Geografisk sted",
  placeList: "Steder",
  localitiesCount: "Byer/bygder i korridoren",
  openMap: "Åbn kort",
  backPrepare: "Tilbage",
  showPanel: "Panel",
  hidePanel: "Skjul panel",
  demoGpsNote:
    "HTTP Omarchy: bruger GPS-simulator (browser kræver HTTPS til rigtig GPS).",
};

const en: Dict = {
  appTitle: "Nunat Marine",
  appTagline: "Private trip notebook for small-boat travel",
  safetyTitle: "A companion — not a nautical chart",
  safetyBody:
    "This app is a local-knowledge and trip-recording companion. It does not replace official charts, a chartplotter, VHF, AIS, PLB/EPIRB, or emergency services.",
  safetyPrivate:
    "Trips and waypoints stay private by default. Sync is off.",
  safetyAccept: "I understand",
  language: "Language",
  corridorTitle: "Uummannaq–Qaarsut",
  download: "Download",
  downloaded: "Downloaded",
  verify: "Verify",
  verified: "Checksum OK",
  deletePackage: "Delete package",
  dataAsOf: "Data as of",
  bytes: "Bytes",
  notForNavigation: "Context only — not for navigation",
  startTrip: "Start trip",
  pauseTrip: "Pause",
  resumeTrip: "Resume",
  stopTrip: "Stop trip",
  addWaypoint: "Add waypoint",
  waypointNote: "Note",
  saveWaypoint: "Save",
  tripSummary: "Trip summary",
  duration: "Duration",
  distance: "Distance",
  points: "Points",
  largestGap: "Largest gap",
  exportGpx: "Export GPX",
  exportGeojson: "Export GeoJSON",
  deleteTrip: "Delete trip",
  gpsState: "GPS",
  accuracy: "Accuracy",
  lastPoint: "Last point",
  profile: "Profile",
  offlineReady: "Offline ready",
  onlineDemoBasemap: "Demo basemap — not for navigation",
  weather: "Weather",
  ice: "Ice",
  stale: "Stale",
  validTo: "Valid to",
  landing: "Landing",
  rockShallow: "Rock / shallow",
  current: "Current",
  shelter: "Shelter",
  note: "Note",
  privateOnly: "Private only",
  recordingForegroundOnly:
    "Web/PWA records only while visible. Locked-screen needs the native plugin.",
  forceQuitLimit:
    "Force-quit or location-off stops recording. Limits are stated in the safety text.",
  loading: "Loading…",
  error: "Error",
  mapContent: "Map content",
  scopeAll: "All names",
  scopeLocalities: "Towns / villages",
  scopeGeography: "Geography",
  clickPlaceHint: "Click a place on the map for details.",
  closePlace: "Close",
  danishName: "Danish name",
  historicalName: "Historical name",
  municipality: "Municipality",
  coordinates: "Coordinates",
  inhabitedPlace: "Inhabited place",
  geographicFeature: "Geographic feature",
  placeList: "Places",
  localitiesCount: "Towns/villages in corridor",
  openMap: "Open map",
  backPrepare: "Back",
  showPanel: "Panel",
  hidePanel: "Hide panel",
  demoGpsNote:
    "HTTP Omarchy: using GPS simulator (browser needs HTTPS for real GPS).",
};

export const MESSAGES: Record<Locale, Dict> = { kl, da, en };
