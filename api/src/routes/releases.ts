import { Hono } from "hono";
import type { ApiContext } from "../context.js";
import { releaseMeta } from "../context.js";

export const createReleaseRoutes = () => {
  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.get("/latest", (c) => {
    const ctx = c.get("ctx");
    return c.json({
      ...releaseMeta(ctx),
      created_at: ctx.release.createdAt,
      manifest_path: `releases/${ctx.release.releaseId}/manifest.json`,
      publish_ready: ctx.release.sourceHealth.publish_ready,
      publication_blocker_count:
        ctx.release.manifest.publication_blockers?.length ?? 0,
    });
  });

  app.get("/:release_id/manifest", (c) => {
    const ctx = c.get("ctx");
    const releaseId = c.req.param("release_id");
    if (releaseId !== ctx.release.releaseId) {
      return c.json(
        {
          error: "release_not_available",
          message: `Release '${releaseId}' is not mounted. Active release is '${ctx.release.releaseId}'.`,
          ...releaseMeta(ctx),
        },
        404,
      );
    }

    c.header("ETag", ctx.release.manifestEtag);
    return c.json({
      ...releaseMeta(ctx),
      manifest: ctx.release.manifest,
    });
  });

  return app;
};
