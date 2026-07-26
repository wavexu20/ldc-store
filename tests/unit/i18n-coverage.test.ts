import { describe, expect, it } from "vitest";
import { enMessages, locales, zhMessages, type MessageKey } from "@/lib/i18n";
import { generatedTranslations } from "@/lib/i18n-generated";

const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
  .map((match) => match[1])
  .sort();

describe("customer UI translations", () => {
  const keys = Object.keys(enMessages) as MessageKey[];

  it("keeps the Chinese source dictionary complete", () => {
    expect(Object.keys(zhMessages).sort()).toEqual([...keys].sort());
  });

  for (const locale of locales.filter((value) => value !== "en" && value !== "zh")) {
    it(`keeps ${locale} complete and preserves interpolation placeholders`, () => {
      const dictionary = generatedTranslations[locale];
      expect(Object.keys(dictionary).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        expect(dictionary[key].trim(), `${locale}.${key}`).not.toBe("");
        expect(placeholders(dictionary[key]), `${locale}.${key}`).toEqual(placeholders(enMessages[key]));
      }
    });
  }
});
