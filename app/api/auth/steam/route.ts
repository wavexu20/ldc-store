import { NextResponse } from "next/server";
import { createSteamAuthorizationUrl, sanitizeSteamCallbackUrl, STEAM_STATE_COOKIE } from "@/lib/auth/steam";

export async function GET(request: Request) {
  if (!process.env.STEAM_WEB_API_KEY) {
    return NextResponse.redirect(new URL("/login?error=SteamNotConfigured", request.url));
  }
  const requestUrl = new URL(request.url);
  const state = crypto.randomUUID();
  const callbackUrl = sanitizeSteamCallbackUrl(requestUrl.searchParams.get("callbackUrl"));
  const response = NextResponse.redirect(createSteamAuthorizationUrl(requestUrl.origin, state, callbackUrl));
  response.cookies.set(STEAM_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    // Cookies with the __Host- prefix must use Path=/ or browsers reject them.
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
