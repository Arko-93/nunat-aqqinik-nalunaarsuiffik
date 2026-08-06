import maplibregl, {
  type RequestParameters,
  type GetResourceResponse,
} from "maplibre-gl";
import { PMTiles, Protocol, type RangeResponse, type Source } from "pmtiles";
import { CORRIDOR_PACKAGE_BASE, TERRAIN_OFFLINE_FILES } from "../offline/corridor-policy.ts";

let registered = false;

/**
 * Network-backed protocol instance: serves same-origin `pmtiles:///...`
 * archives (coastline mask) and remote `pmtiles://http(s)://...` archives.
 */
const networkProtocol = new Protocol();

/**
 * OPFS-backed archives keyed by their pack path (e.g.
 * `/packages/qaarsut-kullorsuaq/land-relief.pmtiles`). When a full pack is
 * installed these serve the SAME logical tile paths the online style uses —
 * MapLibre keeps one URL scheme, the protocol resolves it locally.
 */
const packTiles = new Map<string, PMTiles>();

const TILE_URL_RE = /^pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/;

/**
 * `pmtiles://` archive part of a request URL. Tile requests carry
 * `/z/x/y[.ext]`; tilejson requests (`type=json`) are the bare archive URL.
 */
function archivePathFrom(params: RequestParameters): string | null {
  if (params.type === "json") {
    return params.url.startsWith("pmtiles://")
      ? params.url.slice("pmtiles://".length)
      : null;
  }
  const match = TILE_URL_RE.exec(params.url);
  return match ? match[1] : null;
}

/**
 * Serve one tile/tilejson from a local (OPFS-backed) PMTiles instance,
 * mirroring the pmtiles Protocol's tilev4 semantics: missing MVT tiles are
 * an empty buffer, missing raster tiles are null.
 */
async function serveLocalTile(
  tiles: PMTiles,
  params: RequestParameters,
  signal: AbortSignal,
): Promise<GetResourceResponse<unknown>> {
  if (params.type === "json") {
    const tilejson = await tiles.getTileJson(params.url);
    return { data: tilejson };
  }
  const match = TILE_URL_RE.exec(params.url);
  if (!match) throw new Error("Invalid PMTiles protocol URL");
  const z = Number(match[2]);
  const x = Number(match[3]);
  const y = Number(match[4]);
  const tile = await tiles.getZxy(z, x, y, signal);
  if (!tile) {
    const header = await tiles.getHeader();
    if (header.tileType === 1 || header.tileType === 6) {
      return { data: new Uint8Array() };
    }
    return { data: null };
  }
  return {
    data: new Uint8Array(tile.data),
    ...(tile.cacheControl ? { cacheControl: tile.cacheControl } : {}),
    ...(tile.expires ? { expires: tile.expires } : {}),
  };
}

/**
 * Register the `pmtiles://` protocol once so vector/raster sources load.
 * Pack archives (when a full corridor pack is installed) resolve from OPFS;
 * everything else falls through to the network protocol.
 */
export function registerPmtilesProtocol(): void {
  if (registered) return;
  maplibregl.addProtocol("pmtiles", (params, abortController) => {
    const archive = archivePathFrom(params);
    const local = archive ? packTiles.get(archive) : undefined;
    if (local) {
      return serveLocalTile(local, params, abortController.signal);
    }
    return networkProtocol.tile(params, abortController);
  });
  registered = true;
}

/** pmtiles Source adapter over an OPFS File: byte ranges via Blob.slice. */
class OpfsPackSource implements Source {
  constructor(
    private readonly file: Blob,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.file.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}

/**
 * Bind the installed full pack to the protocol: each TERRAIN_OFFLINE_FILES
 * archive becomes readable at `pmtiles:///packages/qaarsut-kullorsuaq/<path>`.
 * Re-binding replaces the previous pack's instances.
 */
export async function bindCorridorPackToProtocol(
  readBlob: (path: string) => Promise<Blob | null>,
): Promise<void> {
  const next = new Map<string, PMTiles>();
  for (const path of TERRAIN_OFFLINE_FILES) {
    const file = await readBlob(path);
    if (!file) {
      throw new Error(`Pack file missing from OPFS: ${path}`);
    }
    const key = `${CORRIDOR_PACKAGE_BASE}/${path}`;
    next.set(key, new PMTiles(new OpfsPackSource(file, key)));
  }
  packTiles.clear();
  for (const [key, tiles] of next) {
    packTiles.set(key, tiles);
  }
}

/** Remove the pack archives from the protocol (pack deleted). */
export function unbindCorridorPackFromProtocol(): void {
  for (const path of TERRAIN_OFFLINE_FILES) {
    packTiles.delete(`${CORRIDOR_PACKAGE_BASE}/${path}`);
  }
}
