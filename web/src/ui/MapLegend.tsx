import {
  COASTAL_LEGEND_ORDER,
  COASTAL_REGISTRY,
} from "../domain/coastal-features.ts";
import { TYPE_LABELS_NEED_NATIVE_REVIEW } from "../i18n/messages.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

/** Passive legend — discovery aid, not a filter or lens control. */
export function MapLegend() {
  const { t, locale } = useI18n();

  return (
    <div className="map-legend" role="note" aria-label={t.legendLabel}>
      <p className="map-legend-line">
        {COASTAL_LEGEND_ORDER.map((kind, index) => {
          const meta = COASTAL_REGISTRY[kind];
          return (
            <span key={kind}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <span>
                {meta.glyph} {t[meta.typeLabelKey]}
              </span>
            </span>
          );
        })}
      </p>
      {TYPE_LABELS_NEED_NATIVE_REVIEW[locale] ? (
        <p className="map-legend-review">{t.pendingReviewNote}</p>
      ) : null}
    </div>
  );
}
