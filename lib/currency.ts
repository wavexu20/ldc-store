export const currencies = ["CNY", "USD"] as const;
export type Currency = (typeof currencies)[number];

export const CURRENCY_COOKIE = "game3dtech_currency";
export const DEFAULT_USD_CNY_RATE = 7.2;

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
  return amountCny / normalizeUsdCnyRate(usdCnyRate);
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCnySettlement(amountCny: number): string {
  return `¥${amountCny.toFixed(2)} CNY`;
}
