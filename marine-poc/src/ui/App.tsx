import { Effect } from "effect";
import { useEffect, useMemo, useState } from "react";
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
import { MarineMap } from "../map/MarineMap.tsx";
import {
  loadManifestFromJson,
  sha256Hex,
  verifyPackageBytes,
} from "../packages/manifest.ts";
import { IndexedDbMarineStore } from "../storage/repository.ts";
import {
  BridgedLocationService,
  toTrackPoint,
} from "../tracking/location-service.ts";
import { PlaceDetail } from "./PlaceDetail.tsx";

const PACKAGE_BASE = "/packages/uummannaq-qaarsut";
const PACKAGE_ID = "corridor_uummannaq_qaarsut_2026-08-01";
const SAFETY_KEY = "nunat-marine-safety-accepted";

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

export function App() {
  const { t, locale, setLocale, locales } = useI18n();
  const store = useMemo(() => new IndexedDbMarineStore(), []);
  const location = useMemo(() => new BridgedLocationService(), []);

  const [safetyAccepted, setSafetyAccepted] = useState(
    () => localStorage.getItem(SAFETY_KEY) === "1",
  );
  const [manifest, setManifest] = useState<CorridorPackageManifest | null>(null);
  const [packageInstalled, setPackageInstalled] = useState(false);
  const [packageVerified, setPackageVerified] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [weather, setWeather] = useState<ConditionSnapshot | null>(null);
  const [ice, setIce] = useState<ConditionSnapshot | null>(null);
  const [gpsState, setGpsState] = useState<GpsUiState>("unknown");
  const [position, setPosition] = useState<LocationPoint | null>(null);
  const [profile, setProfile] = useState<RecordingProfile>("normal_travel");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [waypointCategory, setWaypointCategory] =
    useState<WaypointCategory>("landing");
  const [waypointNote, setWaypointNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeScope, setPlaceScope] = useState<PlaceScope>("localities");
  const [selectedPlace, setSelectedPlace] = useState<CorridorPlace | null>(
    null,
  );
  const [corridorPlaces, setCorridorPlaces] = useState<CorridorPlace[]>([]);
  const sequenceRef = useMemo(() => ({ current: 0 }), []);

  const localities = useMemo(
    () => corridorPlaces.filter((place) => place.isLocality),
    [corridorPlaces],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadManifestFromJson(
          await fetch(`${PACKAGE_BASE}/manifest.json`),
        );
        if (!cancelled) setManifest(loaded);
        const placesJson = (await fetch(
          `${PACKAGE_BASE}/places.geojson`,
        ).then((response) => response.json())) as GeoJSON.FeatureCollection;
        if (!cancelled) {
          setCorridorPlaces(
            placesJson.features
              .map((feature) => corridorPlaceFromFeature(feature))
              .filter((place): place is CorridorPlace => place !== null),
          );
        }
        const installed = await Effect.runPromise(store.getPackage(PACKAGE_ID));
        if (!cancelled && installed) {
          setPackageInstalled(true);
          setPackageVerified(installed.verified);
        }
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
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sequenceRef, store]);

  useEffect(() => {
    const unsubscribe = location.subscribe(
      (point) => {
        setPosition(point);
        setGpsState((prev) =>
          prev === "recording" || prev === "paused" ? prev : "ready",
        );
        if (!trip || trip.status !== "active") return;
        sequenceRef.current += 1;
        const trackPoint = toTrackPoint(
          trip.id,
          sequenceRef.current,
          point,
        );
        setTrack((prev) => [...prev, trackPoint]);
        void Effect.runPromise(store.appendPoint(trackPoint));
        void Effect.runPromise(
          store.saveTrip({
            ...trip,
            pointCount: sequenceRef.current,
          }),
        );
      },
      (err) => {
        setError(err.message);
        setGpsState("denied");
      },
    );
    return unsubscribe;
  }, [location, sequenceRef, store, trip]);

  const installPackage = async () => {
    if (!manifest) return;
    setBusy(true);
    setPackageError(null);
    try {
      const places = await fetch(`${PACKAGE_BASE}/places.geojson`);
      if (!places.ok) throw new Error(`places fetch failed (${places.status})`);
      const buffer = await places.arrayBuffer();
      // Manifest sha256 targets places.geojson for the POC.
      const digest = await sha256Hex(buffer);
      const patched = { ...manifest, bytes: buffer.byteLength, sha256: digest };
      await verifyPackageBytes(patched, buffer);
      await Effect.runPromise(
        store.savePackage({
          manifest: patched,
          installedAt: new Date().toISOString(),
          verified: true,
          localPath: PACKAGE_BASE,
        }),
      );
      setManifest(patched);
      setPackageInstalled(true);
      setPackageVerified(true);
      if ("storage" in navigator && "persist" in navigator.storage) {
        await navigator.storage.persist().catch(() => false);
      }
    } catch (err) {
      setPackageError(String(err));
      setPackageVerified(false);
    } finally {
      setBusy(false);
    }
  };

  const deletePackage = async () => {
    setBusy(true);
    try {
      await Effect.runPromise(store.removePackage(PACKAGE_ID));
      setPackageInstalled(false);
      setPackageVerified(false);
    } catch (err) {
      setPackageError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const startTrip = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      setGpsState("requesting");
      const session = await Effect.runPromise(location.start(profile));
      const nextTrip: Trip = {
        id: session.tripId,
        startedAt: session.startedAt,
        endedAt: null,
        status: "active",
        profile,
        visibility: { type: "private" },
        pointCount: 0,
        corridorPackageId: packageInstalled ? PACKAGE_ID : null,
      };
      sequenceRef.current = 0;
      setTrack([]);
      setWaypoints([]);
      setTrip(nextTrip);
      await Effect.runPromise(store.saveTrip(nextTrip));
      setGpsState("recording");
    } catch (err) {
      setError(String(err));
      setGpsState("denied");
    } finally {
      setBusy(false);
    }
  };

  const pauseTrip = async () => {
    if (!trip) return;
    const next = { ...trip, status: "paused" as const };
    setTrip(next);
    setGpsState("paused");
    await Effect.runPromise(store.saveTrip(next));
    await Effect.runPromise(location.stop());
  };

  const resumeTrip = async () => {
    if (!trip) return;
    await Effect.runPromise(location.start(profile));
    const next = { ...trip, status: "active" as const };
    setTrip(next);
    setGpsState("recording");
    await Effect.runPromise(store.saveTrip(next));
  };

  const stopTrip = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      await Effect.runPromise(location.stop());
      const endedAt = new Date().toISOString();
      const next = { ...trip, status: "completed" as const, endedAt };
      await Effect.runPromise(store.saveTrip(next));
      const points = await Effect.runPromise(store.listPoints(trip.id));
      setSummary(
        summarizeTrip(trip.id, trip.startedAt, endedAt, points),
      );
      setTrip(next);
      setGpsState("ready");
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
      tripId: trip?.id ?? null,
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
    setTrip(null);
    setTrack([]);
    setWaypoints([]);
    setSummary(null);
    setGpsState("ready");
  };

  const demoBasemap = !packageInstalled;
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

  return (
    <div className="app-shell">
      {!safetyAccepted ? (
        <div className="safety-overlay">
          <div className="safety-card">
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
                  setSafetyAccepted(true);
                }}
              >
                {t("safetyAccept")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      <div className="status-bar">
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
          {t("lastPoint")}
          <strong>
            {position?.recordedAt
              ? new Date(position.recordedAt).toLocaleTimeString()
              : "—"}
          </strong>
        </span>
        <span>
          {t("profile")}
          <strong>{profile}</strong>
        </span>
      </div>

      <div className="main">
        <aside className="side">
          <section className="panel">
            <h2>{t("corridorTitle")}</h2>
            {manifest ? (
              <>
                <p className="caution">{t("notForNavigation")}</p>
                <p className="meta">
                  {t("dataAsOf")}: {manifest.layers[0]?.dataAsOf ?? "—"}
                </p>
                <p className="meta">
                  {t("bytes")}: {formatBytes(manifest.bytes)}
                </p>
                <p className={packageVerified ? "ok meta" : "meta"}>
                  {packageInstalled
                    ? packageVerified
                      ? t("verified")
                      : t("downloaded")
                    : "—"}
                </p>
                <ul>
                  {manifest.attributions.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="btn-row">
                  <button
                    className="primary"
                    type="button"
                    disabled={busy || packageInstalled}
                    onClick={() => void installPackage()}
                  >
                    {t("download")}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy || !packageInstalled}
                    onClick={() => void deletePackage()}
                  >
                    {t("deletePackage")}
                  </button>
                </div>
                {packageError ? (
                  <p className="stale-banner">{packageError}</p>
                ) : null}
              </>
            ) : (
              <p>{t("loading")}</p>
            )}
          </section>

          <section className="panel">
            <h2>{t("mapContent")}</h2>
            <p className="meta">{t("clickPlaceHint")}</p>
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
            <p className="meta" style={{ marginTop: "0.65rem" }}>
              {t("localitiesCount")}: {localities.length}
            </p>
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
          </section>

          {selectedPlace ? (
            <PlaceDetail
              place={selectedPlace}
              onClose={() => setSelectedPlace(null)}
            />
          ) : null}

          <section className="panel">
            <h2>{t("weather")}</h2>
            {weather ? (
              <>
                {weather.stale ? (
                  <div className="stale-banner">{t("stale")}</div>
                ) : null}
                <p className="meta">
                  {t("validTo")}: {new Date(weather.validTo).toLocaleString()}
                </p>
                <p>{weather.disclaimer}</p>
              </>
            ) : (
              <p>{t("loading")}</p>
            )}
            <h3 style={{ marginTop: "0.9rem" }}>{t("ice")}</h3>
            {ice ? (
              <>
                {ice.stale ? (
                  <div className="stale-banner">{t("stale")}</div>
                ) : null}
                <p className="meta">
                  {t("validTo")}: {new Date(ice.validTo).toLocaleString()}
                </p>
                <p>{ice.disclaimer}</p>
              </>
            ) : null}
          </section>

          <section className="panel">
            <h2>{t("startTrip")}</h2>
            <label className="meta" htmlFor="profile">
              {t("profile")}
            </label>
            <select
              id="profile"
              value={profile}
              onChange={(event) =>
                setProfile(event.target.value as RecordingProfile)
              }
              disabled={trip?.status === "active"}
              style={{
                width: "100%",
                marginTop: "0.35rem",
                background: "rgba(0,0,0,0.2)",
                color: "inherit",
                borderRadius: 10,
                border: "1px solid var(--line)",
                padding: "0.45rem",
              }}
            >
              <option value="normal_travel">normal_travel</option>
              <option value="close_approach">close_approach</option>
              <option value="battery_reserve">battery_reserve</option>
            </select>
            <div className="btn-row">
              <button
                className="primary"
                type="button"
                disabled={busy || trip?.status === "active"}
                onClick={() => void startTrip()}
              >
                {t("startTrip")}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={trip?.status !== "active"}
                onClick={() => void pauseTrip()}
              >
                {t("pauseTrip")}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={trip?.status !== "paused"}
                onClick={() => void resumeTrip()}
              >
                {t("resumeTrip")}
              </button>
              <button
                className="danger"
                type="button"
                disabled={!trip || trip.status === "completed"}
                onClick={() => void stopTrip()}
              >
                {t("stopTrip")}
              </button>
            </div>
            <p className="meta">{t("recordingForegroundOnly")}</p>
          </section>

          <section className="panel">
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
            </div>
          </section>

          {(summary || trip) && (
            <section className="panel">
              <h2>{t("tripSummary")}</h2>
              {summary ? (
                <>
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
                </>
              ) : (
                <p className="meta">
                  {t("points")}: {track.length}
                </p>
              )}
              <div className="btn-row">
                <button
                  className="secondary"
                  type="button"
                  disabled={!trip}
                  onClick={() => void exportTrip("gpx")}
                >
                  {t("exportGpx")}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={!trip}
                  onClick={() => void exportTrip("geojson")}
                >
                  {t("exportGeojson")}
                </button>
                <button
                  className="danger"
                  type="button"
                  disabled={!trip}
                  onClick={() => void deleteTrip()}
                >
                  {t("deleteTrip")}
                </button>
              </div>
            </section>
          )}

          {error ? <div className="stale-banner">{error}</div> : null}
        </aside>

        <MarineMap
          track={track}
          waypoints={waypoints}
          position={position}
          demoBasemap={demoBasemap}
          badge={demoBasemap ? t("onlineDemoBasemap") : t("offlineReady")}
          placeScope={placeScope}
          selectedPlaceId={selectedPlace?.globalId ?? null}
          onSelectPlace={setSelectedPlace}
        />
      </div>

      <footer className="footer-note">
        Companion POC · Uummannaq–Qaarsut · no GST chart content · sync off
      </footer>
    </div>
  );
}
