import { Context, Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";
import {
  ArcGisQueryResponse,
  type Placename,
  type PlacenameScope,
  toPlacename,
  whereClauseForScope,
} from "../domain/placename.ts";
import {
  NunagisDecodeError,
  NunagisHttpError,
  NunagisServiceError,
} from "./errors.ts";

export const MIDPOINT_LAYER_URL =
  "https://kort.nunagis.gl/refserver/rest/services/PlacenamesRegister/PlacenamesRegisterSearch/MapServer/1";

const OUT_FIELDS = [
  "OBJECTID",
  "GlobalID",
  "ID",
  "PlacenameOfficial",
  "PlacenameOfficialOld",
  "PlacenameDanish",
  "Type",
  "MunicipalityCode",
  "LokalityCode",
].join(",");

export interface Interface {
  readonly fetchPlacenames: (
    scope: PlacenameScope,
  ) => Effect.Effect<
    ReadonlyArray<Placename>,
    NunagisHttpError | NunagisDecodeError | NunagisServiceError
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@app/NunagisPlacenames",
) {}

const queryPage = Effect.fn("NunagisPlacenames.queryPage")(function* (
  client: HttpClient.HttpClient,
  where: string,
  offset: number,
  pageSize: number,
) {
  const url = HttpClientRequest.get(MIDPOINT_LAYER_URL + "/query").pipe(
    HttpClientRequest.setUrlParams({
      f: "json",
      where,
      outFields: OUT_FIELDS,
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: "OBJECTID",
    }),
  );

  const response = yield* client.execute(url).pipe(
    Effect.mapError(
      (cause) =>
        new NunagisHttpError({
          message: "NunaGIS request failed",
          cause,
        }),
    ),
  );

  if (response.status < 200 || response.status >= 300) {
    return yield* new NunagisHttpError({
      message: `NunaGIS returned HTTP ${response.status}`,
      status: response.status,
    });
  }

  const body = yield* HttpClientResponse.schemaBodyJson(ArcGisQueryResponse)(
    response,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new NunagisDecodeError({
          message: "Failed to decode NunaGIS query response",
          cause,
        }),
    ),
  );

  if (body.error) {
    return yield* new NunagisServiceError({
      message: body.error.message ?? "NunaGIS service error",
      code: body.error.code,
    });
  }

  return body;
});

export const layer: Layer.Layer<Service, never, HttpClient.HttpClient> =
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      const fetchPlacenames = Effect.fn("NunagisPlacenames.fetchPlacenames")(
        function* (scope: PlacenameScope) {
          const where = whereClauseForScope(scope);
          const pageSize = 1000;
          const places: Array<Placename> = [];
          let offset = 0;

          while (true) {
            const page = yield* queryPage(http, where, offset, pageSize);
            for (const feature of page.features) {
              const place = toPlacename(feature);
              if (place) places.push(place);
            }
            yield* Effect.logInfo(
              `Fetched ${places.length} placenames (offset ${offset})`,
            );
            if (
              !page.exceededTransferLimit &&
              page.features.length < pageSize
            ) {
              break;
            }
            if (page.features.length === 0) break;
            offset += page.features.length;
          }

          return places;
        },
      );

      return Service.of({ fetchPlacenames });
    }),
  );

export const layerLive: Layer.Layer<Service> = layer.pipe(
  Layer.provide(FetchHttpClient.layer),
);

export * as NunagisPlacenames from "./nunagis-placenames.ts";
