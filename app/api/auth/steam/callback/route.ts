import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import {
  createSteamTicket,
  fetchSteamProfile,
  STEAM_STATE_COOKIE,
  verifySteamOpenIdResponse,
} from "@/lib/auth/steam";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const state = cookieStore.get(STEAM_STATE_COOKIE)?.value;
  cookieStore.delete(STEAM_STATE_COOKIE);

  try {
    if (!state || !process.env.STEAM_WEB_API_KEY || !process.env.AUTH_SECRET) {
      throw new Error("Steam 登录配置不完整或状态已过期");
    }
    const { steamId, callbackUrl } = await verifySteamOpenIdResponse(new URL(request.url), state);
    const profile = await fetchSteamProfile(steamId, process.env.STEAM_WEB_API_KEY);
    const ticket = await createSteamTicket(profile, process.env.AUTH_SECRET);
    await signIn("steam", { ticket, redirect: false });
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  } catch (error) {
    console.error("Steam 登录失败", error);
    return NextResponse.redirect(new URL("/login?error=SteamSignin", request.url));
  }
}
