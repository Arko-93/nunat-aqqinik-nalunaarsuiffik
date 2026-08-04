import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n/I18nContext.tsx";
import { App } from "./ui/App.tsx";
import "./styles.css";

const PACKAGE_CACHE = "nunat-marine-packages-v2";

// Drop stale POC service workers that cached broken builds.
// Keep the region package CacheStorage entry.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
}
if ("caches" in window) {
  void caches.keys().then((keys) => {
    for (const key of keys) {
      if (key !== PACKAGE_CACHE) void caches.delete(key);
    }
  });
}

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
