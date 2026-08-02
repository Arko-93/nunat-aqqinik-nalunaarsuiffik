import { Hono } from "hono";
import type { ApiContext } from "../context.js";
import { releaseMeta } from "../context.js";

export const createSourceHealthRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/", (c) => {
    const ctx = c.get("ctx");
    return c.json({
      ...releaseMeta(ctx),
      checked_at: ctx.release.sourceHealth.checked_at,
      publish_ready: ctx.release.sourceHealth.publish_ready,
      publication_blockers:
        ctx.release.sourceHealth.publication_blockers ?? [],
      source_snapshots: ctx.release.sourceHealth.source_snapshots ?? [],
      canonical_sources: ctx.release.sourceHealth.canonical_sources ?? {},
    });
  });

  return app;
};
