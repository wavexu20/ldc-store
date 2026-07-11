import "server-only";
import { cookies, headers } from "next/headers";
import { detectLocale, LOCALE_COOKIE, locales, translate, type Locale, type MessageKey } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (locales.includes(saved as Locale)) return saved as Locale;
  return detectLocale((await headers()).get("accept-language"));
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: (key: MessageKey, params?: Record<string,string|number>) => translate(locale, key, params) };
}
