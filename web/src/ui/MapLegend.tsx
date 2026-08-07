import {
  COASTAL_LEGEND_ORDER,
  COASTAL_REGISTRY,
} from "../domain/coastal-features.ts";
import { TYPE_LABELS_NEED_NATIVE_REVIEW } from "../i18n/messages.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  LAND_BREAKS_M,
  landPeakBandColor,
} from "../map/meter-bands.ts"

/**
 * Passive legend — discovery aid, not a filter or lens control.
 * Peak-band swatches are built from LAND_BREAKS_M + landPeakBandColor
 * (meter-bands.ts), so the legend can never drift from the style breaks.
 */
export function MapLegend() {
  const { t, locale } = useI18n();

  const peakBands = LAND_BREAKS_M.map((low, index) => {
    const high = LAND_BREAKS_M[index + 1];
    return {
      label: high === undefined ? `${low}+ m` : `${low}–${high} m`,
      color: landPeakBandColor(low),
    };
  });

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
      <p className="map-legend-line map-legend-peaks">
        <span>{t.landPeakLegend}</span>
        {peakBands.map((band) => (
          <span key={band.label} className="map-legend-peak-band">
            <span
              aria-hidden="true"
              className="map-legend-swatch"
              style={{ backgroundColor: band.color }}
            />
            {band.label}
          </span>
        ))}
      </p>
      {TYPE_LABELS_NEED_NATIVE_REVIEW[locale] ? (
        <p className="map-legend-review">{t.pendingReviewNote}</p>
      ) : null}
    </div>
  );
}
