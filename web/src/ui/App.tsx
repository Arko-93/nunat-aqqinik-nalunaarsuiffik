import { useEffect, useMemo, useState } from "react";
import {
  enrichCollection,
  type Placename,
  type PlacenameScope,
} from "../domain/placename.ts";
import { searchPlacenames } from "../domain/search.ts";
import { MapCanvas } from "./MapCanvas.tsx";

type Collection = GeoJSON.FeatureCollection<GeoJSON.Point, Placename>;

export function App() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Placename | null>(null);
  const [scope, setScope] = useState<PlacenameScope>("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/data/placenames.geojson")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load placenames (${response.status})`);
        }
        return response.json() as Promise<Collection>;
      })
      .then((data) => {
        if (!cancelled) {
          setCollection(enrichCollection(data));
          setError(null);
        }
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
    const features = collection.features.filter((feature) => {
      if (feature.properties.isLocalityShadow) return false;
      if (scope === "localities") return feature.properties.isLocality;
      return true;
    });
    return { type: "FeatureCollection", features };
  }, [collection, scope]);

  const places = useMemo(
    () =>
      visibleCollection?.features.map((feature) => feature.properties) ?? [],
    [visibleCollection],
  );

  const localityCount = useMemo(
    () =>
      collection?.features.filter((feature) => feature.properties.isLocality)
        .length ?? 0,
    [collection],
  );

  const results = useMemo(
    () => searchPlacenames(places, query, 12),
    [places, query],
  );

  return (
    <div className="app">
      <MapCanvas
        collection={visibleCollection}
        selectedId={selected?.recordId ?? null}
        onSelect={setSelected}
      />

      <header className="brand">
        <h1>Nunat Aqqinik Nalunaarsuiffik</h1>
        <p>Official Greenland place names — NunaGIS midpoints</p>
      </header>

      <div className="controls">
        <div className="scope" role="group" aria-label="Map scope">
          <button
            type="button"
            className={scope === "all" ? "active" : undefined}
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
          >
            All names
          </button>
          <button
            type="button"
            className={scope === "localities" ? "active" : undefined}
            aria-pressed={scope === "localities"}
            onClick={() => setScope("localities")}
          >
            Localities
          </button>
        </div>

        <div className="search">
          <label htmlFor="place-search">Search</label>
          <input
            id="place-search"
            type="search"
            placeholder="Nuuk, Qaqortoq, Sermitsiaq…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          {results.length > 0 ? (
            <ul className="results">
              {results.map((hit) => (
                <li key={hit.place.globalId}>
                  <button
                    type="button"
                    aria-selected={selected?.recordId === hit.place.recordId}
                    onClick={() => {
                      setSelected(hit.place);
                      setQuery(hit.place.officialName);
                    }}
                  >
                    {hit.place.officialName}
                    <span className="meta">
                      {hit.place.typeLabel}
                      {hit.place.danishName &&
                      hit.place.danishName !== hit.place.officialName
                        ? ` · ${hit.place.danishName}`
                        : ""}
                      {hit.place.municipalityName
                        ? ` · ${hit.place.municipalityName}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {selected ? (
          <aside className="panel" aria-live="polite">
            <h2>{selected.officialName}</h2>
            {selected.danishName &&
            selected.danishName !== selected.officialName ? (
              <p className="danish">{selected.danishName}</p>
            ) : null}
            <p className="summary">
              {selected.typeLabel}
              {selected.municipalityName
                ? ` · ${selected.municipalityName}`
                : ""}
            </p>
          </aside>
        ) : null}
      </div>

      <div className={`status${error ? " error" : ""}`}>
        {error
          ? error
          : collection
            ? scope === "localities"
              ? `${places.length} localities`
              : `${places.length} names · ${localityCount} localities`
            : "Loading placenames…"}
      </div>
    </div>
  );
}
