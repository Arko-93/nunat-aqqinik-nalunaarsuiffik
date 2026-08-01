import { useEffect, useMemo, useState } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Text } from "@cloudflare/kumo/components/text";
import {
  defaultLayerState,
  placeVisible,
  type GeographyGroup,
  type LayerState,
  type MunicipalityFilter,
} from "../domain/layers.ts";
import {
  enrichCollection,
  responsibilityLabel,
  type Placename,
} from "../domain/placename.ts";
import {
  linksFromOfficialName,
  reachabilityLineCollection,
  type ReachabilityGraph,
} from "../domain/reachability.ts";
import { searchPlacenames } from "../domain/search.ts";
import { MapCanvas } from "./MapCanvas.tsx";
import { MunicipalityMenu } from "./MunicipalityMenu.tsx";
import { PlaceSearch } from "./PlaceSearch.tsx";

type Collection = GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

const EMPTY_LINES: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [],
};

const LENS_TABS = [
  { value: "inhabited", label: "Inhabited" },
  { value: "geography", label: "+ Geography" },
] as const;

const GEOGRAPHY_CHIPS = [
  ["waters", "Waters"],
  ["islands", "Islands"],
  ["landforms", "Landforms"],
] as const;

export function App() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [graph, setGraph] = useState<ReachabilityGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Placename | null>(null);
  const [layers, setLayers] = useState<LayerState>(() => defaultLayerState());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/placenames.geojson").then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load placenames (${response.status})`);
        }
        return response.json() as Promise<Collection>;
      }),
      fetch("/data/reachability-graph.json").then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load reachability (${response.status})`);
        }
        return response.json() as Promise<ReachabilityGraph>;
      }),
    ])
      .then(([places, reachability]) => {
        if (cancelled) return;
        setCollection(enrichCollection(places));
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

  const places = useMemo(
    () =>
      visibleCollection?.features.map((feature) => feature.properties) ?? [],
    [visibleCollection],
  );

  const results = useMemo(
    () => searchPlacenames(places, query, 12),
    [places, query],
  );

  const reachLinks = useMemo(
    () =>
      selected ? linksFromOfficialName(graph, selected.officialName) : [],
    [graph, selected],
  );

  const reachLines = useMemo(
    () =>
      selected
        ? reachabilityLineCollection(graph, selected.officialName)
        : EMPTY_LINES,
    [graph, selected],
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
  };

  const selectByOfficialName = (name: string) => {
    const match =
      collection?.features.find(
        (feature) =>
          feature.properties.isLocality &&
          feature.properties.officialName.toLocaleLowerCase("kl") ===
            name.toLocaleLowerCase("kl"),
      )?.properties ?? null;
    if (match) selectPlace(match);
  };

  const areaLabel = selected
    ? responsibilityLabel(
        selected.municipalityCode,
        selected.municipalityName,
      )
    : null;

  return (
    <div className="app">
      <MapCanvas
        collection={visibleCollection}
        reachabilityLines={reachLines}
        selectedId={selected?.recordId ?? null}
        onSelect={selectPlace}
      />

      <header className="brand">
        <Badge variant="beta">Test branch · not main</Badge>
        <h1>Nunat Aqqinik Nalunaarsuiffik</h1>
        <p>Place identity lenses for Greenland decisions</p>
      </header>

      <div className="controls">
        <div className="chrome-field chrome-field-pad">
          <Tabs
            variant="segmented"
            size="sm"
            value={layers.lens}
            onValueChange={(value) => {
              if (value === "inhabited" || value === "geography") {
                setLens(value);
              }
            }}
            tabs={[...LENS_TABS]}
          />
        </div>

        {layers.lens === "geography" ? (
          <div className="chips" role="group" aria-label="Geography groups">
            {GEOGRAPHY_CHIPS.map(([group, label]) => {
              const active = layers.geography.has(group);
              return (
                <Button
                  key={group}
                  type="button"
                  size="sm"
                  variant={active ? "primary" : "outline"}
                  aria-pressed={active}
                  onClick={() => toggleGeography(group)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        ) : null}

        <MunicipalityMenu
          value={layers.municipalityFilter}
          onChange={setMunicipalityFilter}
        />

        <PlaceSearch
          query={query}
          results={results}
          selectedId={selected?.recordId ?? null}
          onQueryChange={setQuery}
          onSelect={selectPlace}
        />

        {selected ? (
          <LayerCard className="place-panel" aria-live="polite">
            <LayerCard.Secondary className="place-panel-meta">
              <Badge variant="secondary">{selected.typeLabel}</Badge>
              {areaLabel ? (
                <Badge variant="outline">{areaLabel}</Badge>
              ) : null}
            </LayerCard.Secondary>
            <LayerCard.Primary>
              <Text as="h2" variant="heading2">
                {selected.officialName}
              </Text>

              <dl className="names">
                <div>
                  <dt>Official</dt>
                  <dd>{selected.officialName}</dd>
                </div>
                {selected.danishName &&
                selected.danishName !== selected.officialName ? (
                  <div>
                    <dt>Danish</dt>
                    <dd>{selected.danishName}</dd>
                  </div>
                ) : null}
                {selected.oldOfficialName &&
                selected.oldOfficialName !== selected.officialName ? (
                  <div>
                    <dt>Historical</dt>
                    <dd>{selected.oldOfficialName}</dd>
                  </div>
                ) : null}
              </dl>

              {reachLinks.length > 0 ? (
                <div className="reach">
                  <Text as="h3" variant="heading3">
                    Reachable from here
                  </Text>
                  <ul>
                    {reachLinks.map((link) => (
                      <li key={link.edge.id}>
                        <Button
                          type="button"
                          variant="ghost"
                          className="reach-link"
                          onClick={() => selectByOfficialName(link.otherName)}
                        >
                          <span className="reach-name">{link.otherName}</span>
                          <Text as="span" variant="secondary" size="xs">
                            {link.edge.mode}
                            {link.edge.operator
                              ? ` · ${link.edge.operator}`
                              : ""}
                            {` · ${link.seasonLabel}`}
                          </Text>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : selected.isLocality ? (
                <p className="hint">
                  <Text as="span" variant="secondary" size="sm">
                    No structural connections in the seed graph yet for this
                    locality.
                  </Text>
                </p>
              ) : null}
            </LayerCard.Primary>
          </LayerCard>
        ) : null}
      </div>

      <div className={`status${error ? " error" : ""}`}>
        {error
          ? error
          : collection
            ? `${places.length} shown · ${layers.lens}${
                layers.municipalityFilter != null ? " · filtered" : ""
              }`
            : "Loading map lenses…"}
      </div>
    </div>
  );
}
