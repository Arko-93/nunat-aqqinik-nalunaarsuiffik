import { Hono } from "hono";
import type { ApiContext } from "../context.js";
import { effectiveDate, isIsoDate, withReleaseMeta } from "../context.js";

export const createReachabilityRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/", (c) => {
    const ctx = c.get("ctx");
    const fromPlaceId = c.req.query("from");
    const toPlaceId = c.req.query("to");
    const at = c.req.query("at");
    const capability = c.req.query("capability") ?? "passenger";
    const maxTransfersRaw = c.req.query("max_transfers");

    if (!fromPlaceId || !toPlaceId) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "missing_endpoints",
          message: "Query parameters 'from' and 'to' are required place ids.",
        }),
        400,
      );
    }

    if (at !== undefined && !isIsoDate(at)) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_effective_date",
          message: "Query parameter 'at' must be YYYY-MM-DD.",
        }),
        400,
      );
    }

    let maxTransfers: number | null = null;
    if (maxTransfersRaw !== undefined) {
      maxTransfers = Number(maxTransfersRaw);
      if (
        !Number.isInteger(maxTransfers) ||
        maxTransfers < 0 ||
        maxTransfers > 32
      ) {
        return c.json(
          withReleaseMeta(ctx, {
            error: "invalid_max_transfers",
            message:
              "Query parameter 'max_transfers' must be an integer from 0 to 32.",
          }),
          400,
        );
      }
    }

    const fromPlace = ctx.repository.getPlaceById(fromPlaceId);
    if (!fromPlace) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "place_not_found",
          message: `Place '${fromPlaceId}' was not found in release '${ctx.release.releaseId}'.`,
        }),
        404,
      );
    }

    const toPlace = ctx.repository.getPlaceById(toPlaceId);
    if (!toPlace) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "place_not_found",
          message: `Place '${toPlaceId}' was not found in release '${ctx.release.releaseId}'.`,
        }),
        404,
      );
    }

    const effective = effectiveDate(ctx, at);
    const result = ctx.repository.findReachabilityPath({
      fromPlaceId,
      toPlaceId,
      at: effective,
      capability,
      maxTransfers,
    });

    return c.json(withReleaseMeta(ctx, result));
  });

  return app;
};
