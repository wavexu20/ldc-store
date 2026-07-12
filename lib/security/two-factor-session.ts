import { cookies } from "next/headers";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

const GRANT_COOKIE = "g3d_2fa_grant";
const MAX_AGE_SECONDS = 12 * 60 * 60;
export const SECOND_FACTOR_REQUIRED_MESSAGE = "请先完成二次验证";

function base64Url(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function sign(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 未配置");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function equal(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sessionFingerprint() {
  const store = await cookies();
  const all = store.getAll();
  const exact = all.find((item) => item.name === "__Secure-authjs.session-token" || item.name === "authjs.session-token");
  const token = exact?.value || all
    .filter((item) => item.name.startsWith("__Secure-authjs.session-token.") || item.name.startsWith("authjs.session-token."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => item.value)
    .join("");
  if (!token) return null;
  return hash(token);
}

export async function grantSecondFactor(userId: string) {
  const fingerprint = await sessionFingerprint();
  if (!fingerprint) throw new Error("登录会话无效，请重新登录");
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ userId, fingerprint, expiresAt: Date.now() + MAX_AGE_SECONDS * 1000 })));
  const value = `${payload}.${await sign(payload)}`;
  const store = await cookies();
  store.set(GRANT_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE_SECONDS });
}

export async function clearSecondFactorGrant() {
  const store = await cookies();
  store.set(GRANT_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function hasSecondFactorGrant(userId: string) {
  const store = await cookies();
  const value = store.get(GRANT_COOKIE)?.value;
  const fingerprint = await sessionFingerprint();
  if (!value || !fingerprint) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !equal(fromBase64Url(signature), fromBase64Url(await sign(payload)))) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { userId?: string; fingerprint?: string; expiresAt?: number };
    return parsed.userId === userId && parsed.fingerprint === fingerprint && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function requiresSecondFactor(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { twoFactorEnabledAt: true } });
  return Boolean(user?.twoFactorEnabledAt);
}

/** True when this account has 2FA enabled but the current browser session has not passed it yet. */
export async function isSecondFactorVerificationRequired(userId: string) {
  return (await requiresSecondFactor(userId)) && !(await hasSecondFactorGrant(userId));
}

export async function requireSecondFactor(userId: string) {
  if (await isSecondFactorVerificationRequired(userId)) {
    throw new Error(SECOND_FACTOR_REQUIRED_MESSAGE);
  }
}
