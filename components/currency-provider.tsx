"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  CURRENCY_COOKIE,
  formatCnyAmount,
  normalizeUsdCnyRate,
  type Currency,
} from "@/lib/currency";
import { useI18n } from "@/components/i18n-provider";

type CurrencyContextValue = {
  currency: Currency;
  usdCnyRate: number;
  setCurrency(currency: Currency): void;
  formatCny(amountCny: number): string;
  formatCnyCents(amountCents: number): string;
};

const fallbackCurrency: CurrencyContextValue = {
  currency: "CNY",
  usdCnyRate: 7.2,
  setCurrency: () => undefined,
  formatCny: (amount) => formatCnyAmount(amount, "CNY", 7.2),
  formatCnyCents: (amount) => formatCnyAmount(amount / 100, "CNY", 7.2),
};

const CurrencyContext = createContext<CurrencyContextValue>(fallbackCurrency);

export function CurrencyProvider({
  initialCurrency,
  usdCnyRate,
  children,
}: {
  initialCurrency: Currency;
  usdCnyRate: number;
  children: React.ReactNode;
}) {
  const { locale } = useI18n();
  const [currency, setCurrencyState] = useState(initialCurrency);
  const rate = normalizeUsdCnyRate(usdCnyRate);
  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    document.cookie = `${CURRENCY_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  }, []);
  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    usdCnyRate: rate,
    setCurrency,
    formatCny: (amount) => formatCnyAmount(amount, currency, rate, locale),
    formatCnyCents: (amount) => formatCnyAmount(amount / 100, currency, rate, locale),
  }), [currency, locale, rate, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
