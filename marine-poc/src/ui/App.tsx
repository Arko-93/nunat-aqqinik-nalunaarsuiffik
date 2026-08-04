import { Effect } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadConditionFixture } from "../domain/conditions.ts";
import {
  corridorPlaceFromFeature,
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
import { formatCourse, formatSpeedKn } from "../map/geo.ts";
import { MarineMap } from "../map/MarineMap.tsx";
import { loadManifestFromJson } from "../packages/manifest.ts";
import {
  deleteCorridorPackage,
  installCorridorPackage,
  isPackageInstalled,
  verifyInstalledPackage,
} from "../packages/package-cache.ts";
import { IndexedDbMarineStore } from "../storage/repository.ts";
import {
  BridgedLocationService,
  toTrackPoint,
} from "../tracking/location-service.ts";
import { PlaceDetail } from "./PlaceDetail.tsx";

const PACKAGE_BASE = "/packages/uummannaq-qaarsut";
const PACKAGE_ID = "corridor_uummannaq_qaarsut_2026-08-01";
const SAFETY_KEY = "nunat-marine-safety-accepted-v3";

type Screen = "safety" | "prepare" | "map" | "summary";

const downloadBlob = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem(SAFETY_KEY) === "1" ? "prepare" : "safety",
  );
  const [manifest, setManifest] = useState<CorridorPackageManifest | null>(
    null,
  );
  const [packageReady, setPackageReady] = useState(false);
  const [packageInstalled, setPackageInstalled] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<string | null>(null);
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
  const [placeScope, setPlaceScope] = useState<PlaceScope>("localities");
  const [selectedPlace, setSelectedPlace] = useState<CorridorPlace | null>(
    null,
  );
  const [corridorPlaces, setCorridorPlaces] = useState<CorridorPlace[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [followPosition, setFollowPosition] = useState(true);
  const sequenceRef = useRef(0);

  const localities = useMemo(
    () => corridorPlaces.filter((place) => place.isLocality),
    [corridorPlaces],
  );

  const loadPlaces = async () => {
    const placesResponse = await fetch(`${PACKAGE_BASE}/places.geojson`);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const networkManifest = await loadManifestFromJson(
          await fetch(`${PACKAGE_BASE}/manifest.json`),
        );
        if (cancelled) return;
        setManifest(networkManifest);

        const installed = await isPackageInstalled(PACKAGE_ID);
        if (installed) {
          const verified = await verifyInstalledPackage();
          if (!cancelled) {
            setManifest(verified);
            setPackageInstalled(true);
            setPackageReady(true);
            setPackageError(null);
          }
        } else if (!cancelled) {
          setPackageInstalled(false);
          setPackageReady(false);
        }

        await loadPlaces();

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
          setScreen("map");
        }
      } catch (err) {
        if (!cancelled) {
          setPackageError(String(err));
          setError(String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

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

  const installPackage = async () => {
    setBusy(true);
    setPackageError(null);
    setInstallProgress(t("loading"));
    try {
      const installed = await installCorridorPackage((progress) => {
        setInstallProgress(`${progress.path} · ${formatBytes(progress.loaded)}`);
      });
      await verifyInstalledPackage();
      await Effect.runPromise(
        store.savePackage({
          manifest: installed,
          installedAt: new Date().toISOString(),
          verified: true,
          localPath: PACKAGE_BASE,
        }),
      );
      setManifest(installed);
      setPackageInstalled(true);
      setPackageReady(true);
      setInstallProgress(null);
      setNotice(t("offlineReady"));
      await loadPlaces();
    } catch (err) {
      setPackageError(String(err));
      setPackageReady(false);
      setPackageInstalled(false);
    } finally {
      setBusy(false);
    }
  };

  const removePackage = async () => {
    if (!confirm(t("deletePackage"))) return;
    setBusy(true);
    try {
      await deleteCorridorPackage();
      await Effect.runPromise(store.removePackage(PACKAGE_ID));
      setPackageInstalled(false);
      setPackageReady(false);
      setNotice(null);
    } catch (err) {
      setPackageError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const ensureGps = async () => {
    setGpsState("requesting");
    setError(null);
    try {
      const point = await Effect.runPromise(location.getCurrent());
      setPosition(point);
      setGpsState(
        point.horizontalAccuracyM != null && point.horizontalAccuracyM > 80
          ? "weak"
          : "ready",
      );
      if (!secureContext) {
        setNotice(t("demoGpsNote"));
      } else if (point.mocked) {
        setNotice(t("mockedGpsWarning"));
      } else {
        setNotice(null);
      }
      await Effect.runPromise(location.start(profile));
    } catch (err) {
      setError(String(err));
      setGpsState("denied");
      if (secureContext) {
        setNotice(t("httpsGpsHint"));
      }
    }
  };

  const openMap = async () => {
    if (!packageReady) {
      setError(t("downloadFirst"));
      return;
    }
    setScreen("map");
    setPanelOpen(false);
    await ensureGps();
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
        corridorPackageId: PACKAGE_ID,
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
    setScreen("prepare");
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

  if (screen === "safety") {
    return (
      <div className="safety-overlay">
        <div className="safety-card">
          <p className="brand-mark">Nunat Marine</p>
          <h1>{t("safetyTitle")}</h1>
          <p>{t("safetyBody")}</p>
          <p className="caution">{t("safetyPrivate")}</p>
          <p className="meta">{t("recordingForegroundOnly")}</p>
          <p className="meta">{t("forceQuitLimit")}</p>
          <div className="btn-row">
            <button
              className="primary"
              type="button"
              onClick={() => {
                localStorage.setItem(SAFETY_KEY, "1");
                setScreen("prepare");
              }}
            >
              {t("safetyAccept")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "prepare") {
    return (
      <div className="prepare-screen">
        <header className="topbar">
          <div className="brand">
            <h1>{t("appTitle")}</h1>
            <p>{t("appTagline")}</p>
          </div>
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
        </header>

        <main className="prepare-main">
          <section className="panel prepare-hero">
            <h2>{t("corridorTitle")}</h2>
            <p className="caution">{t("notForNavigation")}</p>
            {!secureContext ? (
              <div className="stale-banner">{t("demoGpsNote")}</div>
            ) : (
              <p className="ok meta">{t("httpsGpsOk")}</p>
            )}
            {manifest ? (
              <>
                <p className="meta">
                  {t("dataAsOf")}: {manifest.layers[0]?.dataAsOf ?? "—"}
                </p>
                <p className="meta">
                  {t("bytes")}: {formatBytes(manifest.bytes)}
                </p>
                <p className={packageInstalled ? "ok meta" : "meta"}>
                  {packageInstalled ? t("offlineReady") : t("download")}
                </p>
                <p className="meta">
                  {t("localitiesCount")}: {localities.length}
                </p>
                <ul className="attr-list">
                  {manifest.attributions.slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <ul className="place-list prepare-places">
                  {localities.map((place) => (
                    <li key={place.globalId}>
                      <strong>{place.officialName}</strong>
                      <span>{place.typeLabel}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{t("loading")}</p>
            )}
            {installProgress ? <p className="meta">{installProgress}</p> : null}
            {packageError ? (
              <p className="stale-banner">{packageError}</p>
            ) : null}
            {weather?.stale || ice?.stale ? (
              <div className="stale-banner">{t("stale")}</div>
            ) : null}
            <div className="btn-row">
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void installPackage()}
              >
                {packageInstalled ? t("verify") : t("download")}
              </button>
              {packageInstalled ? (
                <button
                  className="danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void removePackage()}
                >
                  {t("deletePackage")}
                </button>
              ) : null}
            </div>
            <div className="btn-row">
              <button
                className="primary"
                type="button"
                disabled={!packageReady || busy}
                onClick={() => void openMap()}
              >
                {t("openMap")}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={!packageReady || busy}
                onClick={() => void startTrip()}
              >
                {t("startTrip")}
              </button>
            </div>
            {error ? <p className="stale-banner">{error}</p> : null}
            {notice ? <p className="caution">{notice}</p> : null}
          </section>
        </main>
      </div>
    );
  }

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

  return (
    <div className="map-screen">
      <div className="map-top-chrome">
        <div className="status-bar compact">
          <span>
            {t("gpsState")}
            <strong>{gpsState}</strong>
          </span>
          <span>
            {t("accuracy")}
            <strong>
              {position?.horizontalAccuracyM != null
                ? `${Math.round(position.horizontalAccuracyM)} m`
                : "—"}
            </strong>
          </span>
          <span>
            {t("speed")}
            <strong>{formatSpeedKn(position?.speedMps ?? null)}</strong>
          </span>
          <span>
            {t("course")}
            <strong>{formatCourse(position?.courseDeg ?? null)}</strong>
          </span>
          <span>
            {t("lastPoint")}
            <strong>{lastAge != null ? `${lastAge}s` : "—"}</strong>
          </span>
          <span>
            {t("points")}
            <strong>{track.length}</strong>
          </span>
          <button
            type="button"
            className="secondary chrome-btn"
            onClick={() => setPanelOpen((value) => !value)}
          >
            {panelOpen ? t("hidePanel") : t("showPanel")}
          </button>
        </div>
      </div>

      <MarineMap
        track={track}
        waypoints={waypoints}
        position={position}
        packageBaseUrl={PACKAGE_BASE}
        offlineReady={packageInstalled}
        badge={
          packageInstalled
            ? `${t("offlineReady")} · ${t("notForNavigation")}`
            : t("downloadFirst")
        }
        placeScope={placeScope}
        selectedPlaceId={selectedPlace?.globalId ?? null}
        flyToPlace={selectedPlace}
        fitPlaces={localities}
        recenterToken={recenterToken}
        followPosition={followPosition}
        onSelectPlace={setSelectedPlace}
      />

      <div className="trip-dock">
        {trip?.status !== "active" && trip?.status !== "paused" ? (
          <button
            className="primary"
            type="button"
            disabled={busy || !packageReady}
            onClick={() => void startTrip()}
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
          disabled={!position}
          onClick={() => setShowWaypointSheet(true)}
        >
          {t("addWaypoint")}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={track.length === 0}
          onClick={() => {
            setFollowPosition(false);
            setRecenterToken((value) => value + 1);
          }}
        >
          {t("returnAlongTrack")}
        </button>
        <button
          className="secondary"
          type="button"
          aria-pressed={followPosition}
          onClick={() => setFollowPosition((value) => !value)}
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
                ["all", "scopeAll"],
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
            {localities.map((place) => (
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
            />
          ) : (
            <p className="meta">{t("clickPlaceHint")}</p>
          )}
          {notice ? <p className="caution">{notice}</p> : null}
          {error ? <div className="stale-banner">{error}</div> : null}
          <button
            className="secondary"
            type="button"
            onClick={() => setScreen("prepare")}
          >
            {t("backPrepare")}
          </button>
        </aside>
      ) : null}

      {showWaypointSheet ? (
        <div className="sheet">
          <div className="sheet-card">
            <h2>{t("addWaypoint")}</h2>
            <p className="meta">{t("privateOnly")}</p>
            <div className="waypoint-grid">
              {(
                [
                  "landing",
                  "rock_shallow",
                  "current",
                  "shelter",
                  "note",
                ] as const
              ).map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={waypointCategory === category}
                  onClick={() => setWaypointCategory(category)}
                >
                  {categoryLabel(category)}
                </button>
              ))}
            </div>
            <textarea
              value={waypointNote}
              onChange={(event) => setWaypointNote(event.target.value)}
              placeholder={t("waypointNote")}
            />
            <div className="btn-row">
              <button
                className="primary"
                type="button"
                disabled={!position}
                onClick={() => void saveWaypoint()}
              >
                {t("saveWaypoint")}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setShowWaypointSheet(false)}
              >
                {t("closePlace")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
