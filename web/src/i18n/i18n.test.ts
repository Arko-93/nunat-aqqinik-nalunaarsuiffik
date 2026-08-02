import { describe, expect, it } from "vitest";
import { LOCALES, MESSAGES, type Messages } from "./messages.ts";

describe("i18n messages", () => {
  it("lists Kalaallisut first", () => {
    expect(LOCALES.map((entry) => entry.id)).toEqual(["kl", "da", "en"]);
  });

  it("keeps the same keys in every locale", () => {
    const keys = Object.keys(MESSAGES.en).sort();
    for (const locale of ["kl", "da", "en"] as const) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(keys);
    }
  });

  it("provides non-empty strings for every key", () => {
    for (const locale of ["kl", "da", "en"] as const) {
      const messages: Messages = MESSAGES[locale];
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
