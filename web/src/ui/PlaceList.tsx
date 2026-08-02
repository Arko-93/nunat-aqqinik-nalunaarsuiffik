import { Text } from "@cloudflare/kumo/components/text";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { Placename } from "../domain/placename.ts";
import type { SearchHit } from "../domain/search.ts";
import { GlobalPlaceSearch } from "./GlobalPlaceSearch.tsx";
import { PlaceResultCard } from "./PlaceResultCard.tsx";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  hits: ReadonlyArray<SearchHit>;
  fallbackPlaces: ReadonlyArray<Placename>;
  selectedId: number | null;
  onSelect: (place: Placename) => void;
  queryActive: boolean;
};

export function PlaceList({
  query,
  onQueryChange,
  hits,
  fallbackPlaces,
  selectedId,
  onSelect,
  queryActive,
}: Props) {
  const { t } = useI18n();
  const items = queryActive
    ? hits.map((hit) => hit.place)
    : fallbackPlaces.slice(0, 40);

  return (
    <section className="place-list" aria-label={t.placesList}>
      <div className="place-list-search">
        <GlobalPlaceSearch query={query} onQueryChange={onQueryChange} />
      </div>
      <header className="place-list-header">
        <Text as="h2" variant="heading3">
          {queryActive ? t.results : t.placesList}
        </Text>
        <span className="place-list-count">
          {items.length} {t.shownCount}
        </span>
      </header>
      {items.length === 0 ? (
        <p className="place-list-empty">
          <Text as="span" variant="secondary" size="sm">
            {queryActive ? t.searchEmpty : t.noResults}
          </Text>
        </p>
      ) : (
        <ul className="place-list-items" role="listbox" aria-label={t.results}>
          {items.map((place) => (
            <li key={place.featureId} role="option" aria-selected={selectedId === place.recordId}>
              <PlaceResultCard
                place={place}
                selected={selectedId === place.recordId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
