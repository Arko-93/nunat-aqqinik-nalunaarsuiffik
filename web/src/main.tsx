import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@cloudflare/kumo/styles/standalone";
import { registerPmtilesProtocol } from "./map/pmtiles-protocol.ts";
import { Root } from "./ui/Root.tsx";
import "./ui/app.css";

// pmtiles:// sources (coastline mask) must be registered before map load.
registerPmtilesProtocol();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

/** App-shell Service Worker only — corridor PMTiles stay in OPFS. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* shell still works without SW */
    });
  });
}
