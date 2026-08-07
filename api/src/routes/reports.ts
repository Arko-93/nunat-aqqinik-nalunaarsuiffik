import { Hono } from "hono";
import type { ApiContext } from "../context.js";
import { effectiveDate, isIsoDate, withReleaseMeta } from "../context.js";

export const createReportRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/isolation", (c) => {
    const ctx = c.get("ctx");
    const at = c.req.query("at");
    if (at !== undefined && !isIsoDate(at)) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_effective_date",
          message: "Query parameter 'at' must be YYYY-MM-DD.",
        }),
        400,
      );
    }

    const effective = effectiveDate(ctx, at);
    const report = ctx.repository.getPassengerIsolationReport(effective);

    return c.json(
      withReleaseMeta(ctx, {
        report,
      }),
    );
  });

  app.get("/single-dependency", (c) => {
    const ctx = c.get("ctx");
    const at = c.req.query("at");
    if (at !== undefined && !isIsoDate(at)) {
      return c.json(
        withReleaseMeta(ctx, {
          error: "invalid_effective_date",
          message: "Query parameter 'at' must be YYYY-MM-DD.",
        }),
        400,
      );
    }

    const effective = effectiveDate(ctx, at);
    const report = ctx.repository.getSingleDependencyReport(effective);

    return c.json(
      withReleaseMeta(ctx, {
        report,
      }),
    );
  });

  app.get("/seasonal-loss", (c) => {
    const ctx = c.get("ctx");
    const yearRaw = c.req.query("year");
    const at = c.req.query("at");

    let year: number;
    if (yearRaw !== undefined) {
      year = Number(yearRaw);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return c.json(
          withReleaseMeta(ctx, {
            error: "invalid_year",
            message: "Query parameter 'year' must be an integer YYYY.",
          }),
          400,
        );
      }
    } else if (at !== undefined) {
      if (!isIsoDate(at)) {
        return c.json(
          withReleaseMeta(ctx, {
            error: "invalid_effective_date",
            message: "Query parameter 'at' must be YYYY-MM-DD.",
          }),
          400,
        );
      }
      year = Number(at.slice(0, 4));
    } else {
      year = Number(effectiveDate(ctx, undefined).slice(0, 4));
    }

    const report = ctx.repository.getSeasonalLossReport(year);

    return c.json(
      withReleaseMeta(ctx, {
        report,
      }),
    );
  });

  return app;
};
