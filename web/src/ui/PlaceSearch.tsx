import { Autocomplete } from "@cloudflare/kumo/components/autocomplete";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Text } from "@cloudflare/kumo/components/text";
import { responsibilityLabel, type Placename } from "../domain/placename.ts";
import type { SearchHit } from "../domain/search.ts";

type Props = {
  query: string;
  results: ReadonlyArray<SearchHit>;
  selectedId: number | null;
  onQueryChange: (query: string) => void;
  onSelect: (place: Placename) => void;
};

export function PlaceSearch({
  query,
  results,
  selectedId,
  onQueryChange,
  onSelect,
}: Props) {
  const items = results.map((hit) => hit.place);

  return (
    <div className="chrome-field">
      <Autocomplete
        items={items}
        value={query}
        onValueChange={(value) => onQueryChange(String(value ?? ""))}
        itemToStringValue={(place: Placename) => place.officialName}
        mode="none"
        label="Search"
      >
        <Autocomplete.InputGroup placeholder="Nuuk, Qaqortoq, Naajaat…" />
        <Autocomplete.Content>
          <Autocomplete.Empty>No matching places</Autocomplete.Empty>
          <Autocomplete.List>
            {(place: Placename) => {
              const area = responsibilityLabel(
                place.municipalityCode,
                place.municipalityName,
              );
              const showDanish =
                Boolean(place.danishName) &&
                place.danishName !== place.officialName;
              const isSelected = selectedId === place.recordId;

              return (
                <Autocomplete.Item
                  key={place.globalId}
                  value={place}
                  data-selected={isSelected ? "" : undefined}
                  onClick={() => onSelect(place)}
                >
                  <div className="place-result">
                    <span className="place-result-name">
                      <Text as="span" variant="body">
                        {place.officialName}
                      </Text>
                    </span>
                    <div className="place-result-meta">
                      <Badge variant="secondary">{place.typeLabel}</Badge>
                      {showDanish ? (
                        <Badge variant="outline">{place.danishName}</Badge>
                      ) : null}
                      {area ? (
                        <Text as="span" variant="secondary" size="xs">
                          {area}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                </Autocomplete.Item>
              );
            }}
          </Autocomplete.List>
        </Autocomplete.Content>
      </Autocomplete>
    </div>
  );
}
