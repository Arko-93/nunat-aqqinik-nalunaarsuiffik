import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    // PWA/service-worker caching disabled for the POC — it served stale broken builds.
  ],
  server: {
    host: "127.0.0.1",
    port: 5180,
  },
  preview: {
    host: "127.0.0.1",
    port: 3459,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
