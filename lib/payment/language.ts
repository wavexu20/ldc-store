export type GatewayLanguage = "zh" | "en" | "ko";

export function getPaymentIntroductionUrl(locale: string): string {
  const language = locale === "zh" ? "zh" : "en";
  return `https://pay.game3dtech.com/?lang=${language}`;
}

export function getGatewayLanguage(cookieHeader?: string | null, acceptLanguage?: string | null): GatewayLanguage {
  const saved = cookieHeader?.match(/(?:^|;\s*)game3dtech_locale=([^;]+)/)?.[1]?.toLowerCase();
  const requested = saved || acceptLanguage?.toLowerCase() || "en";
  if (requested.startsWith("zh")) return "zh";
  if (requested.startsWith("ko")) return "ko";
  return "en";
}
