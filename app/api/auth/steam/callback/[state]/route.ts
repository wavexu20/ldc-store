import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import {
  createSteamTicket,
  fetchSteamProfile,
  STEAM_CALLBACK_COOKIE,
  STEAM_STATE_COOKIE,
  verifySteamOpenIdResponse,
} from "@/lib/auth/steam";

export async function GET(request: Request, context: { params: Promise<{ state: string }> }) {
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STEAM_STATE_COOKIE)?.value;
  const callbackUrl = cookieStore.get(STEAM_CALLBACK_COOKIE)?.value || "/";
  for (const name of [STEAM_STATE_COOKIE, STEAM_CALLBACK_COOKIE]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  try {
    const { state } = await context.params;
    if (!cookieState || state !== cookieState || !process.env.STEAM_WEB_API_KEY || !process.env.AUTH_SECRET) {
      throw new Error("Steam 登录配置不完整或状态已过期");
    }
    const steamId = await verifySteamOpenIdResponse(new URL(request.url), state);
    const profile = await fetchSteamProfile(steamId, process.env.STEAM_WEB_API_KEY);
    const ticket = await createSteamTicket(profile, process.env.AUTH_SECRET);
    await signIn("steam", { ticket, redirect: false });
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  } catch (error) {
    console.error("Steam 登录失败", error);
    return NextResponse.redirect(new URL("/login?error=SteamSignin", request.url));
  }
}
