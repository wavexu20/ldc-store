import { NextResponse } from "next/server";
import {
  createSteamAuthorizationUrl,
  sanitizeSteamCallbackUrl,
  STEAM_CALLBACK_COOKIE,
  STEAM_STATE_COOKIE,
} from "@/lib/auth/steam";

export async function GET(request: Request) {
  if (!process.env.STEAM_WEB_API_KEY) {
    return NextResponse.redirect(new URL("/login?error=SteamNotConfigured", request.url));
  }
  const requestUrl = new URL(request.url);
  const state = crypto.randomUUID();
  const callbackUrl = sanitizeSteamCallbackUrl(requestUrl.searchParams.get("callbackUrl"));
  const authorizationUrl = await createSteamAuthorizationUrl(requestUrl.origin, state);
  const response = NextResponse.redirect(authorizationUrl);
  for (const [name, value] of [
    [STEAM_STATE_COOKIE, state],
    [STEAM_CALLBACK_COOKIE, callbackUrl],
  ] as const) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  }
  return response;
}
