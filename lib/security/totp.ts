const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_MS = 30_000;
const TOTP_ALLOWED_DRIFT_STEPS = 1;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function generateTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(secret: string) {
  const normalized = secret.replace(/[\s-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("无效的验证器密钥");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export async function createTotp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / TOTP_PERIOD_MS);
  const counterBytes = new Uint8Array(8);
  let current = counter;
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = current & 255;
    current = Math.floor(current / 256);
  }
  const key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyTotp(secret: string, code: string, timestamp = Date.now()) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const currentCounter = Math.floor(timestamp / TOTP_PERIOD_MS);
  const candidates = await Promise.all(
    Array.from({ length: TOTP_ALLOWED_DRIFT_STEPS * 2 + 1 }, (_, index) => {
      const offset = index - TOTP_ALLOWED_DRIFT_STEPS;
      return createTotp(secret, (currentCounter + offset) * TOTP_PERIOD_MS);
    }),
  );
  return candidates.some((candidate) => constantTimeEqual(candidate, normalized));
}

async function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 未配置");
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`g3d:2fa:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptTotpSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(secret)));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, iv.length);
  return base64Url(packed);
}

export async function decryptTotpSecret(value: string) {
  const packed = fromBase64Url(value);
  if (packed.length <= 12) throw new Error("无效的二次验证密钥");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await encryptionKey(), packed.slice(12));
  return new TextDecoder().decode(decrypted);
}

export function buildOtpAuthUrl(secret: string, accountName: string, issuer = "Game3DTech") {
  const label = `${issuer}:${accountName}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const raw = Array.from(bytes, (byte) => (byte % 36).toString(36)).join("").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

export async function hashRecoveryCode(code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 未配置");
  const value = code.replace(/[\s-]/g, "").toUpperCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`g3d:recovery:${value}:${secret}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
