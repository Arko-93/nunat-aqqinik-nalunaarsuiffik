import { NuqsAdapter } from "nuqs/adapters/react";
import { I18nProvider } from "../i18n/I18nContext.tsx";
import { App } from "./App.tsx";

/**
 * Production composition root: nuqs URL adapter + i18n + app shell.
 * Tests render this same tree so the URL-state seam is the real one.
 */
export function Root() {
  return (
    <NuqsAdapter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </NuqsAdapter>
  );
}
