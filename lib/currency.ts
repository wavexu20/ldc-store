export const currencies = ["CNY", "USD", "EUR", "JPY", "KRW", "GBP", "INR", "IDR", "BRL"] as const;
export type Currency = (typeof currencies)[number];

export const CURRENCY_COOKIE = "game3dtech_currency";
export const DEFAULT_USD_CNY_RATE = 7.2;
export const defaultCnyRates: Record<Currency, number> = {
  CNY: 1,
  USD: DEFAULT_USD_CNY_RATE,
  EUR: 7.8,
  GBP: 9.2,
  JPY: 0.048,
  KRW: 0.0052,
  INR: 0.0712,
  IDR: 0.000377,
  BRL: 1.305,
};

export const currencySymbols: Record<Currency, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  KRW: "₩",
  INR: "₹",
  IDR: "Rp",
  BRL: "R$",
};

export function isCurrency(value: unknown): value is Currency {
  return currencies.includes(value as Currency);
}

export function normalizeUsdCnyRate(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20
    ? parsed
    : DEFAULT_USD_CNY_RATE;
}

export function cnyToDisplayAmount(amountCny: number, currency: Currency, usdCnyRate: number): number {
  if (currency === "CNY") return amountCny;
  const cnyRate = currency === "USD"
    ? normalizeUsdCnyRate(usdCnyRate)
    : defaultCnyRates[currency];
  return amountCny / cnyRate;
}

export function formatCnyAmount(
  amountCny: number,
  currency: Currency,
  usdCnyRate: number,
  locale = "zh-CN",
): string {
  const amount = cnyToDisplayAmount(amountCny, currency, usdCnyRate);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amount);
}

export function formatCnySettlement(amountCny: number): string {
  return `¥${amountCny.toFixed(2)} CNY`;
}
