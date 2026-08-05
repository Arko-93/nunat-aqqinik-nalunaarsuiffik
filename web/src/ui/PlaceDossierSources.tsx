import { Text } from "@cloudflare/kumo/components/text";
import type { Placename } from "../domain/placename.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { OfflineStatus } from "./OfflineStatus.tsx";
import { placeProvenance } from "./map-selection.ts";

type Props = {
  place: Placename;
  release: LoadedRelease | null;
  identityBadge: string;
};

/** Production Sources panel — exact NunaGIS midpoint provenance. */
export function PlaceDossierSources({
  place,
  release,
  identityBadge,
}: Props) {
  const { t } = useI18n();
  const provenance = placeProvenance(place);

  return (
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
  );
}
