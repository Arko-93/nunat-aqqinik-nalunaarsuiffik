import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const { app, ctx } = createApp();
const config = loadConfig();

console.log(
  `Decision Geography API listening on http://${config.host}:${config.port}`,
);
console.log(
  `Release ${ctx.release.releaseId} (data_as_of ${ctx.release.dataAsOf})`,
);

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});
