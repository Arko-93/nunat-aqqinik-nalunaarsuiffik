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
}

const profileToOptions = (profile: RecordingProfile): PositionOptions => {
  switch (profile) {
    case "close_approach":
      return { enableHighAccuracy: true, maximumAge: 1_000, timeout: 15_000 };
    case "battery_reserve":
      return {
        enableHighAccuracy: false,
        maximumAge: 15_000,
        timeout: 30_000,
      };
    default:
      return { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 };
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
      "mocked" in coords && typeof (coords as { mocked?: boolean }).mocked ===
        "boolean"
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
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(positionToLocationPoint(position)),
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                reject(new PermissionError(error.message));
              } else {
                reject(new LocationError(error.message));
              }
            },
            profileToOptions("normal_travel"),
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

const insecureOrigin = (): boolean => {
  if (typeof window === "undefined") return false;
  return !window.isSecureContext;
};

/** Corridor demo position when browser blocks geolocation on HTTP. */
const DEMO_POINT: LocationPoint = {
  latitude: 70.72,
  longitude: -52.2,
  horizontalAccuracyM: 12,
  altitudeM: 3,
  verticalAccuracyM: null,
  speedMps: 0,
  courseDeg: null,
  recordedAt: new Date().toISOString(),
  provider: "web",
  mocked: true,
};

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

  private startDemo = (
    profile: RecordingProfile,
  ): TrackingSession => {
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
      const point: LocationPoint = {
        ...DEMO_POINT,
        latitude: DEMO_POINT.latitude + this.demoSequence * 0.00035,
        longitude: DEMO_POINT.longitude + this.demoSequence * 0.00055,
        speedMps: 2.2,
        courseDeg: 55,
        recordedAt: new Date().toISOString(),
        mocked: true,
      };
      for (const listener of this.pointListeners) listener(point);
    }, tickMs);
    // Emit immediately so UI unlocks.
    for (const listener of this.pointListeners) {
      listener({ ...DEMO_POINT, recordedAt: new Date().toISOString() });
    }
    return {
      tripId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      profile,
      mode: "web-foreground",
    };
  };

  start = (
    profile: RecordingProfile = "normal_travel",
  ): Effect.Effect<TrackingSession, PermissionError | LocationError> =>
    Effect.tryPromise({
      try: async () => {
        if (insecureOrigin()) {
          return this.startDemo(profile);
        }
        try {
          const nativeAvailable = await this.plugin.isNativeAvailable();
          if (nativeAvailable) {
            return await this.plugin.startBackground(profile);
          }
          return await Effect.runPromise(this.web.start(profile));
        } catch (error) {
          const message = String(error);
          if (
            message.includes("secure origins") ||
            message.includes("Only secure origins") ||
            error instanceof PermissionError
          ) {
            return this.startDemo(profile);
          }
          throw error;
        }
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
        if (insecureOrigin()) {
          return {
            ...DEMO_POINT,
            recordedAt: new Date().toISOString(),
          };
        }
        try {
          return await Effect.runPromise(this.web.getCurrent());
        } catch (error) {
          const message = String(error);
          if (
            message.includes("secure origins") ||
            error instanceof PermissionError
          ) {
            return {
              ...DEMO_POINT,
              recordedAt: new Date().toISOString(),
            };
          }
          throw error;
        }
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
