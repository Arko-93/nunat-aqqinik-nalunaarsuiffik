import { Hono } from "hono";
import type { ApiContext } from "../context.js";
import { effectiveDate, withReleaseMeta } from "../context.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const createReportRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/isolation", (c) => {
    const ctx = c.get("ctx");
    const at = c.req.query("at");
    if (at !== undefined && !DATE_RE.test(at)) {
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

  return app;
};
