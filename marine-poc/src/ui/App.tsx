import { Effect } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadConditionFixture } from "../domain/conditions.ts";
import {
  corridorPlaceFromFeature,
  placeMatchesScope,
  type CorridorPlace,
  type PlaceScope,
} from "../domain/place.ts";
import { summarizeTrip } from "../domain/trip-metrics.ts";
import type {
  ConditionSnapshot,
  CorridorPackageManifest,
  GpsUiState,
  LocationPoint,
  RecordingProfile,
  TrackPoint,
  Trip,
  TripSummary,
  Waypoint,
  WaypointCategory,
} from "../domain/types.ts";
import { tripToGeoJsonString } from "../export/geojson.ts";
import { tripToGpx } from "../export/gpx.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  formatDistanceKm,
  initialBearingDeg,
} from "../map/geo.ts";
import { MarineMap } from "../map/MarineMap.tsx";
import { loadManifestFromJson } from "../packages/manifest.ts";
import {
  installCorridorPackage,
  isPackageInstalled,
  loadRegionCatalog,
  type RegionCatalogEntry,
  verifyInstalledPackage,
} from "../packages/package-cache.ts";
import {
  extractLandMask,
  planBoatRoutes,
  routesAreDistinct,
  straightBoatRoute,
  type BoatRoute,
  type LandMask,
} from "../routing/boat-route.ts";
import { IndexedDbMarineStore } from "../storage/repository.ts";
import {
  BridgedLocationService,
  HTTPS_GPS_URL,
  toTrackPoint,
} from "../tracking/location-service.ts";
import { PlaceDetail } from "./PlaceDetail.tsx";
import { PlaceSearch } from "./PlaceSearch.tsx";

type PickingTarget = "A" | "B";

const SAFETY_KEY = "nunat-marine-safety-accepted-v5";
const REGION_KEY = "nunat-marine-region-slug";

type Screen = "map" | "summary";

const downloadBlob = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const formatDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const ageSec = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 1000);
};

