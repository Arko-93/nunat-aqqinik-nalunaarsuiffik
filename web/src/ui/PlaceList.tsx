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
  selectedId: number | null;
  onSelect: (place: Placename) => void;
  queryActive: boolean;
};

/** Search field always; results only while the query is active. */
export function PlaceList({
  query,
  onQueryChange,
  hits,
  selectedId,
  onSelect,
  queryActive,
}: Props) {
  const { t } = useI18n();
  const items = queryActive ? hits.map((hit) => hit.place) : [];

  return (
    <section
      className={`place-list${queryActive ? " has-results" : " is-idle"}`}
      aria-label={t.placesList}
    >
      <div className="place-list-search">
        <GlobalPlaceSearch query={query} onQueryChange={onQueryChange} />
      </div>

      {queryActive ? (
        <>
          <header className="place-list-header">
            <Text as="h2" variant="heading3">
              {t.results}
            </Text>
            <span className="place-list-count">
              {items.length} {t.shownCount}
            </span>
          </header>
          {items.length === 0 ? (
            <p className="place-list-empty">
              <Text as="span" variant="secondary" size="sm">
                {t.searchEmpty}
              </Text>
            </p>
          ) : (
            <ul
              className="place-list-items"
              role="listbox"
              aria-label={t.results}
            >
              {items.map((place) => (
                <li
                  key={place.featureId}
                  role="option"
                  aria-selected={selectedId === place.recordId}
                >
                  <PlaceResultCard
                    place={place}
                    selected={selectedId === place.recordId}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
