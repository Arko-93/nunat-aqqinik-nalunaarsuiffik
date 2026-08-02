import { Hono } from "hono";
import type { ResolveRequest } from "../contracts/common.js";
import type { ApiContext } from "../context.js";
import {
  effectiveDate,
  isIsoDate,
  releaseMeta,
  withReleaseMeta,
} from "../context.js";

export const createPlaceRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/", (c) => {
    const ctx = c.get("ctx");
    const q = c.req.query("q") ?? "";
    const language = c.req.query("language");
    const limit = Number(c.req.query("limit") ?? "50");

    const places = ctx.repository.searchPlaces({
      q,
      language: language ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });

    return c.json(
      withReleaseMeta(ctx, {
        query: q,
        total: places.length,
        places,
      }),
    );
  });

  app.post("/resolve", async (c) => {
    const ctx = c.get("ctx");
    let body: ResolveRequest;
    try {
      body = (await c.req.json()) as ResolveRequest;
    } catch {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_json",
          message: "Request body must be JSON.",
        }),
        400,
      );
    }

    const { result, candidates } = ctx.repository.resolvePlace({
      identifiers: body.identifiers,
      name: body.name,
      municipalityCode: body.municipality_code,
    });

    return c.json(
      withReleaseMeta(ctx, {
        result,
        candidates,
        requires_confirmation: result !== "resolved",
      }),
    );
  });

  app.get("/:place_id", (c) => {
    const ctx = c.get("ctx");
    const placeId = c.req.param("place_id");
    const at = c.req.query("at");
    if (at && !isIsoDate(at)) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_date",
          message: "Query parameter 'at' must be YYYY-MM-DD.",
        }),
        400,
      );
    }

    const place = ctx.repository.getPlaceById(placeId);
    if (!place) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "place_not_found",
          message: `Place '${placeId}' was not found in release '${ctx.release.releaseId}'.`,
        }),
        404,
      );
    }

    return c.json(
      withReleaseMeta(ctx, {
        effective_date: effectiveDate(ctx, at),
        place,
      }, place.source_refs),
    );
  });

  app.get("/:place_id/identifiers", (c) => {
    const ctx = c.get("ctx");
    const placeId = c.req.param("place_id");
    const place = ctx.repository.getPlaceById(placeId);
    if (!place) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "place_not_found",
          message: `Place '${placeId}' was not found in release '${ctx.release.releaseId}'.`,
        }),
        404,
      );
    }

    const identifiers = ctx.repository.getPlaceIdentifiers(placeId);
    return c.json(
      withReleaseMeta(ctx, {
        place_id: placeId,
        identifiers,
      }),
    );
  });

  app.get("/:place_id/connections", (c) => {
    const ctx = c.get("ctx");
    const placeId = c.req.param("place_id");
    const at = c.req.query("at");

    if (at && !isIsoDate(at)) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_date",
          message: "Query parameter 'at' must be YYYY-MM-DD.",
        }),
        400,
      );
    }

    const place = ctx.repository.getPlaceById(placeId);
    if (!place) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "place_not_found",
          message: `Place '${placeId}' was not found in release '${ctx.release.releaseId}'.`,
        }),
        404,
      );
    }

    const effective = effectiveDate(ctx, at);
    const connections = ctx.repository.getPlaceConnections(placeId, effective);

    return c.json(
      withReleaseMeta(ctx, {
        place_id: placeId,
        effective_date: effective,
        connections,
      }),
    );
  });

  return app;
};

export const createPlacesRouter = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();
  app.route("/", createPlaceRoutes());
  return app;
};
