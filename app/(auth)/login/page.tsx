import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { AccountLoginForm } from "@/components/account-login-form";
import { LOGIN_LOCALE_COOKIE, type LoginLocale } from "@/lib/i18n/login";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const headersList = await headers();
  const savedLocale = cookieStore.get(LOGIN_LOCALE_COOKIE)?.value;
  const initialLocale: LoginLocale = savedLocale === "zh" || savedLocale === "en"
    ? savedLocale
    : headersList.get("accept-language")?.toLowerCase().startsWith("zh") ? "zh" : "en";
  const providers: Array<"discord" | "google" | "github" | "huggingface" | "linux-do" | "steam"> = [];
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) providers.push("discord");
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  if (process.env.HUGGINGFACE_CLIENT_ID && process.env.HUGGINGFACE_CLIENT_SECRET) providers.push("huggingface");
  if (process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET) providers.push("linux-do");
  if (process.env.STEAM_WEB_API_KEY) providers.push("steam");
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-auto bg-muted/50 p-4">
      <Suspense fallback={<div className="h-[560px] w-full max-w-md animate-pulse rounded-xl bg-card" />}>
        <AccountLoginForm
          providers={providers}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
          siteName={process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech"}
          initialLocale={initialLocale}
        />
      </Suspense>
    </main>
  );
}
