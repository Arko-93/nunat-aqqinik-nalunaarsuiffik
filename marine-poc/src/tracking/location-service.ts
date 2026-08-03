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

export class BridgedLocationService implements LocationService {
  private readonly web = new WebLocationService();
  private readonly plugin: BackgroundLocationPlugin;

  constructor(
    plugin: BackgroundLocationPlugin = createBackgroundLocationPlugin(),
  ) {
    this.plugin = plugin;
  }

  subscribe = this.web.subscribe;

  start = (
    profile: RecordingProfile = "normal_travel",
  ): Effect.Effect<TrackingSession, PermissionError | LocationError> =>
    Effect.tryPromise({
      try: async () => {
        const nativeAvailable = await this.plugin.isNativeAvailable();
        if (nativeAvailable) {
          return this.plugin.startBackground(profile);
        }
        return Effect.runPromise(this.web.start(profile));
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
        await this.plugin.stopBackground();
        await Effect.runPromise(this.web.stop());
      },
      catch: (error) => new LocationError(String(error)),
    });

  getCurrent = (): Effect.Effect<
    LocationPoint,
    PermissionError | LocationError
  > => this.web.getCurrent();
}
