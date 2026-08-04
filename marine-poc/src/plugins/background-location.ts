/**
 * Capacitor BackgroundLocation plugin contract.
 *
 * Web/PWA builds fall back to foreground geolocation.
 * Native iOS Core Location / Android foreground-service implementations
 * must satisfy this interface for locked-screen recording.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
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

type NativeBackgroundLocation = {
  startBackground: (options: {
    profile: RecordingProfile;
  }) => Promise<TrackingSession>;
  stopBackground: () => Promise<void>;
  requestPermissions: () => Promise<{ state: "granted" | "denied" | "prompt" }>;
};

const NativePlugin = registerPlugin<NativeBackgroundLocation>(
  "BackgroundLocation",
);

export const BACKGROUND_LOCATION_PLUGIN_NAME = "BackgroundLocation";

export const createBackgroundLocationPlugin = (): BackgroundLocationPlugin => ({
  isNativeAvailable: async () => {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      // Probe: native plugin throws if unimplemented.
      await NativePlugin.requestPermissions();
      return true;
    } catch {
      return false;
    }
  },
  startBackground: async (profile) => {
    if (!Capacitor.isNativePlatform()) {
      return {
        tripId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        profile,
        mode: "web-foreground",
      };
    }
    const session = await NativePlugin.startBackground({ profile });
    return {
      ...session,
      mode: "native-background",
    };
  },
  stopBackground: async () => {
    if (!Capacitor.isNativePlatform()) return;
    await NativePlugin.stopBackground();
  },
  requestPermissions: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await NativePlugin.requestPermissions();
        return result.state;
      } catch {
        return "denied";
      }
    }
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
