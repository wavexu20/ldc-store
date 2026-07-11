const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_ID_PREFIX = "https://steamcommunity.com/openid/id/";

export const STEAM_STATE_COOKIE = "__Host-steam-openid-state";

export interface SteamProfile {
  steamId: string;
  name: string;
  image: string | null;
}

interface SteamTicket extends SteamProfile {
  issuedAt: number;
  expiresAt: number;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function sanitizeSteamCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function createSteamAuthorizationUrl(origin: string, state: string, callbackUrl: string) {
  const returnTo = new URL("/api/auth/steam/callback", origin);
  returnTo.searchParams.set("state", state);
  returnTo.searchParams.set("callbackUrl", sanitizeSteamCallbackUrl(callbackUrl));

  const authorizationUrl = new URL(STEAM_OPENID_ENDPOINT);
  authorizationUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  authorizationUrl.searchParams.set("openid.mode", "checkid_setup");
  authorizationUrl.searchParams.set("openid.return_to", returnTo.toString());
  authorizationUrl.searchParams.set("openid.realm", `${new URL(origin).origin}/`);
  authorizationUrl.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
  authorizationUrl.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");
  return authorizationUrl;
}

export async function verifySteamOpenIdResponse(url: URL, expectedState: string) {
  const state = url.searchParams.get("state");
  const callbackUrl = sanitizeSteamCallbackUrl(url.searchParams.get("callbackUrl"));
  if (!state || state !== expectedState) throw new Error("Steam 登录状态无效或已过期");

  const expectedReturnTo = new URL("/api/auth/steam/callback", url.origin);
  expectedReturnTo.searchParams.set("state", state);
  expectedReturnTo.searchParams.set("callbackUrl", callbackUrl);

  const claimedId = url.searchParams.get("openid.claimed_id");
  const identity = url.searchParams.get("openid.identity");
  if (
    url.searchParams.get("openid.ns") !== "http://specs.openid.net/auth/2.0" ||
    url.searchParams.get("openid.mode") !== "id_res" ||
    url.searchParams.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT ||
    url.searchParams.get("openid.return_to") !== expectedReturnTo.toString() ||
    !claimedId?.startsWith(STEAM_ID_PREFIX) ||
    identity !== claimedId
  ) {
    throw new Error("Steam OpenID 响应格式无效");
  }

  const steamId = claimedId.slice(STEAM_ID_PREFIX.length);
  if (!/^\d{17}$/.test(steamId)) throw new Error("SteamID 格式无效");

  const verificationBody = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("openid.")) verificationBody.set(key, value);
  }
  verificationBody.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verificationBody,
  });
  if (!response.ok || !(await response.text()).split(/\r?\n/).includes("is_valid:true")) {
    throw new Error("Steam OpenID 签名验证失败");
  }

  return { steamId, callbackUrl };
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

export async function createSteamTicket(profile: SteamProfile, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SteamTicket = { ...profile, issuedAt: now, expiresAt: now + 60 };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySteamTicket(ticket: string, secret: string): Promise<SteamTicket | null> {
  const [encodedPayload, encodedSignature, extra] = ticket.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as SteamTicket;
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d{17}$/.test(payload.steamId) || payload.issuedAt > now + 10 || payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}
