import { Effect } from "effect";
import { LocationError, PermissionError } from "../domain/errors.ts";
import { classifyAccuracy } from "../domain/trip-metrics.ts";
import type {
  LocationPoint,
  RecordingProfile,
  TrackPoint,
  TrackingSession,
} from "../domain/types.ts";
import {
  createBackgroundLocationPlugin,
  type BackgroundLocationPlugin,
} from "../plugins/background-location.ts";

export type LocationUnsubscribe = () => void;

export interface LocationService {
  readonly subscribe: (
    onPoint: (point: LocationPoint) => void,
    onError?: (error: LocationError | PermissionError) => void,
  ) => LocationUnsubscribe;
  readonly start: (
    profile?: RecordingProfile,
  ) => Effect.Effect<TrackingSession, PermissionError | LocationError>;
  readonly stop: () => Effect.Effect<void, LocationError>;
  readonly getCurrent: () => Effect.Effect<
    LocationPoint,
    PermissionError | LocationError
  >;
  /** Explicit demo only — never used as a silent fallback. */
  readonly startDemo?: (
    profile?: RecordingProfile,
  ) => Effect.Effect<TrackingSession, LocationError>;
  readonly isDemoActive?: () => boolean;
}

const profileToOptions = (profile: RecordingProfile): PositionOptions => {
  switch (profile) {
    case "close_approach":
      return { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };
    case "battery_reserve":
      return {
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 30_000,
      };
    default:
      return { enableHighAccuracy: true, maximumAge: 1_000, timeout: 25_000 };
  }
};

export const positionToLocationPoint = (
  position: GeolocationPosition,
): LocationPoint => {
  const { coords, timestamp } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    horizontalAccuracyM:
      typeof coords.accuracy === "number" ? coords.accuracy : null,
    altitudeM: coords.altitude,
    verticalAccuracyM: coords.altitudeAccuracy,
    speedMps: coords.speed,
    courseDeg: coords.heading,
    recordedAt: new Date(timestamp).toISOString(),
    provider: "web",
    mocked:
      "mocked" in coords &&
      typeof (coords as { mocked?: boolean }).mocked === "boolean"
        ? (coords as { mocked: boolean }).mocked
        : null,
  };
};

export const toTrackPoint = (
  tripId: string,
  sequence: number,
  point: LocationPoint,
): TrackPoint => ({
  tripId,
  sequence,
  latitude: point.latitude,
  longitude: point.longitude,
  horizontalAccuracyM: point.horizontalAccuracyM,
  altitudeM: point.altitudeM,
  verticalAccuracyM: point.verticalAccuracyM,
  speedMps: point.speedMps,
  courseDeg: point.courseDeg,
  recordedAt: point.recordedAt,
  provider: point.provider,
  mocked: point.mocked,
  quality: classifyAccuracy(point.horizontalAccuracyM),
});

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `trip_${Date.now()}`;

export const insecureOrigin = (): boolean => {
  if (typeof window === "undefined") return false;
  return !window.isSecureContext;
};

/**
 * Demo route is [latitude, longitude] WGS84 near Uummannaq→Qaarsut.
 * Only used when the user explicitly starts demo mode.
 */
const DEMO_ROUTE: ReadonlyArray<[number, number]> = [
  [70.6747, -52.1269],
  [70.689, -52.05],
  [70.705, -51.95],
  [70.72, -51.85],
  [70.732, -51.75],
  [70.742, -51.65],
  [70.734, -51.55],
];

export const HTTPS_GPS_URL = "https://marine.sikumut.gl";

export class WebLocationService implements LocationService {
  private watchId: number | null = null;
  private readonly pointListeners = new Set<(point: LocationPoint) => void>();
  private readonly errorListeners = new Set<
    (error: LocationError | PermissionError) => void
  >();

  subscribe = (
    onPoint: (point: LocationPoint) => void,
    onError?: (error: LocationError | PermissionError) => void,
  ): LocationUnsubscribe => {
    this.pointListeners.add(onPoint);
    if (onError) this.errorListeners.add(onError);
    return () => {
      this.pointListeners.delete(onPoint);
      if (onError) this.errorListeners.delete(onError);
    };
  };

  start = (
    profile: RecordingProfile = "normal_travel",
  ): Effect.Effect<TrackingSession, PermissionError | LocationError> =>
    Effect.tryPromise({
      try: async () => {
        if (!("geolocation" in navigator)) {
          throw new LocationError("Geolocation API unavailable");
        }
        if (insecureOrigin()) {
          throw new LocationError(
            `Real GPS needs HTTPS. Open ${HTTPS_GPS_URL} — do not use the HTTP demo host for location.`,
          );
        }
        if (this.watchId !== null) {
          navigator.geolocation.clearWatch(this.watchId);
        }
        const session: TrackingSession = {
          tripId: newId(),
          startedAt: new Date().toISOString(),
          profile,
          mode: "web-foreground",
        };
        const options = profileToOptions(profile);
        this.watchId = navigator.geolocation.watchPosition(
          (position) => {
            const point = positionToLocationPoint(position);
            for (const listener of this.pointListeners) listener(point);
          },
          (error) => {
            const mapped =
              error.code === error.PERMISSION_DENIED
                ? new PermissionError(error.message)
                : new LocationError(error.message);
            for (const listener of this.errorListeners) listener(mapped);
          },
          options,
        );
        return session;
      },
      catch: (error) => {
        if (
          error instanceof PermissionError ||
          error instanceof LocationError
        ) {
          return error;
        }
        return new LocationError(String(error));
      },
    });

