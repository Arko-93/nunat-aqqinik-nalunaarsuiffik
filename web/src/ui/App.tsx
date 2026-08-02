import { useEffect, useMemo, useState } from "react";
import { Text } from "@cloudflare/kumo/components/text";
import {
  defaultLayerState,
  placeVisible,
  type GeographyGroup,
  type LayerState,
  type MunicipalityFilter,
} from "../domain/layers.ts";
import {
  hasOperationalIdentity,
  type IdentityCrosswalk,
} from "../domain/identity.ts";
import { enrichCollection, type Placename } from "../domain/placename.ts";
import {
  linksFromPlaceId,
  reachabilityLineCollection,
  type ReachabilityGraph,
} from "../domain/reachability.ts";
import { searchPlacenames } from "../domain/search.ts";
import { useI18n } from "../i18n/I18nContext.tsx";
import {
  loadSelectedRelease,
  type LoadedRelease,
} from "../services/release.ts";
import { AppShell, type MobileView } from "./AppShell.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import { MapFilters } from "./MapFilters.tsx";
import {
  MobilePlaceSheet,
  type SheetState,
} from "./MobilePlaceSheet.tsx";
import { PlaceDossier } from "./PlaceDossier.tsx";
import { PlaceList } from "./PlaceList.tsx";

type Collection = GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

const EMPTY_LINES: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [],
};

export function App() {
  const { t } = useI18n();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [graph, setGraph] = useState<ReachabilityGraph | null>(null);
  const [release, setRelease] = useState<LoadedRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Placename | null>(null);
  const [layers, setLayers] = useState<LayerState>(() => defaultLayerState());
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [sheet, setSheet] = useState<SheetState>("half");

  useEffect(() => {
    let cancelled = false;
    loadSelectedRelease()
      .then(async (selectedRelease) => {
        const base = selectedRelease.basePath;
        const [places, reachability, crosswalk] = await Promise.all([
          fetch("/data/placenames.geojson").then(async (response) => {
            if (!response.ok) {
              throw new Error(`Failed to load placenames (${response.status})`);
            }
            return response.json() as Promise<Collection>;
          }),
          fetch(`${base}/reachability-graph.json`).then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `Failed to load reachability (${response.status})`,
              );
            }
            return response.json() as Promise<ReachabilityGraph>;
          }),
          fetch(`${base}/identity-crosswalk.json`).then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `Failed to load identity crosswalk (${response.status})`,
              );
            }
            return response.json() as Promise<IdentityCrosswalk>;
          }),
        ]);
        if (cancelled) return;
        setRelease(selectedRelease);
        setCollection(enrichCollection(places, crosswalk));
        setGraph(reachability);
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
        placeVisible(feature.properties, layers),
      ),
    };
  }, [collection, layers]);

  const allPlaces = useMemo(
    () => collection?.features.map((feature) => feature.properties) ?? [],
    [collection],
  );

  const visiblePlaces = useMemo(
    () =>
      visibleCollection?.features.map((feature) => feature.properties) ?? [],
    [visibleCollection],
  );

  const results = useMemo(
    () => searchPlacenames(allPlaces, query, 24),
    [allPlaces, query],
  );

  const listFallback = useMemo(() => {
    const localities = visiblePlaces.filter((place) => place.isLocality);
    return localities.length > 0 ? localities : visiblePlaces;
  }, [visiblePlaces]);

  const canShowOperations = selected
    ? hasOperationalIdentity(selected)
    : false;

  const reachLinks = useMemo(
    () =>
      selected && canShowOperations
        ? linksFromPlaceId(graph, selected.placeId)
        : [],
    [graph, selected, canShowOperations],
  );

  const reachLines = useMemo(
    () =>
      selected && canShowOperations
        ? reachabilityLineCollection(graph, selected.placeId)
        : EMPTY_LINES,
    [graph, selected, canShowOperations],
  );

  const setLens = (lens: LayerState["lens"]) => {
    setLayers((current) => ({ ...current, lens }));
  };

  const toggleGeography = (group: GeographyGroup) => {
    setLayers((current) => {
      const next = new Set(current.geography);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { ...current, geography: next };
    });
  };

  const setMunicipalityFilter = (municipalityFilter: MunicipalityFilter) => {
    setLayers((current) => ({ ...current, municipalityFilter }));
  };

  const selectPlace = (place: Placename) => {
    setSelected(place);
    setQuery(place.officialName);
    setSheet("half");
    setMobileView("map");
  };

  const selectByPlaceId = (placeId: string) => {
    const match =
      collection?.features.find(
        (feature) =>
          feature.properties.placeId === placeId &&
          feature.properties.isLocality,
      )?.properties ??
      collection?.features.find(
        (feature) => feature.properties.placeId === placeId,
      )?.properties ??
      null;
    if (match) selectPlace(match);
  };

  const queryActive = query.trim().length >= 2;

  const statusText =
    collection && release
      ? `${visiblePlaces.length} ${t.shownCount}${
          layers.municipalityFilter != null || layers.lens !== "inhabited"
            ? ` · ${t.filtered}`
            : ""
        } · ${release.releaseId}`
      : t.loading;

  return (
    <AppShell
      error={error}
      statusText={statusText}
      mobileView={mobileView}
      onMobileViewChange={setMobileView}
      listPanel={
        <PlaceList
          query={query}
          onQueryChange={setQuery}
          hits={results}
          fallbackPlaces={listFallback}
          selectedId={selected?.recordId ?? null}
          onSelect={selectPlace}
          queryActive={queryActive}
        />
      }
      mapPanel={
        <MapCanvas
          collection={visibleCollection}
          reachabilityLines={reachLines}
          selectedId={selected?.recordId ?? null}
          onSelect={selectPlace}
        />
      }
      mapChrome={
        <MapFilters
          layers={layers}
          onLensChange={setLens}
          onToggleGeography={toggleGeography}
          onMunicipalityChange={setMunicipalityFilter}
          onReset={() => setLayers(defaultLayerState())}
        />
      }
      dossierPanel={
        selected ? (
          <PlaceDossier
            place={selected}
            release={release}
            reachLinks={reachLinks}
            onSelectPlaceId={selectByPlaceId}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="place-panel-empty">
            <Text as="p" variant="secondary" size="sm">
              {t.selectPlaceHint}
            </Text>
          </div>
        )
      }
      mobileSheet={
        <MobilePlaceSheet
          place={selected}
          release={release}
          reachLinks={reachLinks}
          sheet={sheet}
          onSheetChange={setSheet}
          onSelectPlaceId={selectByPlaceId}
          onClose={() => {
            setSelected(null);
            setSheet("collapsed");
          }}
        />
      }
    />
  );
}
