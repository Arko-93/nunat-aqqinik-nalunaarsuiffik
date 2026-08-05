import { COASTAL_MARKER_GLYPH } from "../domain/coastal-features.ts";
import { TYPE_LABELS_NEED_NATIVE_REVIEW } from "../i18n/messages.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

/** Passive legend — discovery aid, not a filter or lens control. */
export function MapLegend() {
  const { t, locale } = useI18n();

  return (
    <div className="map-legend" role="note" aria-label={t.legendLabel}>
      <p className="map-legend-line">
        <span>
          {COASTAL_MARKER_GLYPH.skerry} {t.typeLabelSkerry}
        </span>
        <span aria-hidden="true"> · </span>
        <span>
          {COASTAL_MARKER_GLYPH.island} {t.typeLabelIsland}
        </span>
        <span aria-hidden="true"> · </span>
        <span>
          {COASTAL_MARKER_GLYPH.island_part} {t.typeLabelIslandPart}
        </span>
        <span aria-hidden="true"> · </span>
        <span>
          {COASTAL_MARKER_GLYPH.island_group} {t.typeLabelIslandGroup}
        </span>
      </p>
      {TYPE_LABELS_NEED_NATIVE_REVIEW[locale] ? (
        <p className="map-legend-review">{t.pendingReviewNote}</p>
      ) : null}
    </div>
  );
}
