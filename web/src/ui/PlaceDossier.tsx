import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import { useMemo, useState } from "react";
import {
  responsibilityLabel,
  type Placename,
} from "../domain/placename.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { OfflineStatus } from "./OfflineStatus.tsx";
import { displayTypeLabel, placeProvenance } from "./map-selection.ts";

type TabId = "overview" | "sources";

type Props = {
  place: Placename;
  release: LoadedRelease | null;
  onClose?: () => void;
  /** Test/default seam — production leaves this unset (overview). */
  initialTab?: TabId;
};

export function PlaceDossier({
  place,
  release,
  onClose,
  initialTab = "overview",
}: Props) {
  const { t } = useI18n();
  const areaLabel = responsibilityLabel(
    place.municipalityCode,
    place.municipalityName,
  );
  const typeLabel = displayTypeLabel(place, t);
  const provenance = placeProvenance(place);

  const tabs = useMemo(
    () => [
      { value: "overview" as const, label: t.overview },
      { value: "sources" as const, label: t.sources },
    ],
    [t],
  );

  const [tab, setTab] = useState<TabId>(initialTab);
  const activeTab = tabs.some((entry) => entry.value === tab)
    ? tab
    : tabs[0]!.value;

  const identityBadge =
    place.identityStatus === "canonical"
      ? t.identityCanonical
      : place.identityStatus === "candidate"
        ? t.identityCandidate
        : t.identityUpstream;

  return (
    <article className="place-dossier" aria-live="polite">
      <header className="place-dossier-header">
        <div className="place-panel-meta">
          <Badge variant="secondary">{typeLabel}</Badge>
          {areaLabel ? <Badge variant="outline">{areaLabel}</Badge> : null}
          <Badge variant="outline">{identityBadge}</Badge>
        </div>
        <div className="place-dossier-title-row">
          <Text as="h2" variant="heading2">
            {place.officialName}
          </Text>
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

      <Tabs
        variant="segmented"
        size="sm"
        value={activeTab}
        onValueChange={(value) => {
          if (value === "overview" || value === "sources") {
            setTab(value);
          }
        }}
        tabs={tabs}
      />

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
      ) : null}

      {activeTab === "sources" ? (
        <div className="dossier-sources">
          <OfflineStatus release={release} />
          <dl className="names">
            <div>
              <dt>{t.provenanceSource}</dt>
              <dd>{provenance.registerName}</dd>
            </div>
            <div>
              <dt>{t.provenanceGeometry}</dt>
              <dd>{t.provenanceMidpoint}</dd>
            </div>
            <div>
              <dt>{t.provenanceType}</dt>
              <dd>
                {provenance.registerTypeLabel} ({provenance.typeCode})
              </dd>
            </div>
            <div>
              <dt>{t.provenanceGlobalId}</dt>
              <dd>
                <code>{provenance.globalId}</code>
              </dd>
            </div>
            <div>
              <dt>{t.provenanceLayer}</dt>
              <dd>
                <code className="provenance-url">{provenance.layerUrl}</code>
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
            <div>
              <dt>{t.identityUpstream}</dt>
              <dd>{identityBadge}</dd>
            </div>
          </dl>
          <Text as="p" variant="secondary" size="xs">
            {t.pendingReviewNote}
          </Text>
        </div>
      ) : null}
    </article>
  );
}
