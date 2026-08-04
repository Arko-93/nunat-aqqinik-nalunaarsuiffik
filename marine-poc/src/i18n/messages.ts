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
  | "demoGpsNote"
  | "httpsGpsOk"
  | "httpsGpsHint"
  | "mockedGpsWarning"
  | "downloadFirst"
  | "speed"
  | "course"
  | "returnAlongTrack"
  | "followGps"
  | "accuracyP50"
  | "accuracyP90"
  | "pointQuality"
  | "good"
  | "weak"
  | "rejected"
  | "chooseRegion"
  | "regionInstalled"
  | "geographyCount"
  | "selectRegion"
  | "downloadingMap"
  | "mapReady"
  | "changeCoast"
  | "gotIt"
  | "bootFailed"
  | "pointA"
  | "pointB"
  | "setPointA"
  | "setPointB"
  | "pointASet"
  | "pointBSet"
  | "clearRoute"
  | "tapTownForA"
  | "tapTownForB"
  | "routeReady"
  | "pickTownForTravel"
  | "straightLineHint"
  | "bearing"
  | "swapAB"
  | "httpsRequiredBanner"
  | "openHttpsGps"
  | "startDemoGps"
  | "stopDemoGps"
  | "demoGpsActive"
  | "gpsCoords"
  | "townsAreNotGps"
  | "pickingA"
  | "pickingB"
  | "searchPlace"
  | "searchNoResults"
  | "routing"
  | "routeWater"
  | "routeStraightFallback"
  | "companionRouteHint"
  | "travelPlanner"
  | "routeOptions"
  | "routeShortest"
  | "routeNorth"
  | "routeSouth";

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
    "HTTP-ikkut phone GPS atuunngilaq. https://marine.sikumut.gl atoruk.",
  httpsGpsOk: "HTTPS — phone GPS atorneqarsinnaavoq.",
  httpsGpsHint: "GPS aqukkuk — accuracy meter-ini takuneqassaaq.",
  mockedGpsWarning: "DEMO GPS Uummannaq — illit phone-it nagga.",
  downloadFirst: "Siulliullugu package download-iuk.",
  speed: "Sukkasussuseq",
  course: "Kurs",
  returnAlongTrack: "Track-imut uterit",
  followGps: "GPS malit",
  accuracyP50: "Accuracy p50",
  accuracyP90: "Accuracy p90",
  pointQuality: "Punktit quality",
  good: "ajunngitsut",
  weak: "sajukkat",
  rejected: "peersimasut",
  chooseRegion: "Siniffik / coast region",
  regionInstalled: "Region downloadereqqaarneq",
  geographyCount: "Nunap aqqi",
  selectRegion: "Region-imik tooruk",
  downloadingMap: "Nunap assinga aqqutissiuussineq…",
  mapReady: "Nunap assinga ready",
  changeCoast: "Siniffik allamik",
  gotIt: "Akueraa",
  bootFailed: "Nunap assinga aqqutissiuussineq ajornartorsiorpoq",
  pointA: "A",
  pointB: "B",
  setPointA: "A-mik aallartit",
  setPointB: "B-mik aallartit",
  pointASet: "A toqqarneq",
  pointBSet: "B toqqarneq",
  clearRoute: "Peeruk",
  tapTownForA: "Nunaqarfimmik tooruk — Point A",
  tapTownForB: "Nunaqarfimmik tooruk — Point B",
  routeReady: "A → B ready",
  pickTownForTravel: "Nunaqarfik/bygd kisiat A/B-mut",
  straightLineHint: "Aqqut straight-line — navigation-imut atorneqanngilaq",
  bearing: "Bearing",
  swapAB: "A ↔ B",
  httpsRequiredBanner:
    "HTTP-ikkut phone GPS atuunngilaq. Nunaqarfiit map-imi illuatut — qorsuk puck DEMO Uummannaq. HTTPS-imut real GPS.",
  openHttpsGps: "HTTPS GPS ammaruk",
  startDemoGps: "Demo GPS (Uummannaq)",
  stopDemoGps: "Demo GPS unitsinneq",
  demoGpsActive: "DEMO GPS · Uummannaq — illit nammineq najugaqanngilaq",
  gpsCoords: "GPS",
  townsAreNotGps: "Nunaqarfiit NunaGIS midpoint (± km) — GPS fix nagga.",
  pickingA: "Tuluttut A-mik aallartippaa",
  pickingB: "Tuluttut B-mik aallartippaa",
  searchPlace: "Nunaqarfik ujaruk…",
  searchNoResults: "Nassaarineqanngilaq",
  routing: "Umiatsiami aqqut…",
  routeWater: "Imaq aqqutigalugu (ikkarliit aniguk)",
  routeStraightFallback: "Straight-line — water path nassaarineqanngilaq",
  companionRouteHint: "Ikiortissaavoq — soqqutinut taarsiutinngilaq",
  travelPlanner: "A → B",
  routeOptions: "Aqqutit",
  routeShortest: "Nanertoq",
  routeNorth: "Avannamut",
  routeSouth: "Kujammut",
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
  verify: "Verificér igen",
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
    "HTTP kan ikke bruge telefon-GPS. Åbn https://marine.sikumut.gl",
  httpsGpsOk: "HTTPS — telefonens GPS kan bruges.",
  httpsGpsHint: "Tillad GPS. Nøjagtighed vises i meter.",
  mockedGpsWarning: "DEMO-GPS ved Uummannaq — ikke din telefon.",
  downloadFirst: "Download pakken først.",
  speed: "Fart",
  course: "Kurs",
  returnAlongTrack: "Vis min rute",
  followGps: "Følg GPS",
  accuracyP50: "Nøjagtighed p50",
  accuracyP90: "Nøjagtighed p90",
  pointQuality: "Punktkvalitet",
  good: "gode",
  weak: "svage",
  rejected: "afviste",
  chooseRegion: "Kystregion",
  regionInstalled: "Region downloadet",
  geographyCount: "Geografiske navne",
  selectRegion: "Vælg region",
  downloadingMap: "Downloader kort…",
  mapReady: "Kort klar",
  changeCoast: "Skift kyst",
  gotIt: "Forstået",
  bootFailed: "Kunne ikke hente kortet",
  pointA: "A",
  pointB: "B",
  setPointA: "Sæt som A",
  setPointB: "Sæt som B",
  pointASet: "A valgt",
  pointBSet: "B valgt",
  clearRoute: "Ryd",
  tapTownForA: "Tryk på en by/bygd — Point A",
  tapTownForB: "Tryk på en by/bygd — Point B",
  routeReady: "A → B klar",
  pickTownForTravel: "Kun byer/bygder kan være A/B",
  straightLineHint: "Straight-line — ikke en navigationsrute",
  bearing: "Pejling",
  swapAB: "A ↔ B",
  httpsRequiredBanner:
    "Telefon-GPS virker ikke på HTTP. By-prikker er rigtige kortsteder — den grønne prik var før en falsk Uummannaq-demo. Brug HTTPS for rigtig GPS.",
  openHttpsGps: "Åbn HTTPS-GPS",
  startDemoGps: "Demo-GPS (Uummannaq)",
  stopDemoGps: "Stop demo-GPS",
  demoGpsActive: "DEMO-GPS · Uummannaq — ikke din rigtige position",
  gpsCoords: "GPS",
  townsAreNotGps:
    "Bypositioner er NunaGIS-midtpunkter (± km). De er ikke GPS-fixes.",
  pickingA: "Næste tryk sætter punkt A",
  pickingB: "Næste tryk sætter punkt B",
  searchPlace: "Søg by/bygd…",
  searchNoResults: "Ingen resultater",
  routing: "Beregner bådrute…",
  routeWater: "Vandrute uden om land",
  routeStraightFallback: "Straight-line — ingen vandrute fundet",
  companionRouteHint: "Hjælperute — ikke til navigation",
  travelPlanner: "A → B",
  routeOptions: "Ruter",
  routeShortest: "Korteste",
  routeNorth: "Nord om",
  routeSouth: "Syd om",
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
  verify: "Re-verify",
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
    "HTTP cannot use phone GPS. Open https://marine.sikumut.gl for real location.",
  httpsGpsOk: "HTTPS — phone GPS can be used.",
  httpsGpsHint: "Allow GPS. Accuracy shows in meters on the map.",
  mockedGpsWarning: "DEMO GPS near Uummannaq — not your phone.",
  downloadFirst: "Download the coast region package first.",
  speed: "Speed",
  course: "Course",
  returnAlongTrack: "Show my track",
  followGps: "Follow GPS",
  accuracyP50: "Accuracy p50",
  accuracyP90: "Accuracy p90",
  pointQuality: "Point quality",
  good: "good",
  weak: "weak",
  rejected: "rejected",
  chooseRegion: "Coast region",
  regionInstalled: "Region downloaded",
  geographyCount: "Geographic names",
  selectRegion: "Select region",
  downloadingMap: "Downloading map…",
  mapReady: "Map ready",
  changeCoast: "Change coast",
  gotIt: "Got it",
  bootFailed: "Could not load the map",
  pointA: "A",
  pointB: "B",
  setPointA: "Set as A",
  setPointB: "Set as B",
  pointASet: "A set",
  pointBSet: "B set",
  clearRoute: "Clear",
  tapTownForA: "Tap a town or village — Point A",
  tapTownForB: "Tap a town or village — Point B",
  routeReady: "A → B ready",
  pickTownForTravel: "Only towns/villages can be A or B",
  straightLineHint: "Straight line — not a navigation route",
  bearing: "Bearing",
  swapAB: "A ↔ B",
  httpsRequiredBanner:
    "Your phone GPS does not work on HTTP. Town dots are real map places — the green puck was a fake Uummannaq demo before. Open HTTPS for real GPS.",
  openHttpsGps: "Open HTTPS GPS",
  startDemoGps: "Demo GPS (Uummannaq)",
  stopDemoGps: "Stop demo GPS",
  demoGpsActive: "DEMO GPS · Uummannaq crawl — not your real position",
  gpsCoords: "GPS",
  townsAreNotGps:
    "Town positions come from NunaGIS midpoints (± km). They are not GPS fixes.",
  pickingA: "Next tap sets Point A",
  pickingB: "Next tap sets Point B",
  searchPlace: "Search town or village…",
  searchNoResults: "No matches",
  routing: "Calculating boat route…",
  routeWater: "Water route around land",
  routeStraightFallback: "Straight line — no water path found",
  companionRouteHint: "Companion route — not for navigation",
  travelPlanner: "A → B",
  routeOptions: "Routes",
  routeShortest: "Shortest",
  routeNorth: "Around north",
  routeSouth: "Around south",
};

export const MESSAGES: Record<Locale, Dict> = { kl, da, en };
