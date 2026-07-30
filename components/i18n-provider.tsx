"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { LOCALE_COOKIE, localeMeta, translate, type Locale, type MessageKey } from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, params?: Record<string, string | number>): string;
};

const fallbackI18n: I18nContextValue = {
  locale: "zh",
  setLocale: () => undefined,
  t: (key, params) => translate("zh", key, params),
};
const I18nContext = createContext<I18nContextValue>(fallbackI18n);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    document.documentElement.lang = localeMeta[next].htmlLang;
  }, []);
  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey, params?: Record<string,string|number>) => translate(locale, key, params) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
