import { Effect } from "effect";
import { StorageError } from "../domain/errors.ts";
import type {
  ActiveTrip,
  InstalledPackage,
  OutboxEvent,
  TrackPoint,
  Trip,
  Waypoint,
} from "../domain/types.ts";

const DB_NAME = "nunat-marine-poc";
const DB_VERSION = 1;

type StoreName =
  | "trips"
  | "points"
  | "waypoints"
  | "packages"
  | "outbox"
  | "meta";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new StorageError("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(new StorageError(request.error?.message ?? "Failed to open DB"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("trips")) {
        db.createObjectStore("trips", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("points")) {
        const store = db.createObjectStore("points", {
          keyPath: ["tripId", "sequence"],
        });
        store.createIndex("byTrip", "tripId", { unique: false });
      }
      if (!db.objectStoreNames.contains("waypoints")) {
        const store = db.createObjectStore("waypoints", { keyPath: "id" });
        store.createIndex("byTrip", "tripId", { unique: false });
      }
      if (!db.objectStoreNames.contains("packages")) {
        db.createObjectStore("packages", { keyPath: "manifest.id" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const req = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new StorageError(request.error?.message ?? "IndexedDB request failed"),
      );
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new StorageError(tx.error?.message ?? "IndexedDB transaction failed"),
      );
    tx.onabort = () =>
      reject(
        new StorageError(tx.error?.message ?? "IndexedDB transaction aborted"),
      );
  });

const withStore = async <T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    const result = await run(tx.objectStore(storeName));
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
};

const asStorage = (error: unknown): StorageError =>
  error instanceof StorageError ? error : new StorageError(String(error));

export interface TripRepository {
  readonly saveTrip: (trip: Trip) => Effect.Effect<void, StorageError>;
  readonly getTrip: (id: string) => Effect.Effect<Trip | null, StorageError>;
  readonly listTrips: () => Effect.Effect<ReadonlyArray<Trip>, StorageError>;
  readonly appendPoint: (
    point: TrackPoint,
  ) => Effect.Effect<void, StorageError>;
  readonly listPoints: (
    tripId: string,
  ) => Effect.Effect<ReadonlyArray<TrackPoint>, StorageError>;
  readonly recoverActive: () => Effect.Effect<ActiveTrip | null, StorageError>;
  readonly deleteTrip: (id: string) => Effect.Effect<void, StorageError>;
}

export interface WaypointRepository {
  readonly saveWaypoint: (
    waypoint: Waypoint,
  ) => Effect.Effect<void, StorageError>;
  readonly listForTrip: (
    tripId: string,
  ) => Effect.Effect<ReadonlyArray<Waypoint>, StorageError>;
  readonly listAllWaypoints: () => Effect.Effect<
    ReadonlyArray<Waypoint>,
    StorageError
  >;
}

export interface MapPackageRepository {
  readonly savePackage: (
    pkg: InstalledPackage,
  ) => Effect.Effect<void, StorageError>;
  readonly getPackage: (
    id: string,
  ) => Effect.Effect<InstalledPackage | null, StorageError>;
  readonly listPackages: () => Effect.Effect<
    ReadonlyArray<InstalledPackage>,
    StorageError
  >;
  readonly removePackage: (id: string) => Effect.Effect<void, StorageError>;
}

export interface OutboxRepository {
  readonly enqueue: (event: OutboxEvent) => Effect.Effect<void, StorageError>;
  readonly listPending: () => Effect.Effect<
    ReadonlyArray<OutboxEvent>,
    StorageError
  >;
}

