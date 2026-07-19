export type GatewayLanguage = "zh" | "en" | "ko";

export function getGatewayLanguage(cookieHeader?: string | null, acceptLanguage?: string | null): GatewayLanguage {
  const saved = cookieHeader?.match(/(?:^|;\s*)game3dtech_locale=([^;]+)/)?.[1]?.toLowerCase();
  const requested = saved || acceptLanguage?.toLowerCase() || "en";
  if (requested.startsWith("zh")) return "zh";
  if (requested.startsWith("ko")) return "ko";
  return "en";
}
