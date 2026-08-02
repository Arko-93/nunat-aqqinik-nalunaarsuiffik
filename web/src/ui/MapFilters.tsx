import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Select } from "@cloudflare/kumo/components/select";
import { Tabs } from "@cloudflare/kumo/components/tabs";
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

export function MapFilters({
  layers,
  onLensChange,
  onToggleGeography,
  onMunicipalityChange,
  onReset,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dirty = !isDefaultFilters(layers);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const municipalityItems = [
    { value: "all", label: t.municipalityAll },
    ...Object.entries(MUNICIPALITY_BY_CODE).map(([code, label]) => ({
      value: code,
      label,
    })),
    { value: "outside", label: t.municipalityOutside },
  ];

  const geographyChips = [
    ["waters", t.waters],
    ["islands", t.islands],
    ["landforms", t.landforms],
  ] as const;

  return (
    <div className={`map-filters${open ? " is-open" : ""}`} ref={rootRef}>
      <Button
        type="button"
        size="sm"
        variant={dirty || open ? "primary" : "outline"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? t.closeFilters : t.openFilters}
        {dirty && !open ? " ·" : ""}
      </Button>

      {open ? (
        <div
          id={panelId}
          className="map-filters-panel"
          role="dialog"
          aria-label={t.mapFilters}
        >
          <Text as="h3" variant="heading3">
            {t.mapContent}
          </Text>
          <Tabs
            variant="segmented"
            size="sm"
            value={layers.lens}
            onValueChange={(value) => {
              if (value === "inhabited" || value === "geography") {
                onLensChange(value);
              }
            }}
            tabs={[
              { value: "inhabited", label: t.inhabitedPlaces },
              { value: "geography", label: t.geography },
            ]}
          />

          {layers.lens === "geography" ? (
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
          ) : null}

          <Select
            label={t.municipality}
            hideLabel={false}
            value={toKey(layers.municipalityFilter)}
            onValueChange={(next) => {
              if (typeof next === "string") onMunicipalityChange(fromKey(next));
            }}
            items={municipalityItems}
          >
            {municipalityItems.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>

          {dirty ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReset}>
              {t.clearFilters}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
