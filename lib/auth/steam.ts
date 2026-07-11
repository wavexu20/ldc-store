import * as openid from "openid";

const STEAM_PROVIDER = "https://steamcommunity.com/openid";
const STEAM_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export const STEAM_STATE_COOKIE = "__Host-steam-openid-state";
export const STEAM_CALLBACK_COOKIE = "__Host-steam-callback-url";

export interface SteamProfile {
  steamId: string;
  name: string;
  image: string | null;
}

interface SteamTicket extends SteamProfile {
  issuedAt: number;
  expiresAt: number;
}

function relyingParty(origin: string, state: string) {
  const realm = `${new URL(origin).origin}/`;
  const returnTo = new URL(`/api/auth/steam/callback/${encodeURIComponent(state)}`, origin).toString();
  return {
    client: new openid.RelyingParty(returnTo, realm, true, false, []),
    realm,
    returnTo,
  };
}

export function sanitizeSteamCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function getSteamReturnTo(origin: string, state: string) {
  return relyingParty(origin, state).returnTo;
}

export async function createSteamAuthorizationUrl(origin: string, state: string) {
  const { client } = relyingParty(origin, state);
  return new Promise<string>((resolve, reject) => {
    client.authenticate(STEAM_PROVIDER, false, (error, authorizationUrl) => {
      if (error || !authorizationUrl) {
        reject(new Error(error?.message || "Steam OpenID discovery failed"));
        return;
      }
      resolve(authorizationUrl);
    });
  });
}

export async function verifySteamOpenIdResponse(url: URL, state: string) {
  const { client } = relyingParty(url.origin, state);
  const claimedIdentifier = await new Promise<string>((resolve, reject) => {
    client.verifyAssertion(url.toString(), (error, result) => {
      if (error || !result?.authenticated || !result.claimedIdentifier) {
        reject(new Error(error?.message || "Steam OpenID assertion verification failed"));
        return;
      }
      resolve(result.claimedIdentifier);
    });
  });
  const match = claimedIdentifier.match(STEAM_ID_PATTERN);
  if (!match) throw new Error("Steam Claimed ID 格式无效");
  return match[1];
}

export async function fetchSteamProfile(steamId: string, apiKey: string): Promise<SteamProfile> {
  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", steamId);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("无法读取 Steam 用户资料");
  const payload = await response.json() as {
    response?: { players?: Array<{ steamid?: string; personaname?: string; avatarfull?: string }> };
  };
  const player = payload.response?.players?.find((item) => item.steamid === steamId);
  return {
    steamId,
    name: player?.personaname?.trim() || `Steam ${steamId.slice(-6)}`,
    image: player?.avatarfull || null,
  };
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSteamTicket(profile: SteamProfile, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SteamTicket = { ...profile, issuedAt: now, expiresAt: now + 60 };
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded));
  return `${encoded}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySteamTicket(ticket: string, secret: string): Promise<SteamTicket | null> {
  const [encoded, signature, extra] = ticket.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as SteamTicket;
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d{17}$/.test(payload.steamId) || payload.issuedAt > now + 10 || payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}