export class IndexedDbMarineStore
  implements
    TripRepository,
    WaypointRepository,
    MapPackageRepository,
    OutboxRepository
{
  saveTrip = (trip: Trip): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: async () => {
        await withStore("trips", "readwrite", async (store) => {
          await req(store.put(trip));
        });
        await withStore("meta", "readwrite", async (store) => {
          if (trip.status === "active" || trip.status === "paused") {
            await req(store.put({ key: "activeTripId", value: trip.id }));
          } else {
            const current = await req<{ key: string; value: string } | undefined>(
              store.get("activeTripId"),
            );
            if (current?.value === trip.id) {
              await req(store.delete("activeTripId"));
            }
          }
        });
      },
      catch: asStorage,
    });

  getTrip = (id: string): Effect.Effect<Trip | null, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("trips", "readonly", (store) =>
          req<Trip | undefined>(store.get(id)).then((trip) => trip ?? null),
        ),
      catch: asStorage,
    });

  listTrips = (): Effect.Effect<ReadonlyArray<Trip>, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("trips", "readonly", (store) => req<Trip[]>(store.getAll())),
      catch: asStorage,
    });

  appendPoint = (point: TrackPoint): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("points", "readwrite", async (store) => {
          await req(store.put(point));
        }),
      catch: asStorage,
    });

  listPoints = (
    tripId: string,
  ): Effect.Effect<ReadonlyArray<TrackPoint>, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("points", "readonly", async (store) => {
          const points = await req<TrackPoint[]>(
            store.index("byTrip").getAll(tripId),
          );
          return points.sort((a, b) => a.sequence - b.sequence);
        }),
      catch: asStorage,
    });

  recoverActive = (): Effect.Effect<ActiveTrip | null, StorageError> =>
    Effect.tryPromise({
      try: async () => {
        const activeId = await withStore("meta", "readonly", async (store) => {
          const row = await req<{ key: string; value: string } | undefined>(
            store.get("activeTripId"),
          );
          return row?.value ?? null;
        });
        if (!activeId) return null;
        const trip = await withStore("trips", "readonly", (store) =>
          req<Trip | undefined>(store.get(activeId)),
        );
        if (!trip || (trip.status !== "active" && trip.status !== "paused")) {
          return null;
        }
        const points = await withStore("points", "readonly", async (store) => {
          const rows = await req<TrackPoint[]>(
            store.index("byTrip").getAll(activeId),
          );
          return rows.sort((a, b) => a.sequence - b.sequence);
        });
        const lastPoint = points[points.length - 1] ?? null;
        return {
          trip,
          lastPoint,
          lastCommittedAt: lastPoint?.recordedAt ?? null,
        };
      },
      catch: asStorage,
    });

  deleteTrip = (id: string): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: async () => {
        const points = await withStore("points", "readonly", (store) =>
          req<TrackPoint[]>(store.index("byTrip").getAll(id)),
        );
        await withStore("points", "readwrite", async (store) => {
          for (const point of points) {
            await req(store.delete([point.tripId, point.sequence]));
          }
        });
        const waypoints = await withStore("waypoints", "readonly", (store) =>
          req<Waypoint[]>(store.index("byTrip").getAll(id)),
        );
        await withStore("waypoints", "readwrite", async (store) => {
          for (const waypoint of waypoints) {
            await req(store.delete(waypoint.id));
          }
        });
        await withStore("trips", "readwrite", async (store) => {
          await req(store.delete(id));
        });
        await withStore("meta", "readwrite", async (store) => {
          const current = await req<{ key: string; value: string } | undefined>(
            store.get("activeTripId"),
          );
          if (current?.value === id) await req(store.delete("activeTripId"));
        });
        await withStore("outbox", "readwrite", async (store) => {
          const events = await req<OutboxEvent[]>(store.getAll());
          for (const event of events) {
            const payload = event.payload as { tripId?: string } | null;
            if (payload?.tripId === id) await req(store.delete(event.id));
          }
        });
      },
      catch: asStorage,
    });

  saveWaypoint = (waypoint: Waypoint): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("waypoints", "readwrite", async (store) => {
          if (waypoint.visibility.type !== "private") {
            throw new StorageError("POC waypoints must remain private");
          }
          await req(store.put(waypoint));
        }),
      catch: asStorage,
    });

  listForTrip = (
    tripId: string,
  ): Effect.Effect<ReadonlyArray<Waypoint>, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("waypoints", "readonly", (store) =>
          req<Waypoint[]>(store.index("byTrip").getAll(tripId)),
        ),
      catch: asStorage,
    });

  listAllWaypoints = (): Effect.Effect<
    ReadonlyArray<Waypoint>,
    StorageError
  > =>
    Effect.tryPromise({
      try: () =>
        withStore("waypoints", "readonly", (store) =>
          req<Waypoint[]>(store.getAll()),
        ),
      catch: asStorage,
    });

  savePackage = (pkg: InstalledPackage): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("packages", "readwrite", async (store) => {
          await req(store.put(pkg));
        }),
      catch: asStorage,
    });

  getPackage = (
    id: string,
  ): Effect.Effect<InstalledPackage | null, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("packages", "readonly", (store) =>
          req<InstalledPackage | undefined>(store.get(id)).then(
            (pkg) => pkg ?? null,
          ),
        ),
      catch: asStorage,
    });

  listPackages = (): Effect.Effect<
    ReadonlyArray<InstalledPackage>,
    StorageError
  > =>
    Effect.tryPromise({
      try: () =>
        withStore("packages", "readonly", (store) =>
          req<InstalledPackage[]>(store.getAll()),
        ),
      catch: asStorage,
    });

  removePackage = (id: string): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("packages", "readwrite", async (store) => {
          await req(store.delete(id));
        }),
      catch: asStorage,
    });

  enqueue = (event: OutboxEvent): Effect.Effect<void, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("outbox", "readwrite", async (store) => {
          await req(store.put(event));
        }),
      catch: asStorage,
    });

  listPending = (): Effect.Effect<ReadonlyArray<OutboxEvent>, StorageError> =>
    Effect.tryPromise({
      try: () =>
        withStore("outbox", "readonly", async (store) => {
          const events = await req<OutboxEvent[]>(store.getAll());
          return events.filter((event) => event.flushedAt === null);
        }),
      catch: asStorage,
    });
}
