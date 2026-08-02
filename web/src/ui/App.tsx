import { useEffect, useMemo, useState } from "react";
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
    const selectedId = selected?.recordId ?? null;
    return {
      type: "FeatureCollection",
      features: collection.features.filter((feature) => {
        if (selectedId != null && feature.properties.recordId === selectedId) {
          return true;
        }
        return placeVisible(feature.properties, layers);
      }),
    };
  }, [collection, layers, selected?.recordId]);

  const allPlaces = useMemo(
    () => collection?.features.map((feature) => feature.properties) ?? [],
    [collection],
  );

  const results = useMemo(
    () => searchPlacenames(allPlaces, query, 24),
    [allPlaces, query],
  );

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
  const railExpanded = queryActive || selected != null;

  const geoOnMap =
    visibleCollection == null
      ? 0
      : visibleCollection.features.filter(
          (feature) => !feature.properties.isLocality,
        ).length;

  const statusText =
    collection && release
      ? layers.lens === "geography"
        ? `${t.geography} · ${geoOnMap.toLocaleString("en")} · ${release.releaseId}`
        : `${t.releaseLabel} ${release.releaseId}${
            layers.municipalityFilter != null ? ` · ${t.filtered}` : ""
          }`
      : t.loading;

  return (
    <AppShell
      error={error}
      statusText={statusText}
      mobileView={mobileView}
      onMobileViewChange={setMobileView}
      railExpanded={railExpanded}
      mapPanel={
        <MapCanvas
          collection={visibleCollection}
          reachabilityLines={reachLines}
          selectedId={selected?.recordId ?? null}
          lens={layers.lens}
          municipalityFilter={layers.municipalityFilter}
          onSelect={selectPlace}
        />
      }
      railPanel={
        <div className="shell-rail-stack">
          <MapFilters
            layers={layers}
            onLensChange={setLens}
            onToggleGeography={toggleGeography}
            onMunicipalityChange={setMunicipalityFilter}
            onReset={() => setLayers(defaultLayerState())}
          />
          <div className="shell-rail-scroll">
            <PlaceList
              query={query}
              onQueryChange={setQuery}
              hits={results}
              selectedId={selected?.recordId ?? null}
              onSelect={selectPlace}
              queryActive={queryActive}
            />
            {selected ? (
              <div className="shell-rail-dossier">
                <PlaceDossier
                  place={selected}
                  release={release}
                  reachLinks={reachLinks}
                  onSelectPlaceId={selectByPlaceId}
                  onClose={() => setSelected(null)}
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
