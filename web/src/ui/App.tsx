import { useEffect, useMemo, useState } from "react";
import { gazetteerVisible } from "../domain/layers.ts";
import type { IdentityCrosswalk } from "../domain/identity.ts";
import { enrichCollection, type Placename } from "../domain/placename.ts";
import { isSearchQueryActive, searchPlacenames } from "../domain/search.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  loadSelectedRelease,
  type LoadedRelease,
} from "../services/release.ts";
import { AppShell } from "./AppShell.tsx";
import { DownloadArea } from "./DownloadArea.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import {
  MobilePlaceSheet,
  type SheetState,
} from "./MobilePlaceSheet.tsx";
import { GlobalPlaceSearch } from "./GlobalPlaceSearch.tsx";
import { MapLegend } from "./MapLegend.tsx";
import { PlaceDossier } from "./PlaceDossier.tsx";
import { PlaceList } from "./PlaceList.tsx";
import {
  findPlaceByShareableId,
  shareableIdFor,
  useShareableMapState,
} from "./shareable-state.ts";

type Collection = GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

export function App() {
  const { t } = useI18n();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [release, setRelease] = useState<LoadedRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>("half");
  const {
    query,
    selectedId,
    setQuery,
    setSelectedId,
    clearSelection,
    clearUnresolvedSelection,
  } = useShareableMapState();

  useEffect(() => {
    let cancelled = false;
    loadSelectedRelease()
      .then(async (selectedRelease) => {
        const base = selectedRelease.basePath;
        // load-clean-enough: placenames + optional crosswalk; reachability not on v1 terrain map
        const [places, crosswalk] = await Promise.all([
          fetch(`${base}/placenames.geojson`).then(async (response) => {
            if (!response.ok) {
              throw new Error(`Failed to load placenames (${response.status})`);
            }
            return response.json() as Promise<Collection>;
          }),
          fetch(`${base}/identity-crosswalk.json`)
            .then(async (response) => {
              if (!response.ok) return null;
              return response.json() as Promise<IdentityCrosswalk>;
            })
            .catch(() => null),
        ]);
        if (cancelled) return;
        setRelease(selectedRelease);
        setCollection(enrichCollection(places, crosswalk));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCollection = useMemo((): Collection | null => {
    if (!collection) return null;
    return {
      type: "FeatureCollection",
      features: collection.features.filter((feature) =>
        gazetteerVisible(feature.properties),
      ),
    };
  }, [collection]);

  const allPlaces = useMemo(
    () => collection?.features.map((feature) => feature.properties) ?? [],
    [collection],
  );

  const selected = useMemo(
    () => findPlaceByShareableId(allPlaces, selectedId),
    [allPlaces, selectedId],
  );

  // Stale/unknown `place` values fail safe: once places have loaded, an
  // unresolved id is cleared from the URL (history replace, no new entry)
  // instead of lingering with no way to dismiss it. A valid id that simply
  // has not loaded yet is untouched — the clear runs only after load.
  useEffect(() => {
    if (collection && selectedId != null && selected == null) {
      clearUnresolvedSelection();
    }
  }, [collection, selectedId, selected, clearUnresolvedSelection]);

  const results = useMemo(
    () => searchPlacenames(allPlaces, query, 24),
    [allPlaces, query],
  );

  const selectPlace = (place: Placename) => {
    // Clear `q` and write `place` in one URL update (single history entry).
    setSelectedId(shareableIdFor(place));
    setSheet("half");
  };

  const queryActive = isSearchQueryActive(query);
  const railExpanded = queryActive || selected != null;

  // Empty query dismisses the search sheet; selected place can remain.
  useEffect(() => {
    if (!queryActive && !selected) {
      setSheet("collapsed");
    } else if (queryActive) {
      setSheet("half");
    }
  }, [queryActive, selected]);

  const statusText =
    collection && release
      ? `${t.releaseLabel} ${release.releaseId}`
      : t.loading;

  return (
    <AppShell
      error={error}
      statusText={statusText}
      railExpanded={railExpanded}
      mapPanel={
        <MapCanvas
          collection={visibleCollection}
          selectedId={selected?.recordId ?? null}
          focusPlace={selected}
          onSelect={selectPlace}
        />
      }
      mapChrome={
        <div className="map-chrome">
          <div className="map-search-mobile">
            <GlobalPlaceSearch query={query} onQueryChange={setQuery} />
          </div>
          <p className="not-for-navigation" role="note">
            {t.notForNavigation}
          </p>
          <MapLegend />
          <DownloadArea />
        </div>
      }
      railPanel={
        <div className="shell-rail-stack">
          <div className="shell-rail-scroll">
            <PlaceList
              query={query}
              onQueryChange={setQuery}
              hits={results}
              selectedId={selected?.recordId ?? null}
              onSelect={selectPlace}
              queryActive={queryActive}
            />
            {selected && !queryActive ? (
              <div className="shell-rail-dossier">
                <PlaceDossier
                  place={selected}
                  release={release}
                  onClose={clearSelection}
                />
              </div>
            ) : null}
          </div>
        </div>
      }
      mobileSheet={
        <MobilePlaceSheet
          place={selected}
          release={release}
          searchHits={results}
          queryActive={queryActive}
          sheet={sheet}
          onSheetChange={setSheet}
          onSelect={selectPlace}
          onClose={() => {
            if (queryActive) {
              setQuery("");
            } else {
              clearSelection();
            }
            setSheet("collapsed");
          }}
        />
      }
    />
  );
}