export function App() {
  const { t, locale, setLocale, locales } = useI18n();
  const store = useMemo(() => new IndexedDbMarineStore(), []);
  const location = useMemo(() => new BridgedLocationService(), []);
  const secureContext =
    typeof window !== "undefined" ? window.isSecureContext : false;

  const [screen, setScreen] = useState<Screen>("map");
  const [safetyOpen, setSafetyOpen] = useState(
    () => localStorage.getItem(SAFETY_KEY) !== "1",
  );
  const [coastPickerOpen, setCoastPickerOpen] = useState(false);
  const [regions, setRegions] = useState<RegionCatalogEntry[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(
    () => localStorage.getItem(REGION_KEY) ?? "greenland",
  );
  const [manifest, setManifest] = useState<CorridorPackageManifest | null>(
    null,
  );
  const [packageReady, setPackageReady] = useState(false);
  const [packageInstalled, setPackageInstalled] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<string | null>(
    t("downloadingMap"),
  );
  const selectedRegion =
    regions.find((region) => region.slug === selectedSlug) ?? regions[0] ?? null;
  const packageBase = selectedRegion?.path ?? `/packages/${selectedSlug}`;
  const packageId = selectedRegion?.id ?? "";
  const [weather, setWeather] = useState<ConditionSnapshot | null>(null);
  const [ice, setIce] = useState<ConditionSnapshot | null>(null);
  const [gpsState, setGpsState] = useState<GpsUiState>("unknown");
  const [position, setPosition] = useState<LocationPoint | null>(null);
  const [profile] = useState<RecordingProfile>("normal_travel");
  const [trip, setTrip] = useState<Trip | null>(null);
  const tripRef = useRef<Trip | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [waypointCategory, setWaypointCategory] =
    useState<WaypointCategory>("landing");
  const [waypointNote, setWaypointNote] = useState("");
  const [showWaypointSheet, setShowWaypointSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Localities first — geography (bays/seas) correctly sit in water and look "wrong"
  // if the user expects every label to be a settlement.
  const [placeScope, setPlaceScope] = useState<PlaceScope>("localities");
  const [selectedPlace, setSelectedPlace] = useState<CorridorPlace | null>(
    null,
  );
  const [corridorPlaces, setCorridorPlaces] = useState<CorridorPlace[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [followPosition, setFollowPosition] = useState(false);
  const [pointA, setPointA] = useState<CorridorPlace | null>(null);
  const [pointB, setPointB] = useState<CorridorPlace | null>(null);
  const [picking, setPicking] = useState<PickingTarget>("A");
  const [demoGps, setDemoGps] = useState(false);
  const [routeOptions, setRouteOptions] = useState<BoatRoute[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const landMaskRef = useRef<LandMask | null>(null);
  const landLoadPromiseRef = useRef<Promise<void> | null>(null);
  const routePlanIdRef = useRef(0);
  const sequenceRef = useRef(0);
  const boatRoute = routeOptions[selectedRouteIndex] ?? null;

  const localities = useMemo(
    () =>
      corridorPlaces
        .filter((place) => place.isLocality)
        .sort((a, b) => a.officialName.localeCompare(b.officialName)),
    [corridorPlaces],
  );
  const visiblePlaces = useMemo(
    () =>
      corridorPlaces
        .filter((place) => placeMatchesScope(place, placeScope))
        .sort((a, b) => {
          if (a.isLocality !== b.isLocality) return a.isLocality ? -1 : 1;
          return a.officialName.localeCompare(b.officialName);
        }),
    [corridorPlaces, placeScope],
  );
  const routeDistanceM = boatRoute?.distanceM ?? null;
  const routeBearing = useMemo(() => {
    if (!pointA || !pointB) return null;
    return initialBearingDeg(
      pointA.latitude,
      pointA.longitude,
      pointB.latitude,
      pointB.longitude,
    );
  }, [pointA, pointB]);
  const routeCoordinates = boatRoute?.coordinates ?? [];

  const assignPointA = (place: CorridorPlace) => {
    if (!place.isLocality) {
      setNotice(t("pickTownForTravel"));
      return;
    }
    if (pointB?.globalId === place.globalId) setPointB(null);
    setPointA(place);
    setSelectedPlace(place);
    setPicking("B");
    setNotice(pointB ? t("routeReady") : t("pickingB"));
  };

  const assignPointB = (place: CorridorPlace) => {
    if (!place.isLocality) {
      setNotice(t("pickTownForTravel"));
      return;
    }
    if (pointA?.globalId === place.globalId) {
      setNotice(t("pickTownForTravel"));
      return;
    }
    setPointB(place);
    setSelectedPlace(place);
    setPicking("A");
    setNotice(pointA ? t("routeReady") : t("pickingA"));
  };

  const handlePlacePick = (place: CorridorPlace | null) => {
    setSelectedPlace(place);
    if (!place) return;
    if (!place.isLocality) {
      setNotice(t("pickTownForTravel"));
      return;
    }
    if (picking === "A") assignPointA(place);
    else assignPointB(place);
  };

  const ensureLandMask = () => {
    if (landMaskRef.current) return Promise.resolve();
    if (landLoadPromiseRef.current) return landLoadPromiseRef.current;
    landLoadPromiseRef.current = (async () => {
      const response = await fetch(`${packageBase}/land.geojson`);
      if (!response.ok) {
        throw new Error(`land fetch failed (${response.status})`);
      }
      const land = (await response.json()) as GeoJSON.FeatureCollection;
      landMaskRef.current = extractLandMask(land);
    })().catch((err) => {
      landLoadPromiseRef.current = null;
      throw err;
    });
    return landLoadPromiseRef.current;
  };

  useEffect(() => {
    landMaskRef.current = null;
    landLoadPromiseRef.current = null;
  }, [packageBase]);

  // Preload land mask as soon as the package is ready (snappier A→B).
  useEffect(() => {
    if (!packageReady) return;
    void ensureLandMask().catch(() => {
      /* surfaced when planning */
    });
  }, [packageReady, packageBase]);

  useEffect(() => {
    let cancelled = false;
    if (!pointA || !pointB) {
      setRouteOptions([]);
      setSelectedRouteIndex(0);
      setRouteLoading(false);
      return;
    }
    const from = {
      longitude: pointA.longitude,
      latitude: pointA.latitude,
    };
    const to = {
      longitude: pointB.longitude,
      latitude: pointB.latitude,
    };
    // Instant straight preview while water corridors compute.
    setRouteOptions([straightBoatRoute(from, to)]);
    setSelectedRouteIndex(0);
    setRouteLoading(true);
    setNotice(t("routing"));
    const planId = ++routePlanIdRef.current;
    const yieldPaint = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    (async () => {
      try {
        await ensureLandMask();
        await yieldPaint();
        if (cancelled || planId !== routePlanIdRef.current) return;
        const mask = landMaskRef.current;
        if (!mask) throw new Error("Land mask unavailable");

        // 1) Shortest sea path first (snappy).
        const primary = planBoatRoutes(from, to, mask, {
          biases: ["shortest"],
        });
        if (cancelled || planId !== routePlanIdRef.current) return;
        setRouteOptions(primary.routes);
        setSelectedRouteIndex(0);
        const chosen = primary.routes[0]!;
        setNotice(
          chosen.mode === "water"
            ? t("routeWater")
            : (chosen.warning ?? t("routeStraightFallback")),
        );
        if (chosen.mode !== "water") return;

        // Alternate corridors only on shorter hops (long legs are already costly).
        const span = Math.max(
          Math.abs(from.longitude - to.longitude),
          Math.abs(from.latitude - to.latitude),
        );
        if (chosen.mode === "water" && span < 1.8) {
          await yieldPaint();
          if (cancelled || planId !== routePlanIdRef.current) return;
          const alts = planBoatRoutes(from, to, mask, {
            biases: ["north", "south"],
          });
          if (cancelled || planId !== routePlanIdRef.current) return;
          const merged = [chosen];
          for (const alt of alts.routes) {
            if (alt.mode !== "water") continue;
            if (
              merged.every((existing) =>
                routesAreDistinct(existing.coordinates, alt.coordinates),
              )
            ) {
              merged.push(alt);
            }
          }
          merged.sort((a, b) => a.distanceM - b.distanceM);
          setRouteOptions(merged);
          setSelectedRouteIndex(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled && planId === routePlanIdRef.current) {
          setRouteLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pointA, pointB, packageBase, t]);

  const loadPlaces = async (base: string) => {
    const placesResponse = await fetch(`${base}/places.geojson`);
    if (!placesResponse.ok) {
      throw new Error(`places fetch failed (${placesResponse.status})`);
    }
    const placesJson = (await placesResponse.json()) as GeoJSON.FeatureCollection;
    setCorridorPlaces(
      placesJson.features
        .map((feature) => corridorPlaceFromFeature(feature))
        .filter((place): place is CorridorPlace => place !== null),
    );
  };

  useEffect(() => {
    tripRef.current = trip;
  }, [trip]);

  const ensureGps = async () => {
    if (!secureContext) {
      setGpsState("denied");
      setPosition(null);
      setError(null);
      setNotice(t("httpsRequiredBanner"));
      return;
    }
    setGpsState("requesting");
    setError(null);
    try {
      const point = await Effect.runPromise(location.getCurrent());
      setPosition(point);
      setDemoGps(false);
      setGpsState(
        point.horizontalAccuracyM != null && point.horizontalAccuracyM > 80
          ? "weak"
          : "ready",
      );
      setNotice(point.mocked ? t("mockedGpsWarning") : t("httpsGpsOk"));
      await Effect.runPromise(location.start(profile));
    } catch (err) {
      setError(String(err));
      setGpsState("denied");
      setNotice(t("httpsGpsHint"));
    }
  };

  const startDemoGps = async () => {
    if (!location.startDemo) return;
    setError(null);
    try {
      await Effect.runPromise(location.stop());
      await Effect.runPromise(location.startDemo(profile));
      setDemoGps(true);
      setGpsState("ready");
      setFollowPosition(false);
      setNotice(t("demoGpsActive"));
    } catch (err) {
      setError(String(err));
    }
  };

  const stopDemoGps = async () => {
    await Effect.runPromise(location.stop());
    setDemoGps(false);
    setPosition(null);
    setGpsState("unknown");
    setNotice(
      secureContext ? t("httpsGpsHint") : t("httpsRequiredBanner"),
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPackageReady(false);
      setPackageInstalled(false);
      setPackageError(null);
      setInstallProgress(t("downloadingMap"));
      setError(null);

      try {
        const catalog = await loadRegionCatalog();
        if (cancelled) return;
        setRegions(catalog.regions);
        const slug =
          catalog.regions.some((region) => region.slug === selectedSlug)
            ? selectedSlug
            : (catalog.regions[0]?.slug ?? "greenland");
        if (slug !== selectedSlug) setSelectedSlug(slug);
        localStorage.setItem(REGION_KEY, slug);

        const region =
          catalog.regions.find((entry) => entry.slug === slug) ??
          catalog.regions[0];
        if (!region) throw new Error("No map package in catalog");

        const networkManifest = await loadManifestFromJson(
          await fetch(`${region.path}/manifest.json`),
        );
        if (cancelled) return;
        setManifest(networkManifest);

        const installed = await isPackageInstalled(region.path, region.id);
        if (installed) {
          try {
            const verified = await verifyInstalledPackage(region.path);
            if (cancelled) return;
            setManifest(verified);
            setPackageInstalled(true);
          } catch {
            // Re-download if cache is incomplete.
            const result = await installCorridorPackage(
              region.path,
              (progress) => {
                if (!cancelled) {
                  setInstallProgress(
                    `${t("downloadingMap")} ${progress.path}`,
                  );
                }
              },
            );
            if (cancelled) return;
            setManifest(result.manifest);
            setPackageInstalled(result.cached);
            await Effect.runPromise(
              store.savePackage({
                manifest: result.manifest,
                installedAt: new Date().toISOString(),
                verified: true,
                localPath: region.path,
              }),
            );
          }
        } else {
          const result = await installCorridorPackage(
            region.path,
            (progress) => {
              if (!cancelled) {
                setInstallProgress(`${t("downloadingMap")} ${progress.path}`);
              }
            },
          );
          if (cancelled) return;
          setManifest(result.manifest);
          setPackageInstalled(result.cached);
          await Effect.runPromise(
            store.savePackage({
              manifest: result.manifest,
              installedAt: new Date().toISOString(),
              verified: true,
              localPath: region.path,
            }),
          );
        }

        await loadPlaces(region.path);
        if (cancelled) return;

        setPackageReady(true);
        setPackageError(null);
        setInstallProgress(null);
        setNotice(t("tapTownForA"));
        setScreen("map");

        const [weatherSnap, iceSnap] = await Promise.all([
          loadConditionFixture("/conditions/weather-mock.json"),
          loadConditionFixture("/conditions/ice-mock.json"),
        ]);
        if (!cancelled) {
          setWeather(weatherSnap);
          setIce(iceSnap);
        }

        const active = await Effect.runPromise(store.recoverActive());
        if (!cancelled && active) {
          setTrip(active.trip);
          tripRef.current = active.trip;
          const points = await Effect.runPromise(
            store.listPoints(active.trip.id),
          );
          setTrack([...points]);
          sequenceRef.current = points.length;
          const wps = await Effect.runPromise(
            store.listForTrip(active.trip.id),
          );
          setWaypoints([...wps]);
          setGpsState(active.trip.status === "paused" ? "paused" : "recording");
        } else if (!cancelled) {
          void ensureGps();
        }
      } catch (err) {
        if (!cancelled) {
          setPackageError(String(err));
          setError(`${t("bootFailed")}: ${String(err)}`);
          setInstallProgress(null);
          setPackageReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // ensureGps is stable enough via location/store; region swap re-boots package.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, selectedSlug]);

  useEffect(() => {
    const unsubscribe = location.subscribe(
      (point) => {
        setPosition(point);
        if (point.horizontalAccuracyM != null && point.horizontalAccuracyM > 80) {
          setGpsState((prev) =>
            prev === "recording" || prev === "paused" ? prev : "weak",
          );
        } else {
          setGpsState((prev) =>
            prev === "recording" || prev === "paused" ? prev : "ready",
          );
        }
        const activeTrip = tripRef.current;
        if (!activeTrip || activeTrip.status !== "active") return;
        sequenceRef.current += 1;
        const trackPoint = toTrackPoint(
          activeTrip.id,
          sequenceRef.current,
          point,
        );
        setTrack((prev) => [...prev, trackPoint]);
        void Effect.runPromise(store.appendPoint(trackPoint));
        const nextTrip = { ...activeTrip, pointCount: sequenceRef.current };
        tripRef.current = nextTrip;
        setTrip(nextTrip);
        void Effect.runPromise(store.saveTrip(nextTrip));
      },
      (err) => {
        setError(err.message);
        setGpsState("denied");
      },
    );
    return unsubscribe;
  }, [location, store]);

  const selectRegion = (slug: string) => {
    if (slug === selectedSlug) {
      setCoastPickerOpen(false);
      return;
    }
    localStorage.setItem(REGION_KEY, slug);
    setSelectedSlug(slug);
    setCoastPickerOpen(false);
    setPackageReady(false);
    setPackageInstalled(false);
    setManifest(null);
    setCorridorPlaces([]);
    setSelectedPlace(null);
    setError(null);
    setNotice(null);
    setInstallProgress(t("downloadingMap"));
  };

  const startTrip = async () => {
    if (!packageReady) {
      setError(t("downloadFirst"));
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      await ensureGps();
      const session = await Effect.runPromise(location.start(profile));
      const nextTrip: Trip = {
        id: session.tripId,
        startedAt: session.startedAt,
        endedAt: null,
        status: "active",
        profile,
        visibility: { type: "private" },
        pointCount: 0,
        corridorPackageId: packageId || null,
      };
      sequenceRef.current = 0;
      setTrack([]);
      setWaypoints([]);
      tripRef.current = nextTrip;
      setTrip(nextTrip);
      await Effect.runPromise(store.saveTrip(nextTrip));
      setGpsState("recording");
      setScreen("map");
      setPanelOpen(false);
      setFollowPosition(true);
    } catch (err) {
      setError(String(err));
      setGpsState("denied");
    } finally {
      setBusy(false);
    }
  };

  const pauseTrip = async () => {
    if (!tripRef.current) return;
    const next = { ...tripRef.current, status: "paused" as const };
    tripRef.current = next;
    setTrip(next);
    setGpsState("paused");
    await Effect.runPromise(store.saveTrip(next));
    await Effect.runPromise(location.stop());
  };

  const resumeTrip = async () => {
    if (!tripRef.current) return;
    await Effect.runPromise(location.start(profile));
    const next = { ...tripRef.current, status: "active" as const };
    tripRef.current = next;
    setTrip(next);
    setGpsState("recording");
    await Effect.runPromise(store.saveTrip(next));
  };

  const stopTrip = async () => {
    if (!tripRef.current) return;
    setBusy(true);
    try {
      await Effect.runPromise(location.stop());
      const endedAt = new Date().toISOString();
      const current = tripRef.current;
      const next = { ...current, status: "completed" as const, endedAt };
      await Effect.runPromise(store.saveTrip(next));
      const points = await Effect.runPromise(store.listPoints(current.id));
      const nextSummary = summarizeTrip(
        current.id,
        current.startedAt,
        endedAt,
        points,
      );
      setSummary(nextSummary);
      tripRef.current = next;
      setTrip(next);
      setGpsState("ready");
      setScreen("summary");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveWaypoint = async () => {
    if (!position) {
      setError("No GPS position for waypoint");
      return;
    }
    const waypoint: Waypoint = {
      id: crypto.randomUUID(),
      tripId: tripRef.current?.id ?? null,
      category: waypointCategory,
      kind: "personal_waypoint",
      note: waypointNote,
      latitude: position.latitude,
      longitude: position.longitude,
      recordedAt: new Date().toISOString(),
      visibility: { type: "private" },
    };
    await Effect.runPromise(store.saveWaypoint(waypoint));
    setWaypoints((prev) => [...prev, waypoint]);
    setWaypointNote("");
    setShowWaypointSheet(false);
  };

  const exportTrip = async (format: "gpx" | "geojson") => {
    if (!trip) return;
    const points = await Effect.runPromise(store.listPoints(trip.id));
    const wps = await Effect.runPromise(store.listForTrip(trip.id));
    if (format === "gpx") {
      downloadBlob(
        `${trip.id}.gpx`,
        tripToGpx(trip.id, points, wps),
        "application/gpx+xml",
      );
    } else {
      downloadBlob(
        `${trip.id}.geojson`,
        tripToGeoJsonString(trip.id, points, wps),
        "application/geo+json",
      );
    }
  };

  const deleteTrip = async () => {
    if (!trip) return;
    if (!confirm("Delete this trip permanently?")) return;
    await Effect.runPromise(store.deleteTrip(trip.id));
    tripRef.current = null;
    setTrip(null);
    setTrack([]);
    setWaypoints([]);
    setSummary(null);
    setGpsState("ready");
    setScreen("map");
  };

  const categoryLabel = (category: WaypointCategory): string => {
    switch (category) {
      case "landing":
        return t("landing");
      case "rock_shallow":
        return t("rockShallow");
      case "current":
        return t("current");
      case "shelter":
        return t("shelter");
      case "note":
        return t("note");
    }
  };

  if (screen === "summary" && summary) {
    return (
      <div className="prepare-screen">
        <header className="topbar">
          <div className="brand">
            <h1>{t("tripSummary")}</h1>
          </div>
        </header>
        <main className="prepare-main">
          <section className="panel">
            <p>
              {t("duration")}: {formatDuration(summary.durationSec)}
            </p>
            <p>
              {t("distance")}: {(summary.distanceM / 1000).toFixed(2)} km
            </p>
            <p>
              {t("points")}: {summary.pointCount}
            </p>
            <p>
              {t("largestGap")}: {Math.round(summary.largestGapSec)} s
            </p>
            <p>
              {t("accuracyP50")}:{" "}
              {summary.accuracyP50M != null
                ? `${Math.round(summary.accuracyP50M)} m`
                : "—"}
            </p>
            <p>
              {t("accuracyP90")}:{" "}
              {summary.accuracyP90M != null
                ? `${Math.round(summary.accuracyP90M)} m`
                : "—"}
            </p>
            <p>
              {t("pointQuality")}: {summary.goodCount} {t("good")} /{" "}
              {summary.weakCount} {t("weak")} / {summary.rejectedCount}{" "}
              {t("rejected")}
            </p>
            <div className="btn-row">
              <button
                className="secondary"
                type="button"
                onClick={() => void exportTrip("gpx")}
              >
                {t("exportGpx")}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void exportTrip("geojson")}
              >
                {t("exportGeojson")}
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => void deleteTrip()}
              >
                {t("deleteTrip")}
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => setScreen("map")}
              >
                {t("openMap")}
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const lastAge = ageSec(position?.recordedAt);
  const regionTitle =
    selectedRegion?.title[locale] ?? selectedRegion?.title.en ?? t("chooseRegion");

  if (!packageReady) {
    return (
      <div className="boot-screen">
        <p className="brand-mark">Nunat Marine</p>
        <h1>{regionTitle}</h1>
        <p className="caution">{t("notForNavigation")}</p>
        {installProgress ? <p className="boot-progress">{installProgress}</p> : null}
        {error || packageError ? (
          <div className="stale-banner">{error ?? packageError}</div>
        ) : (
          <p className="meta">{t("downloadingMap")}</p>
        )}
        <div className="lang-switch" aria-label={t("language")}>
          {locales.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={locale === item.id}
              onClick={() => setLocale(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="map-screen">
      {safetyOpen ? (
        <div className="safety-overlay">
          <div className="safety-card">
            <p className="brand-mark">Nunat Marine</p>
            <h1>{t("safetyTitle")}</h1>
            <p>{t("safetyBody")}</p>
            <p className="caution">{t("safetyPrivate")}</p>
            <div className="btn-row">
              <button
                className="primary"
                type="button"
                onClick={() => {
                  localStorage.setItem(SAFETY_KEY, "1");
                  setSafetyOpen(false);
                }}
              >
                {t("gotIt")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {coastPickerOpen ? (
        <div className="sheet">
          <div className="sheet-card">
            <h2>{t("changeCoast")}</h2>
            <div className="region-grid" role="listbox" aria-label={t("selectRegion")}>
              {regions.map((region) => (
                <button
                  key={region.slug}
                  type="button"
                  className={
                    region.slug === selectedSlug
                      ? "region-card active"
                      : "region-card"
                  }
                  aria-selected={region.slug === selectedSlug}
                  onClick={() => selectRegion(region.slug)}
                >
                  <strong>{region.title[locale] ?? region.title.en}</strong>
                  <span>{region.description}</span>
                </button>
              ))}
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setCoastPickerOpen(false)}
            >
              {t("closePlace")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="map-top-chrome">
        {!secureContext || demoGps ? (
          <div className="gps-truth-banner">
            <strong>
              {demoGps ? t("demoGpsActive") : t("httpsRequiredBanner")}
            </strong>
            <p className="meta">{t("townsAreNotGps")}</p>
            <div className="btn-row">
              <a className="primary chrome-link" href={HTTPS_GPS_URL}>
                {t("openHttpsGps")}
              </a>
              {!secureContext && !demoGps ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void startDemoGps()}
                >
                  {t("startDemoGps")}
                </button>
              ) : null}
              {demoGps ? (
                <button
                  className="danger"
                  type="button"
                  onClick={() => void stopDemoGps()}
                >
                  {t("stopDemoGps")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="travel-planner">
          <div className="travel-planner-head">
            <strong>{t("travelPlanner")}</strong>
            <button
              type="button"
              className="secondary chrome-btn"
              onClick={() => setPanelOpen((value) => !value)}
            >
              {panelOpen ? t("hidePanel") : t("placeList")}
            </button>
          </div>
          <div className="travel-search-grid">
            <PlaceSearch
              label={`${t("pointA")} · ${picking === "A" ? t("pickingA") : ""}`}
              places={localities}
              selected={pointA}
              accent="a"
              onSelect={(place) => {
                setPicking("A");
                assignPointA(place);
              }}
            />
            <PlaceSearch
              label={`${t("pointB")} · ${picking === "B" ? t("pickingB") : ""}`}
              places={localities}
              selected={pointB}
              accent="b"
              onSelect={(place) => {
                setPicking("B");
                assignPointB(place);
              }}
            />
          </div>
        </div>
        <div className="travel-meta">
          {routeLoading ? <span>{t("routing")}</span> : null}
          {pointA && pointB ? (
            <>
              <span>
                {t("distance")}:{" "}
                <strong>{formatDistanceKm(routeDistanceM)}</strong>
              </span>
              <span>
                {t("bearing")}:{" "}
                <strong>
                  {routeBearing != null ? `${Math.round(routeBearing)}°` : "—"}
                </strong>
              </span>
              <span className="meta">
                {boatRoute?.mode === "water"
                  ? t("routeWater")
                  : routeLoading
                    ? t("routing")
                    : t("routeStraightFallback")}
                {" · "}
                {t("companionRouteHint")}
              </span>
            </>
          ) : (
            <span>{picking === "A" ? t("pickingA") : t("pickingB")}</span>
          )}
          {routeOptions.length > 1 ? (
            <div className="route-options" role="group" aria-label={t("routeOptions")}>
              {routeOptions.map((route, index) => {
                const label =
                  route.bias === "north"
                    ? t("routeNorth")
                    : route.bias === "south"
                      ? t("routeSouth")
                      : t("routeShortest");
                return (
                  <button
                    key={route.id}
                    type="button"
                    className={
                      index === selectedRouteIndex
                        ? "route-option active"
                        : "route-option"
                    }
                    onClick={() => setSelectedRouteIndex(index)}
                  >
                    {label}
                    <span>{formatDistanceKm(route.distanceM)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {position ? (
            <span>
              {t("gpsCoords")}:{" "}
              <strong>
                {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}
              </strong>
              {position.horizontalAccuracyM != null
                ? ` ±${Math.round(position.horizontalAccuracyM)} m`
                : ""}
              {demoGps || position.mocked ? " · DEMO" : ""}
            </span>
          ) : (
            <span>
              {t("gpsCoords")}: <strong>—</strong>
            </span>
          )}
        </div>
      </div>

      <MarineMap
        track={track}
        waypoints={waypoints}
        position={position}
        packageBaseUrl={packageBase}
        {...(selectedRegion
          ? { regionBbox: selectedRegion.bbox }
          : {})}
        offlineReady={packageReady}
        badge={`${regionTitle} · ${t("notForNavigation")}`}
        placeScope={placeScope}
        selectedPlaceId={selectedPlace?.globalId ?? null}
        flyToPlace={selectedPlace}
        fitPlaces={localities}
        pointA={pointA}
        pointB={pointB}
        routeCoordinates={routeCoordinates}
        routeMode={boatRoute?.mode ?? null}
        alternateRoutes={routeOptions}
        selectedRouteIndex={selectedRouteIndex}
        recenterToken={recenterToken}
        followPosition={followPosition}
        onSelectPlace={handlePlacePick}
      />

      <div className="trip-dock travel-dock">
        {pointA && pointB ? (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setPointA(pointB);
              setPointB(pointA);
            }}
          >
            {t("swapAB")}
          </button>
        ) : null}
        <button
          className="secondary"
          type="button"
          disabled={!pointA && !pointB}
          onClick={() => {
            setPointA(null);
            setPointB(null);
            setRouteOptions([]);
            setSelectedRouteIndex(0);
            setPicking("A");
            setNotice(t("pickingA"));
          }}
        >
          {t("clearRoute")}
        </button>
        {trip?.status !== "active" && trip?.status !== "paused" ? (
          <button
            className="primary"
            type="button"
            disabled={
              busy ||
              !packageReady ||
              !pointA ||
              !pointB ||
              (!secureContext && !demoGps)
            }
            onClick={() => void startTrip()}
            title={
              !secureContext && !demoGps ? t("httpsRequiredBanner") : undefined
            }
          >
            {t("startTrip")}
          </button>
        ) : null}
        {trip?.status === "active" ? (
          <button
            className="secondary"
            type="button"
            onClick={() => void pauseTrip()}
          >
            {t("pauseTrip")}
          </button>
        ) : null}
        {trip?.status === "paused" ? (
          <button
            className="secondary"
            type="button"
            onClick={() => void resumeTrip()}
          >
            {t("resumeTrip")}
          </button>
        ) : null}
        {trip && trip.status !== "completed" ? (
          <button
            className="danger"
            type="button"
            disabled={busy}
            onClick={() => void stopTrip()}
          >
            {t("stopTrip")}
          </button>
        ) : null}
        <button
          className="secondary"
          type="button"
          aria-pressed={followPosition}
          onClick={() => {
            setFollowPosition((value) => !value);
            if (!followPosition) void ensureGps();
          }}
        >
          {t("followGps")}
        </button>
      </div>

      {panelOpen ? (
        <aside className="map-side-panel">
          <div className="scope-switch" role="group" aria-label={t("mapContent")}>
            {(
              [
                ["localities", "scopeLocalities"],
                ["geography", "scopeGeography"],
              ] as const
            ).map(([scope, labelKey]) => (
              <button
                key={scope}
                type="button"
                aria-pressed={placeScope === scope}
                onClick={() => setPlaceScope(scope)}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <ul className="place-list">
            {visiblePlaces.slice(0, 120).map((place) => (
              <li key={place.globalId}>
                <button
                  type="button"
                  className={
                    selectedPlace?.globalId === place.globalId
                      ? "place-list-item active"
                      : "place-list-item"
                  }
                  onClick={() => setSelectedPlace(place)}
                >
                  <strong>{place.officialName}</strong>
                  <span>{place.typeLabel}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedPlace ? (
            <PlaceDetail
              place={selectedPlace}
              onClose={() => setSelectedPlace(null)}
              onSetPointA={assignPointA}
              onSetPointB={assignPointB}
              pointAId={pointA?.globalId ?? null}
              pointBId={pointB?.globalId ?? null}
            />
          ) : (
            <p className="meta">
              {!pointA ? t("tapTownForA") : t("tapTownForB")}
            </p>
          )}
          {!secureContext ? (
            <div className="stale-banner">{t("demoGpsNote")}</div>
          ) : null}
          {notice ? <p className="caution">{notice}</p> : null}
          {error ? <div className="stale-banner">{error}</div> : null}
          <div className="lang-switch" aria-label={t("language")}>
            {locales.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={locale === item.id}
                onClick={() => setLocale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {selectedPlace && !panelOpen ? (
        <div className="place-pick-sheet">
          <PlaceDetail
            place={selectedPlace}
            onClose={() => setSelectedPlace(null)}
            onSetPointA={assignPointA}
            onSetPointB={assignPointB}
            pointAId={pointA?.globalId ?? null}
            pointBId={pointB?.globalId ?? null}
          />
        </div>
      ) : null}
    </div>
  );
}
