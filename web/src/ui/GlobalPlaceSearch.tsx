import { useId } from "react";
import { useI18n } from "../i18n/I18nContext.tsx";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
};

/** Search filters the place list — results open in rail / bottom sheet. */
export function GlobalPlaceSearch({ query, onQueryChange }: Props) {
  const { t } = useI18n();
  const id = useId();

  return (
    <div className="search-field">
      <label className="search-label" htmlFor={id}>
        {t.searchLabel}
      </label>
      <input
        id={id}
        className="search-input"
        type="search"
        value={query}
        autoComplete="off"
        spellCheck={false}
        placeholder={t.searchPlaceholder}
        onChange={(event) => onQueryChange(event.target.value)}
        data-place-search=""
      />
    </div>
  );
}
