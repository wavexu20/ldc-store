import { Suspense } from "react";
import { AccountLoginForm } from "@/components/account-login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const providers: Array<"discord" | "google" | "github" | "linux-do" | "steam"> = [];
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) providers.push("discord");
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  if (process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET) providers.push("linux-do");
  if (process.env.STEAM_WEB_API_KEY) providers.push("steam");
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-auto bg-muted/50 p-4">
      <Suspense fallback={<div className="h-[560px] w-full max-w-md animate-pulse rounded-xl bg-card" />}>
        <AccountLoginForm
          providers={providers}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
        />
      </Suspense>
    </main>
  );
}
