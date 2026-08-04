import type { CorridorPlace } from "../domain/place.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  place: CorridorPlace;
  onClose: () => void;
};

export function PlaceDetail({ place, onClose }: Props) {
  const { t } = useI18n();

  return (
    <section className="panel place-detail" aria-live="polite">
      <div className="place-detail-header">
        <h2>{place.officialName}</h2>
        <button className="secondary" type="button" onClick={onClose}>
          {t("closePlace")}
        </button>
      </div>
      <p className="meta">
        {place.typeLabel || place.featureKind}
        {place.isLocality ? ` · ${t("inhabitedPlace")}` : ` · ${t("geographicFeature")}`}
      </p>
      {place.danishName ? (
        <p>
          {t("danishName")}: {place.danishName}
        </p>
      ) : null}
      {place.oldOfficialName ? (
        <p className="meta">
          {t("historicalName")}: {place.oldOfficialName}
        </p>
      ) : null}
      {place.municipalityName ? (
        <p className="meta">
          {t("municipality")}: {place.municipalityName}
        </p>
      ) : null}
      <p className="meta">
        {t("coordinates")}: {place.latitude.toFixed(5)},{" "}
        {place.longitude.toFixed(5)}
      </p>
      <p className="meta">ID: {place.globalId}</p>
    </section>
  );
}
