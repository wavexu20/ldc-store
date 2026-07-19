import "server-only";
import { cookies } from "next/headers";
import { CURRENCY_COOKIE, isCurrency, type Currency } from "@/lib/currency";

export async function getCurrency(): Promise<Currency> {
  const saved = (await cookies()).get(CURRENCY_COOKIE)?.value;
  return isCurrency(saved) ? saved : "CNY";
}
