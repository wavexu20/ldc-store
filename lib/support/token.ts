export type SupportTokenPayload = {
  conversationId: string;
  role: "visitor" | "admin";
  actorId: string;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSupportToken(
  payload: Omit<SupportTokenPayload, "exp">,
  secret: string,
  ttlSeconds = 3600
): Promise<string> {
  const data = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }))
  );
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(data));
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySupportToken(token: string, secret: string): Promise<SupportTokenPayload | null> {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      base64UrlToBytes(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(data))) as SupportTokenPayload;
    if (!payload.actorId || !payload.conversationId || !["visitor", "admin"].includes(payload.role)) return null;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
