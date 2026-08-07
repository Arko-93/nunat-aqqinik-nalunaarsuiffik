import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiConfig } from "./config.js";
import {
  loadConfig,
  releaseDbPath,
  resolveReleaseId,
} from "./config.js";
import type { ApiContext } from "./context.js";
import { ReleaseStore } from "./repository/release-store.js";
import { openRepository } from "./repository/sqlite-repository.js";
import { createPlacesRouter } from "./routes/places.js";
import { createReachabilityRoutes } from "./routes/reachability.js";
import { createReleaseRoutes } from "./routes/releases.js";
import { createReportRoutes } from "./routes/reports.js";
import { createSourceHealthRoutes } from "./routes/source-health.js";

export type CreateAppOptions = {
  config?: ApiConfig;
  context?: ApiContext;
};

export const createApiContext = (config: ApiConfig = loadConfig()): ApiContext => {
  const releaseId = resolveReleaseId(config);
  const dbPath = releaseDbPath(config, releaseId);
  const releaseStore = new ReleaseStore(config);
  const release = releaseStore.load(releaseId, dbPath);
  const repository = openRepository(dbPath);
  return { release, repository };
};

export const createApp = (options: CreateAppOptions = {}) => {
  const config = options.config ?? loadConfig();
  const ctx = options.context ?? createApiContext(config);

  const app = new Hono<{ Variables: { ctx: ApiContext } }>();

  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("ctx", ctx);
    await next();
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      release_id: ctx.release.releaseId,
      data_as_of: ctx.release.dataAsOf,
    }),
  );

  app.route("/v1/releases", createReleaseRoutes());
  app.route("/v1/source-health", createSourceHealthRoutes());
  app.route("/v1/places", createPlacesRouter());
  app.route("/v1/reports", createReportRoutes());
  app.route("/v1/reachability", createReachabilityRoutes());

  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        message: "Route not found.",
        release_id: ctx.release.releaseId,
        data_as_of: ctx.release.dataAsOf,
      },
      404,
    ),
  );

  return { app, ctx };
};
