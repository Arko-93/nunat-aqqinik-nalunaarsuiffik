import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@cloudflare/kumo/styles/standalone";
import { I18nProvider } from "./i18n/I18nContext.tsx";
import { App } from "./ui/App.tsx";
import "./ui/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
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
