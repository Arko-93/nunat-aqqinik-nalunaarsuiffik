import {
  extractLandMask,
  nearestWaterPoint,
  planBoatRoutes,
  type BoatRoutePlan,
  type LandMask,
  type LonLat,
  type PlanBoatRoutesOptions,
} from "./boat-route.ts";

type ReadyMessage = { type: "ready"; polygonCount: number };
type ResultMessage = { type: "result"; id: number; plan: BoatRoutePlan };
type ErrorMessage = { type: "error"; id: number; error: string };
type OutMessage = ReadyMessage | ResultMessage | ErrorMessage;

let worker: Worker | null = null;
let workerReady: Promise<boolean> | null = null;
let mainMask: LandMask | null = null;
let nextPlanId = 1;
const pending = new Map<
  number,
  {
    resolve: (plan: BoatRoutePlan) => void;
    reject: (err: Error) => void;
  }
>();

const yieldPaint = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

const attachWorker = (land: GeoJSON.FeatureCollection): Promise<boolean> => {
  if (typeof Worker === "undefined") return Promise.resolve(false);
  try {
    const next = new Worker(
      new URL("./boat-route.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker = next;
    return new Promise<boolean>((resolve) => {
      const failTimer = window.setTimeout(() => {
        next.terminate();
        if (worker === next) worker = null;
        resolve(false);
      }, 60_000);
      next.onmessage = (event: MessageEvent<OutMessage>) => {
        const msg = event.data;
        if (msg.type === "ready") {
          window.clearTimeout(failTimer);
          resolve(true);
          return;
        }
        if (msg.type === "result") {
          pending.get(msg.id)?.resolve(msg.plan);
          pending.delete(msg.id);
          return;
        }
        if (msg.type === "error") {
          pending.get(msg.id)?.reject(new Error(msg.error));
          pending.delete(msg.id);
        }
      };
      next.onerror = () => {
        window.clearTimeout(failTimer);
        if (worker === next) worker = null;
        resolve(false);
      };
      next.postMessage({ type: "init", land });
    });
  } catch {
    worker = null;
    return Promise.resolve(false);
  }
};

/** Load land mask on a worker (preferred) and keep a main-thread fallback. */
export const prepareBoatRouter = async (
  land: GeoJSON.FeatureCollection,
): Promise<void> => {
  mainMask = extractLandMask(land);
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, waiters] of pending) {
    waiters.reject(new Error("Router reset"));
  }
  pending.clear();
  workerReady = attachWorker(land);
  await workerReady;
};

export const getMainLandMask = (): LandMask | null => mainMask;

/** Snap a land point out to the nearest shore water cell. */
export const snapEndpointToShore = (point: LonLat): LonLat => {
  if (!mainMask) return point;
  return (
    nearestWaterPoint(point.longitude, point.latitude, mainMask) ?? point
  );
};

/**
 * Plan A→B off the UI thread when the worker is ready.
 * Falls back to a yielded main-thread plan with a tight budget.
 */
export const planBoatRoutesAsync = async (
  from: LonLat,
  to: LonLat,
  options: PlanBoatRoutesOptions = {},
): Promise<BoatRoutePlan> => {
  const ready = workerReady ? await workerReady : false;
  if (ready && worker) {
    const id = nextPlanId++;
    try {
      return await new Promise<BoatRoutePlan>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage({ type: "plan", id, from, to, options });
      });
    } catch {
      // Fall through to main-thread planner.
    }
  }
  if (!mainMask) {
    return planBoatRoutes(from, to, [], options);
  }
  await yieldPaint();
  return planBoatRoutes(from, to, mainMask, {
    precise: false,
    budgetMs: 1800,
    ...options,
  });
};

export const resetBoatRouter = () => {
  worker?.terminate();
  worker = null;
  workerReady = null;
  mainMask = null;
  for (const [, waiters] of pending) {
    waiters.reject(new Error("Router reset"));
  }
  pending.clear();
};
