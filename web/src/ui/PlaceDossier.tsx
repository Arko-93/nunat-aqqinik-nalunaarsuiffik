import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import { useMemo, useState } from "react";
import { hasOperationalIdentity } from "../domain/identity.ts";
import {
  responsibilityLabel,
  type Placename,
} from "../domain/placename.ts";
import type { ReachabilityLink } from "../domain/reachability.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { OfflineStatus } from "./OfflineStatus.tsx";

type TabId = "overview" | "access" | "sources";

type Props = {
  place: Placename;
  release: LoadedRelease | null;
  reachLinks: ReadonlyArray<ReachabilityLink>;
  onSelectPlaceId: (placeId: string) => void;
  onClose?: () => void;
};

export function PlaceDossier({
  place,
  release,
  reachLinks,
  onSelectPlaceId,
  onClose,
}: Props) {
  const { t } = useI18n();
  const canShowOperations = hasOperationalIdentity(place);
  const areaLabel = responsibilityLabel(
    place.municipalityCode,
    place.municipalityName,
  );

  const tabs = useMemo(() => {
    const items: Array<{ value: TabId; label: string }> = [
      { value: "overview", label: t.overview },
    ];
    if (canShowOperations || place.isLocality) {
      items.push({ value: "access", label: t.access });
    }
    items.push({ value: "sources", label: t.sources });
    return items;
  }, [canShowOperations, place.isLocality, t]);

  const [tab, setTab] = useState<TabId>("overview");
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
          <Badge variant="secondary">{place.typeLabel}</Badge>
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
      </header>

      <Tabs
        variant="segmented"
        size="sm"
        value={activeTab}
        onValueChange={(value) => {
          if (value === "overview" || value === "access" || value === "sources") {
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

      {activeTab === "access" ? (
        !canShowOperations ? (
          <p className="hint">
            <Text as="span" variant="secondary" size="sm">
              {t.noCanonicalIdentity}
            </Text>
          </p>
        ) : reachLinks.length > 0 ? (
          <div className="reach">
            <Text as="h3" variant="heading3">
              {t.reachableFromHere}
            </Text>
            <ul>
              {reachLinks.map((link) => {
                const serviceSummary =
                  link.edge.services.length > 0
                    ? link.edge.services
                        .map((service) => {
                          const parts = [
                            service.operator,
                            service.capabilities.join("+") || null,
                            service.frequencyBand,
                          ].filter(Boolean);
                          return parts.join(" · ");
                        })
                        .join(" | ")
                    : [link.edge.operator, link.seasonLabel]
                        .filter(Boolean)
                        .join(" · ");
                return (
                  <li key={link.edge.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="reach-link"
                      onClick={() => onSelectPlaceId(link.otherPlaceId)}
                    >
                      <span className="reach-name">{link.otherName}</span>
                      <Text as="span" variant="secondary" size="xs">
                        {t.structuralConnection}
                        {" · "}
                        {link.edge.mode}
                        {serviceSummary ? ` · ${serviceSummary}` : ""}
                        {` · ${link.seasonLabel}`}
                      </Text>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="hint">
            <Text as="span" variant="secondary" size="sm">
              {t.noConnections}
            </Text>
          </p>
        )
      ) : null}

      {activeTab === "sources" ? (
        <div className="dossier-sources">
          <OfflineStatus release={release} />
          <dl className="names">
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
