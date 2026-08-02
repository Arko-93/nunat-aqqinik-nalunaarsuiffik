import type { ReactNode } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { useI18n } from "../i18n/I18nContext.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";

export type MobileView = "list" | "map";

type Props = {
  error: string | null;
  statusText: string;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
  listPanel: ReactNode;
  mapPanel: ReactNode;
  dossierPanel: ReactNode;
  mapChrome: ReactNode;
  mobileSheet: ReactNode;
};

export function AppShell({
  error,
  statusText,
  mobileView,
  onMobileViewChange,
  listPanel,
  mapPanel,
  dossierPanel,
  mapChrome,
  mobileSheet,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="shell-brand">
          <p className="shell-kicker">{t.testBranch}</p>
          <h1 className="shell-title">{t.appTitle}</h1>
        </div>
        <div className="shell-header-tools">
          <div className="shell-mobile-toggle" role="group" aria-label="View">
            <Button
              type="button"
              size="sm"
              variant={mobileView === "list" ? "primary" : "ghost"}
              aria-pressed={mobileView === "list"}
              onClick={() => onMobileViewChange("list")}
            >
              {t.viewList}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mobileView === "map" ? "primary" : "ghost"}
              aria-pressed={mobileView === "map"}
              onClick={() => onMobileViewChange("map")}
            >
              {t.viewMap}
            </Button>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <div className={`shell-body mobile-view-${mobileView}`}>
        <aside className="shell-list" aria-label={t.placesList}>
          {listPanel}
        </aside>
        <main className="shell-map" aria-label={t.viewMap}>
          {mapPanel}
          <div className="map-chrome">{mapChrome}</div>
        </main>
        <aside className="shell-dossier" aria-label={t.overview}>
          {dossierPanel}
        </aside>
      </div>

      {mobileSheet}

      <div className={`shell-status${error ? " error" : ""}`} role="status">
        {error ?? statusText}
      </div>
    </div>
  );
}
