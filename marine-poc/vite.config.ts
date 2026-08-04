import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Nunat Marine — trip notebook",
        short_name: "Nunat Marine",
        description:
          "Kalaallisut-first private trip notebook companion for Greenland small-boat travel. Not an official nautical chart.",
        theme_color: "#0b1c28",
        background_color: "#041018",
        display: "standalone",
        lang: "kl",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json,geojson,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
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