  stop = (): Effect.Effect<void, LocationError> =>
    Effect.sync(() => {
      if (this.watchId !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
    });

  getCurrent = (): Effect.Effect<
    LocationPoint,
    PermissionError | LocationError
  > =>
    Effect.tryPromise({
      try: () =>
        new Promise<LocationPoint>((resolve, reject) => {
          if (!("geolocation" in navigator)) {
            reject(new LocationError("Geolocation API unavailable"));
            return;
          }
          if (insecureOrigin()) {
            reject(
              new LocationError(
                `Real GPS needs HTTPS. Open ${HTTPS_GPS_URL}`,
              ),
            );
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(positionToLocationPoint(position)),
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                reject(new PermissionError(error.message));
              } else {
                reject(new LocationError(error.message));
              }
            },
            profileToOptions("close_approach"),
          );
        }),
      catch: (error) => {
        if (
          error instanceof PermissionError ||
          error instanceof LocationError
        ) {
          return error;
        }
        return new LocationError(String(error));
      },
    });
}

export class BridgedLocationService implements LocationService {
  private readonly web = new WebLocationService();
  private readonly plugin: BackgroundLocationPlugin;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private demoSequence = 0;
  private readonly pointListeners = new Set<(point: LocationPoint) => void>();
  private readonly errorListeners = new Set<
    (error: LocationError | PermissionError) => void
  >();
  private useDemo = false;

  constructor(
    plugin: BackgroundLocationPlugin = createBackgroundLocationPlugin(),
  ) {
    this.plugin = plugin;
  }

  isDemoActive = (): boolean => this.useDemo;

  subscribe = (
    onPoint: (point: LocationPoint) => void,
    onError?: (error: LocationError | PermissionError) => void,
  ): LocationUnsubscribe => {
    this.pointListeners.add(onPoint);
    if (onError) this.errorListeners.add(onError);
    const nested = this.web.subscribe(
      (point) => {
        if (!this.useDemo) onPoint(point);
      },
      (error) => {
        if (!this.useDemo && onError) onError(error);
      },
    );
    return () => {
      this.pointListeners.delete(onPoint);
      if (onError) this.errorListeners.delete(onError);
      nested();
    };
  };

  private demoPoint = (sequence: number): LocationPoint => {
    const index = Math.min(sequence, DEMO_ROUTE.length - 1);
    const [latitude, longitude] = DEMO_ROUTE[index]!;
    const next =
      DEMO_ROUTE[Math.min(index + 1, DEMO_ROUTE.length - 1)] ??
      DEMO_ROUTE[index]!;
    const dLat = next[0]! - latitude;
    const dLon = next[1]! - longitude;
    const courseDeg =
      (((Math.atan2(dLon, dLat) * 180) / Math.PI) + 360) % 360;
    return {
      latitude,
      longitude,
      horizontalAccuracyM: 8 + (sequence % 5),
      altitudeM: 3,
      verticalAccuracyM: null,
      speedMps: 3.2,
      courseDeg,
      recordedAt: new Date().toISOString(),
      provider: "web",
      mocked: true,
    };
  };

  startDemo = (
    profile: RecordingProfile = "normal_travel",
  ): Effect.Effect<TrackingSession, LocationError> =>
    Effect.sync(() => {
      this.useDemo = true;
      this.demoSequence = 0;
      if (this.demoTimer) clearInterval(this.demoTimer);
      const tickMs =
        profile === "close_approach"
          ? 1500
          : profile === "battery_reserve"
            ? 5000
            : 2500;
      this.demoTimer = setInterval(() => {
        this.demoSequence += 1;
        const point = this.demoPoint(this.demoSequence);
        for (const listener of this.pointListeners) listener(point);
      }, tickMs);
      const first = this.demoPoint(0);
      for (const listener of this.pointListeners) listener(first);
      return {
        tripId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        profile,
        mode: "web-foreground",
      };
    });

  start = (
    profile: RecordingProfile = "normal_travel",
  ): Effect.Effect<TrackingSession, PermissionError | LocationError> =>
    Effect.tryPromise({
      try: async () => {
        // Never silently fake GPS. HTTP must use startDemo() or HTTPS.
        if (insecureOrigin()) {
          throw new LocationError(
            `Real GPS needs HTTPS. Open ${HTTPS_GPS_URL}`,
          );
        }
        const nativeAvailable = await this.plugin.isNativeAvailable();
        if (nativeAvailable) {
          return await this.plugin.startBackground(profile);
        }
        return await Effect.runPromise(this.web.start(profile));
      },
      catch: (error) => {
        if (
          error instanceof PermissionError ||
          error instanceof LocationError
        ) {
          return error;
        }
        return new LocationError(String(error));
      },
    });

  stop = (): Effect.Effect<void, LocationError> =>
    Effect.tryPromise({
      try: async () => {
        if (this.demoTimer) {
          clearInterval(this.demoTimer);
          this.demoTimer = null;
        }
        this.useDemo = false;
        await this.plugin.stopBackground();
        await Effect.runPromise(this.web.stop());
      },
      catch: (error) => new LocationError(String(error)),
    });

  getCurrent = (): Effect.Effect<
    LocationPoint,
    PermissionError | LocationError
  > =>
    Effect.tryPromise({
      try: async () => {
        if (this.useDemo) {
          return this.demoPoint(this.demoSequence);
        }
        if (insecureOrigin()) {
          throw new LocationError(
            `Real GPS needs HTTPS. Open ${HTTPS_GPS_URL}`,
          );
        }
        return await Effect.runPromise(this.web.getCurrent());
      },
      catch: (error) => {
        if (
          error instanceof PermissionError ||
          error instanceof LocationError
        ) {
          return error;
        }
        return new LocationError(String(error));
      },
    });
}
