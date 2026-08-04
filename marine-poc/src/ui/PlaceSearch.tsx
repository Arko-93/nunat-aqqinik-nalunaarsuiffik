import { useEffect, useMemo, useState } from "react";
import type { CorridorPlace } from "../domain/place.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  label: string;
  places: ReadonlyArray<CorridorPlace>;
  selectedLabel: string | null;
  selectedType: string | null;
  onSelect: (place: CorridorPlace) => void;
  accent: "a" | "b";
};

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

export function PlaceSearch({
  label,
  places,
  selectedLabel,
  selectedType,
  onSelect,
  accent,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedLabel ?? "");
  }, [selectedLabel]);

  const results = useMemo(() => {
    const q = normalize(query);
    if (q.length < 1) return places.slice(0, 8);
    return places
      .filter((place) => {
        const hay = normalize(
          [
            place.officialName,
            place.danishName ?? "",
            place.oldOfficialName ?? "",
            place.municipalityName ?? "",
          ].join(" "),
        );
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [places, query]);

  return (
    <div className={`place-search accent-${accent}`}>
      <label className="place-search-label">
        <span>{label}</span>
        <input
          type="search"
          value={query}
          placeholder={selectedLabel ?? t("searchPlace")}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 160);
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {selectedLabel && selectedType ? (
        <p className="place-search-selected">
          <span>{selectedType}</span>
        </p>
      ) : null}
      {open ? (
        <ul className="place-search-results" role="listbox">
          {results.length === 0 ? (
            <li className="meta">{t("searchNoResults")}</li>
          ) : (
            results.map((place) => (
              <li key={place.globalId}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(place);
                    setQuery(place.officialName);
                    setOpen(false);
                  }}
                >
                  <strong>{place.officialName}</strong>
                  <span>
                    {place.typeLabel}
                    {place.danishName ? ` · ${place.danishName}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
