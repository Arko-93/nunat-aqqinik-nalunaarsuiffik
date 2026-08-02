import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import {
  defaultLayerState,
  type GeographyGroup,
  type LayerState,
  type MunicipalityFilter,
} from "../domain/layers.ts";
import { MUNICIPALITY_BY_CODE } from "../domain/placename.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  layers: LayerState;
  onLensChange: (lens: LayerState["lens"]) => void;
  onToggleGeography: (group: GeographyGroup) => void;
  onMunicipalityChange: (value: MunicipalityFilter) => void;
  onReset: () => void;
};

const toKey = (value: MunicipalityFilter): string =>
  value == null ? "all" : String(value);

const fromKey = (key: string): MunicipalityFilter => {
  if (key === "all") return null;
  if (key === "outside") return "outside";
  return Number(key);
};

const isDefaultFilters = (layers: LayerState): boolean => {
  const defaults = defaultLayerState();
  if (layers.lens !== defaults.lens) return false;
  if (layers.municipalityFilter != null) return false;
  if (layers.geography.size !== defaults.geography.size) return false;
  for (const group of defaults.geography) {
    if (!layers.geography.has(group)) return false;
  }
  return true;
};

/** Always-visible map content controls for the right rail. */
export function MapFilters({
  layers,
  onLensChange,
  onToggleGeography,
  onMunicipalityChange,
  onReset,
}: Props) {
  const { t } = useI18n();
  const dirty = !isDefaultFilters(layers);

  const municipalityItems = [
    { value: "all", label: t.municipalityAll },
    ...Object.entries(MUNICIPALITY_BY_CODE)
      .map(([code, label]) => ({
        value: code,
        label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "da")),
    { value: "outside", label: t.municipalityOutside },
  ];

  const geographyChips = [
    ["waters", t.waters],
    ["islands", t.islands],
    ["landforms", t.landforms],
  ] as const;

  return (
    <section className="map-filters-rail" aria-label={t.mapFilters}>
      <Text as="h3" variant="heading3">
        {t.mapContent}
      </Text>

      <div className="lens-toggle" role="group" aria-label={t.mapContent}>
        <button
          type="button"
          className={`lens-btn${layers.lens === "inhabited" ? " is-active" : ""}`}
          aria-pressed={layers.lens === "inhabited"}
          onClick={() => onLensChange("inhabited")}
        >
          {t.inhabitedPlaces}
        </button>
        <button
          type="button"
          className={`lens-btn${layers.lens === "geography" ? " is-active" : ""}`}
          aria-pressed={layers.lens === "geography"}
          onClick={() => onLensChange("geography")}
        >
          {t.geography}
        </button>
      </div>

      {layers.lens === "geography" ? (
        <>
          <p className="lens-hint">{t.geographyZoomHint}</p>
          <div className="chips" role="group" aria-label={t.geography}>
            {geographyChips.map(([group, label]) => {
              const active = layers.geography.has(group);
              return (
                <Button
                  key={group}
                  type="button"
                  size="sm"
                  variant={active ? "primary" : "outline"}
                  aria-pressed={active}
                  onClick={() => onToggleGeography(group)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </>
      ) : null}

      <label className="filter-field" htmlFor="municipality-filter">
        <span className="filter-field-label">{t.municipality}</span>
        <select
          id="municipality-filter"
          className="filter-select"
          value={toKey(layers.municipalityFilter)}
          aria-label={t.municipality}
          onChange={(event) => {
            onMunicipalityChange(fromKey(event.target.value));
          }}
        >
          {municipalityItems.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {dirty ? (
        <Button type="button" size="sm" variant="ghost" onClick={onReset}>
          {t.clearFilters}
        </Button>
      ) : null}
    </section>
  );
}
