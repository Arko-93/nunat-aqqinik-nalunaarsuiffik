import type { CorridorPlace } from "../domain/place.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  place: CorridorPlace;
  onClose: () => void;
  onSetPointA?: (place: CorridorPlace) => void;
  onSetPointB?: (place: CorridorPlace) => void;
  pointAId?: string | null;
  pointBId?: string | null;
};

export function PlaceDetail({
  place,
  onClose,
  onSetPointA,
  onSetPointB,
  pointAId,
  pointBId,
}: Props) {
  const { t } = useI18n();
  const isA = pointAId === place.globalId;
  const isB = pointBId === place.globalId;
  const canTravel = place.isLocality;

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
        {place.isLocality
          ? ` · ${t("inhabitedPlace")}`
          : ` · ${t("geographicFeature")}`}
      </p>
      {place.danishName ? (
        <p>
          {t("danishName")}: {place.danishName}
        </p>
      ) : null}
      {place.municipalityName ? (
        <p className="meta">
          {t("municipality")}: {place.municipalityName}
        </p>
      ) : null}

      {canTravel && onSetPointA && onSetPointB ? (
        <div className="btn-row place-ab-actions">
          <button
            className={isA ? "primary" : "secondary"}
            type="button"
            onClick={() => onSetPointA(place)}
          >
            {isA ? t("pointASet") : t("setPointA")}
          </button>
          <button
            className={isB ? "primary" : "secondary"}
            type="button"
            onClick={() => onSetPointB(place)}
          >
            {isB ? t("pointBSet") : t("setPointB")}
          </button>
        </div>
      ) : (
        <p className="meta">{t("pickTownForTravel")}</p>
      )}
    </section>
  );
}
