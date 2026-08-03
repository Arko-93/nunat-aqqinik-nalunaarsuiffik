/**
 * Capacitor BackgroundLocation plugin contract.
 *
 * Web/PWA builds fall back to foreground geolocation.
 * Native iOS Core Location / Android foreground-service implementations
 * must satisfy this interface for locked-screen recording.
 */

import type { RecordingProfile, TrackingSession } from "../domain/types.ts";

export type LocationBridgePayload = {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  altitudeM: number | null;
  verticalAccuracyM: number | null;
  speedMps: number | null;
  courseDeg: number | null;
  recordedAt: string;
  provider: "core-location" | "fused" | "gnss" | "web";
  mocked: boolean | null;
};

export interface BackgroundLocationPlugin {
  readonly isNativeAvailable: () => Promise<boolean>;
  readonly startBackground: (
    profile: RecordingProfile,
  ) => Promise<TrackingSession>;
  readonly stopBackground: () => Promise<void>;
  readonly requestPermissions: () => Promise<"granted" | "denied" | "prompt">;
}

export const createBackgroundLocationPlugin = (): BackgroundLocationPlugin => ({
  isNativeAvailable: async () => false,
  startBackground: async (profile) => ({
    tripId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    profile,
    mode: "web-foreground",
  }),
  stopBackground: async () => undefined,
  requestPermissions: async () => {
    if (!("permissions" in navigator)) return "prompt";
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      return "prompt";
    } catch {
      return "prompt";
    }
  },
});

/** Declared for Capacitor registerPlugin wiring. */
export const BACKGROUND_LOCATION_PLUGIN_NAME = "BackgroundLocation";
