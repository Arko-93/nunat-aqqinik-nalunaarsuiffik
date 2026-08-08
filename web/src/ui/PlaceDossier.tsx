import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  responsibilityLabel,
  type Placename,
} from "../domain/placename.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { DossierTabs } from "./DossierTabs.tsx";
import { displayTypeLabel } from "./map-selection.ts";
import { PlaceDossierSources } from "./PlaceDossierSources.tsx";

type TabId = "overview" | "sources";

type Props = {
  place: Placename;
  release: LoadedRelease | null;
  onClose?: () => void;
};

export function PlaceDossier({ place, release, onClose }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const areaLabel = responsibilityLabel(
    place.municipalityCode,
    place.municipalityName,
  );
  const typeLabel = displayTypeLabel(place, t);

  const tabs = useMemo(
    () => [
      { value: "overview" as const, label: t.overview },
      { value: "sources" as const, label: t.sources },
    ],
    [t],
  );

  const [tab, setTab] = useState<TabId>("overview");
  const activeTab = tabs.some((entry) => entry.value === tab)
    ? tab
    : tabs[0]!.value;

  // Move focus into the dossier when the selected place changes (rail open).
  useEffect(() => {
    headingRef.current?.focus();
  }, [place.featureId]);

  const identityBadge =
    place.identityStatus === "canonical"
      ? t.identityCanonical
      : place.identityStatus === "candidate"
        ? t.identityCandidate
        : t.identityUpstream;

  return (
    <article className="place-dossier" aria-labelledby={titleId}>
      <header className="place-dossier-header">
        <div className="place-panel-meta">
          <Badge variant="secondary">{typeLabel}</Badge>
          {areaLabel ? <Badge variant="outline">{areaLabel}</Badge> : null}
          <Badge variant="outline">{identityBadge}</Badge>
        </div>
        <div className="place-dossier-title-row">
          <h2
            ref={headingRef}
            id={titleId}
            className="place-dossier-title"
            tabIndex={-1}
          >
            <Text as="span" variant="heading2">
              {place.officialName}
            </Text>
          </h2>
          {onClose ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t.closePlace}
              onClick={onClose}
            >
              ×
            </Button>
          ) : null}
        </div>
        <Text as="p" variant="secondary" size="xs">
          {t.dossierPurpose}
        </Text>
      </header>

      <DossierTabs tabs={tabs} value={activeTab} onValueChange={setTab}>
        {activeTab === "overview" ? (
          <dl className="names">
            <div>
              <dt>{t.officialName}</dt>
              <dd>{place.officialName}</dd>
            </div>
            {place.danishName && place.danishName !== place.officialName ? (
              <div>
                <dt>{t.danishName}</dt>
                <dd>{place.danishName}</dd>
              </div>
            ) : null}
            {place.oldOfficialName &&
            place.oldOfficialName !== place.officialName ? (
              <div>
                <dt>{t.historicalName}</dt>
                <dd>{place.oldOfficialName}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t.coordinates}</dt>
              <dd>
                {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt>{t.featureId}</dt>
              <dd>
                <code>{place.featureId}</code>
              </dd>
            </div>
            {place.placeId ? (
              <div>
                <dt>{t.placeId}</dt>
                <dd>
                  <code>{place.placeId}</code>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <PlaceDossierSources
            place={place}
            release={release}
            identityBadge={identityBadge}
          />
        )}
      </DossierTabs>
    </article>
  );
}
