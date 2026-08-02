import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import { responsibilityLabel, type Placename } from "../domain/placename.ts";

type Props = {
  place: Placename;
  selected?: boolean;
  /** When false, render a non-interactive block. */
  interactive?: boolean;
  onSelect?: (place: Placename) => void;
};

export function placeKindLabel(
  place: Placename,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return place.isLocality ? t.inhabitedPlace : t.geographicFeature;
}

export function PlaceResultCard({
  place,
  selected = false,
  interactive = true,
  onSelect,
}: Props) {
  const { t } = useI18n();
  const area = responsibilityLabel(
    place.municipalityCode,
    place.municipalityName,
  );
  const showDanish =
    Boolean(place.danishName) && place.danishName !== place.officialName;

  const body = (
    <>
      <span className="place-result-name">
        <Text as="span" variant="body">
          {place.officialName}
        </Text>
      </span>
      <span className="place-result-why">
        <Text as="span" variant="secondary" size="xs">
          {place.typeLabel}
          {area ? ` · ${area}` : ""}
          {showDanish ? ` · ${place.danishName}` : ""}
          {!place.isLocality ? ` · ${placeKindLabel(place, t)}` : ""}
        </Text>
      </span>
    </>
  );

  if (!interactive) {
    return (
      <div
        className={`place-result-card${selected ? " is-selected" : ""}`}
        aria-current={selected ? "true" : undefined}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`place-result-card${selected ? " is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect?.(place)}
    >
      {body}
    </button>
  );
}
