import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
};

/** Search filters the place list — no floating autocomplete overlay. */
export function GlobalPlaceSearch({ query, onQueryChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="search-field">
      <label className="search-label" htmlFor="place-search">
        {t.searchLabel}
      </label>
      <input
        id="place-search"
        className="search-input"
        type="search"
        value={query}
        autoComplete="off"
        spellCheck={false}
        placeholder={t.searchPlaceholder}
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </div>
  );
}
