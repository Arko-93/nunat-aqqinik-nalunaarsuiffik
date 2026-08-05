import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 3457,
  },
  // PROTOTYPE entry: meter band breaks (wayfinder #9). Throwaway.
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        "prototype-meter-bands": "prototype-meter-bands.html",
      },
    },
  },
});
