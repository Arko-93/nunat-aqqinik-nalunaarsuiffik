import { LOCALES } from "../i18n/messages.ts";
import { useI18n } from "../i18n/I18nContext.tsx";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-switcher" role="group" aria-label={t.language}>
      {LOCALES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`lang-btn${locale === entry.id ? " is-active" : ""}`}
          aria-pressed={locale === entry.id}
          aria-label={entry.label}
          onClick={() => setLocale(entry.id)}
        >
          {entry.id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
