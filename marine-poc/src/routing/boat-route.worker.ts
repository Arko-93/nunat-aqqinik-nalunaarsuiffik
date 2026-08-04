/// <reference lib="webworker" />
import {
  extractLandMask,
  planBoatRoutes,
  type BoatRoutePlan,
  type LandMask,
  type LonLat,
  type PlanBoatRoutesOptions,
} from "./boat-route.ts";

type InitMessage = {
  type: "init";
  land: GeoJSON.FeatureCollection;
};

type PlanMessage = {
  type: "plan";
  id: number;
  from: LonLat;
  to: LonLat;
  options?: PlanBoatRoutesOptions;
};

type InMessage = InitMessage | PlanMessage;

let mask: LandMask | null = null;

self.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      mask = extractLandMask(msg.land);
      self.postMessage({
        type: "ready",
        polygonCount: mask.polygons.length,
      });
      return;
    }
    if (msg.type === "plan") {
      if (!mask) {
        self.postMessage({
          type: "error",
          id: msg.id,
          error: "Land mask not ready",
        });
        return;
      }
      const plan: BoatRoutePlan = planBoatRoutes(
        msg.from,
        msg.to,
        mask,
        msg.options ?? {},
      );
      self.postMessage({ type: "result", id: msg.id, plan });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.type === "plan" ? msg.id : -1,
      error: String(err),
    });
  }
};
