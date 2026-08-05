import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  collectShellPrecacheUrls,
  injectPrecacheUrls,
} from "./scripts/shell-sw-precache.ts";

/** Inject hashed JS/CSS/font URLs into dist/sw.js at build time. */
function shellSwPrecachePlugin(): Plugin {
  return {
    name: "nunat-shell-sw-precache",
    apply: "build",
    writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir ?? "dist";
      const fileNames = Object.values(bundle).map((item) => item.fileName);
      const precache = collectShellPrecacheUrls(fileNames);
      const swPath = join(outDir, "sw.js");
      const source = readFileSync(swPath, "utf8");
      writeFileSync(swPath, injectPrecacheUrls(source, precache));
    },
  };
}

export default defineConfig({
  plugins: [react(), shellSwPrecachePlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 3457,
  },
});
