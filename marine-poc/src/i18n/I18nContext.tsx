import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCALES, MESSAGES, type Locale, type MessageKey } from "./messages.ts";

const LOCALE_KEY = "nunat-marine-locale";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  locales: typeof LOCALES;
};

const I18nContext = createContext<I18nValue | null>(null);

const readStoredLocale = (): Locale => {
  if (typeof localStorage === "undefined") return "en";
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "kl" || stored === "da" || stored === "en") return stored;
  return "en";
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const setLocale = (next: Locale) => {
    localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
  };
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key,
      locales: LOCALES,
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n requires I18nProvider");
  return ctx;
}
