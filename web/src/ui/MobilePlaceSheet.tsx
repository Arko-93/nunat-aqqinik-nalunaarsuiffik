import { Button } from "@cloudflare/kumo/components/button";
import { Text } from "@cloudflare/kumo/components/text";
import type { Placename } from "../domain/placename.ts";
import type { SearchHit } from "../domain/search.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import type { LoadedRelease } from "../services/release.ts";
import { PlaceDossier } from "./PlaceDossier.tsx";
import { PlaceResultCard } from "./PlaceResultCard.tsx";

export type SheetState = "collapsed" | "half" | "full";

type Props = {
  place: Placename | null;
  release: LoadedRelease | null;
  /** Search results when query is active; empty query dismisses this mode. */
  searchHits: ReadonlyArray<SearchHit>;
  queryActive: boolean;
  sheet: SheetState;
  onSheetChange: (sheet: SheetState) => void;
  onSelect: (place: Placename) => void;
  onClose: () => void;
};

export function MobilePlaceSheet({
  place,
  release,
  searchHits,
  queryActive,
  sheet,
  onSheetChange,
  onSelect,
  onClose,
}: Props) {
  const { t } = useI18n();

  if (!queryActive && !place) return null;

  const cycle = () => {
    if (sheet === "collapsed") onSheetChange("half");
    else if (sheet === "half") onSheetChange("full");
    else onSheetChange("half");
  };

  const title = queryActive
    ? t.results
    : (place?.officialName ?? t.placesList);

  return (
    <div
      className={`mobile-place-sheet is-${sheet}`}
      role="dialog"
      aria-label={title}
    >
      <div className="mobile-place-sheet-handle">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="sheet-handle-btn"
          aria-label={sheet === "full" ? t.collapseSheet : t.expandSheet}
          onClick={cycle}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <Text as="span" variant="secondary" size="xs">
            {title}
          </Text>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t.closePlace}
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      {sheet !== "collapsed" ? (
        <div className="mobile-place-sheet-body">
          {queryActive ? (
            searchHits.length === 0 ? (
              <p className="place-list-empty">
                <Text as="span" variant="secondary" size="sm">
                  {t.searchEmpty}
                </Text>
              </p>
            ) : (
              <ul className="place-list-items" role="listbox" aria-label={t.results}>
                {searchHits.map((hit) => (
                  <li key={hit.place.featureId} role="option">
                    <PlaceResultCard
                      place={hit.place}
                      matchedField={hit.matchedField}
                      selected={place?.recordId === hit.place.recordId}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : place ? (
            <PlaceDossier place={place} release={release} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
