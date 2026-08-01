import { useEffect, useMemo, useState } from "react";
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

type Collection = GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

const EMPTY_LINES: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: "FeatureCollection",
  features: [],
};

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
        <p className="preview-badge">Test branch · not main</p>
        <h1>Nunat Aqqinik Nalunaarsuiffik</h1>
        <p>Place identity lenses for Greenland decisions</p>
      </header>

      <div className="controls">
        <div className="scope surface" role="group" aria-label="Content lens">
          <button
            type="button"
            className={layers.lens === "inhabited" ? "active" : undefined}
            aria-pressed={layers.lens === "inhabited"}
            onClick={() => setLens("inhabited")}
          >
            Inhabited
          </button>
          <button
            type="button"
            className={layers.lens === "geography" ? "active" : undefined}
            aria-pressed={layers.lens === "geography"}
            onClick={() => setLens("geography")}
          >
            + Geography
          </button>
        </div>

        {layers.lens === "geography" ? (
          <div className="chips" role="group" aria-label="Geography groups">
            {(
              [
                ["waters", "Waters"],
                ["islands", "Islands"],
                ["landforms", "Landforms"],
              ] as const
            ).map(([group, label]) => (
              <button
                key={group}
                type="button"
                className={layers.geography.has(group) ? "active" : undefined}
                aria-pressed={layers.geography.has(group)}
                onClick={() => toggleGeography(group)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <MunicipalityMenu
          value={layers.municipalityFilter}
          onChange={setMunicipalityFilter}
        />

        <div className="search surface">
          <label htmlFor="place-search">Search</label>
          <input
            id="place-search"
            type="search"
            placeholder="Nuuk, Qaqortoq, Naajaat…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {results.length > 0 ? (
            <ul className="results">
              {results.map((hit, index) => (
                <li
                  key={hit.place.globalId}
                  style={{ ["--stagger" as string]: String(index) }}
                >
                  <button
                    type="button"
                    aria-selected={selected?.recordId === hit.place.recordId}
                    onClick={() => selectPlace(hit.place)}
                  >
                    {hit.place.officialName}
                    <span className="meta">
                      {hit.place.typeLabel}
                      {hit.place.danishName &&
                      hit.place.danishName !== hit.place.officialName
                        ? ` · ${hit.place.danishName}`
                        : ""}
                      {responsibilityLabel(
                        hit.place.municipalityCode,
                        hit.place.municipalityName,
                      )
                        ? ` · ${responsibilityLabel(
                            hit.place.municipalityCode,
                            hit.place.municipalityName,
                          )}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {selected ? (
          <aside className="panel surface" aria-live="polite">
            <h2>{selected.officialName}</h2>

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

            <p className="summary">
              {selected.typeLabel}
              {areaLabel ? ` · ${areaLabel}` : ""}
            </p>

            {reachLinks.length > 0 ? (
              <div className="reach">
                <h3>Reachable from here</h3>
                <ul>
                  {reachLinks.map((link, index) => (
                    <li
                      key={link.edge.id}
                      style={{ ["--stagger" as string]: String(index) }}
                    >
                      <button
                        type="button"
                        onClick={() => selectByOfficialName(link.otherName)}
                      >
                        <span className="reach-name">{link.otherName}</span>
                        <span className="meta">
                          {link.edge.mode}
                          {link.edge.operator ? ` · ${link.edge.operator}` : ""}
                          {` · ${link.seasonLabel}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : selected.isLocality ? (
              <p className="hint">
                No structural connections in the seed graph yet for this
                locality.
              </p>
            ) : null}
          </aside>
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
