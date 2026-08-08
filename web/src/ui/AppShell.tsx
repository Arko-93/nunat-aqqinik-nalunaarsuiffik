import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";

type Props = {
  error: string | null;
  statusText: string;
  /** Search results or place dossier open — widen the right rail. */
  railExpanded: boolean;
  mapPanel: ReactNode;
  railPanel: ReactNode;
  mobileSheet: ReactNode;
  mapChrome?: ReactNode;
};

export function AppShell({
  error,
  statusText,
  railExpanded,
  mapPanel,
  railPanel,
  mobileSheet,
  mapChrome,
}: Props) {
  const { t } = useI18n();

  return (
    <div className={`app-shell map-first${railExpanded ? " rail-expanded" : ""}`}>
      <a
        className="skip-link"
        href="#place-search"
        onClick={(event) => {
          event.preventDefault();
          const target =
            document.querySelector<HTMLElement>(
              ".shell-rail [data-place-search]",
            ) ??
            document.querySelector<HTMLElement>("[data-place-search]");
          target?.focus();
        }}
      >
        {t.skipToSearch}
      </a>
      <header className="shell-header shell-header-soft">
        <div className="shell-brand">
          <h1 className="shell-title shell-title-soft">{t.appTitle}</h1>
          <p className="shell-tagline shell-tagline-soft">{t.appTagline}</p>
        </div>
        <div className="shell-header-tools">
          <LanguageSwitcher />
        </div>
      </header>

      <div className="shell-body mobile-view-map">
        <main className="shell-map" aria-label={t.viewMap}>
          {mapPanel}
          {mapChrome}
        </main>
        <aside className="shell-rail" aria-label={t.placesList} id="place-search">
          {railPanel}
        </aside>
      </div>

      {mobileSheet}

      <div className={`shell-status${error ? " error" : ""}`} role="status">
        {error ?? statusText}
      </div>
    </div>
  );
}
