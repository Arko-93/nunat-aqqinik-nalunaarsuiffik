import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;

/**
 * Register the `pmtiles://` protocol once so vector sources such as the
 * coastline mask (`pmtiles:///packages/coastline-land/land.pmtiles`) load.
 * Same-origin paths keep online and future offline packs on one file.
 */
export function registerPmtilesProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}
