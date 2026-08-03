import { Context, Effect, Layer } from "effect";
import {
  IndexedDbMarineStore,
  type MapPackageRepository,
  type OutboxRepository,
  type TripRepository,
  type WaypointRepository,
} from "../storage/repository.ts";
import {
  BridgedLocationService,
  type LocationService as ILocationService,
} from "../tracking/location-service.ts";

export class TripRepo extends Context.Service<TripRepo, TripRepository>()(
  "@marine/TripRepository",
) {}

export class WaypointRepo extends Context.Service<WaypointRepo, WaypointRepository>()(
  "@marine/WaypointRepository",
) {}

export class PackageRepo extends Context.Service<PackageRepo, MapPackageRepository>()(
  "@marine/PackageRepository",
) {}

export class OutboxRepo extends Context.Service<OutboxRepo, OutboxRepository>()(
  "@marine/OutboxRepository",
) {}

export class MarineLocation extends Context.Service<MarineLocation, ILocationService>()(
  "@marine/LocationService",
) {}

export const makeMarineStoreLayer = (): Layer.Layer<
  TripRepo | WaypointRepo | PackageRepo | OutboxRepo
> => {
  const store = new IndexedDbMarineStore();
  return Layer.mergeAll(
    Layer.succeed(TripRepo, store),
    Layer.succeed(WaypointRepo, store),
    Layer.succeed(PackageRepo, store),
    Layer.succeed(OutboxRepo, store),
  );
};

export const LocationLayer = Layer.succeed(
  MarineLocation,
  new BridgedLocationService(),
);

export const MarineLiveLayer = Layer.mergeAll(
  makeMarineStoreLayer(),
  LocationLayer,
);

export const runMarine = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    TripRepo | WaypointRepo | PackageRepo | OutboxRepo | MarineLocation
  >,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(MarineLiveLayer)));
