export const fulfillmentModeValues = [
  "auto",
  "manual_10m",
  "manual_30m",
  "manual_60m",
  "manual_24h",
] as const;

export type FulfillmentMode = (typeof fulfillmentModeValues)[number];

export const fulfillmentModeMeta: Record<
  FulfillmentMode,
  { label: string; shortLabel: string; minutes: number | null }
> = {
  auto: { label: "自动发货", shortLabel: "自动发货", minutes: null },
  manual_10m: { label: "人工发货 · 10 分钟内", shortLabel: "10 分钟内", minutes: 10 },
  manual_30m: { label: "人工发货 · 30 分钟内", shortLabel: "30 分钟内", minutes: 30 },
  manual_60m: { label: "人工发货 · 60 分钟内", shortLabel: "60 分钟内", minutes: 60 },
  manual_24h: { label: "人工发货 · 24 小时内", shortLabel: "24 小时内", minutes: 24 * 60 },
};

export function isManualFulfillment(mode: FulfillmentMode | null | undefined): boolean {
  return Boolean(mode && mode !== "auto");
}

export function getFulfillmentDueAt(mode: FulfillmentMode | null | undefined, paidAt: Date): Date | null {
  const minutes = fulfillmentModeMeta[mode ?? "auto"].minutes;
  return minutes === null ? null : new Date(paidAt.getTime() + minutes * 60_000);
}

const localizedLabels: Record<string, Record<FulfillmentMode, string>> = {
  zh: { auto: "自动发货", manual_10m: "10 分钟内发货", manual_30m: "30 分钟内发货", manual_60m: "60 分钟内发货", manual_24h: "24 小时内发货" },
  en: { auto: "Instant delivery", manual_10m: "Within 10 min", manual_30m: "Within 30 min", manual_60m: "Within 60 min", manual_24h: "Within 24 hours" },
  ja: { auto: "即時納品", manual_10m: "10分以内", manual_30m: "30分以内", manual_60m: "60分以内", manual_24h: "24時間以内" },
  ko: { auto: "자동 배송", manual_10m: "10분 이내", manual_30m: "30분 이내", manual_60m: "60분 이내", manual_24h: "24시간 이내" },
  es: { auto: "Entrega inmediata", manual_10m: "En 10 min", manual_30m: "En 30 min", manual_60m: "En 60 min", manual_24h: "En 24 horas" },
  ru: { auto: "Автовыдача", manual_10m: "До 10 минут", manual_30m: "До 30 минут", manual_60m: "До 60 минут", manual_24h: "До 24 часов" },
  de: { auto: "Sofortlieferung", manual_10m: "Innerhalb 10 Min.", manual_30m: "Innerhalb 30 Min.", manual_60m: "Innerhalb 60 Min.", manual_24h: "Innerhalb 24 Std." },
  pt: { auto: "Entrega imediata", manual_10m: "Em até 10 min", manual_30m: "Em até 30 min", manual_60m: "Em até 60 min", manual_24h: "Em até 24 horas" },
  id: { auto: "Pengiriman instan", manual_10m: "Dalam 10 menit", manual_30m: "Dalam 30 menit", manual_60m: "Dalam 60 menit", manual_24h: "Dalam 24 jam" },
  hi: { auto: "तुरंत डिलीवरी", manual_10m: "10 मिनट में", manual_30m: "30 मिनट में", manual_60m: "60 मिनट में", manual_24h: "24 घंटे में" },
};

export function getLocalizedFulfillmentLabel(mode: FulfillmentMode, locale: string): string {
  return (localizedLabels[locale] ?? localizedLabels.en)[mode];
}
