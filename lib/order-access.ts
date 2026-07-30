const GUEST_ORDER_TOKEN_LENGTH = 32;

export function createGuestOrderAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GUEST_ORDER_TOKEN_LENGTH));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashGuestOrderAccessToken(orderNo: string, token: string): Promise<string> {
  const normalizedOrderNo = orderNo.trim().toUpperCase();
  const normalizedToken = token.trim();
  const data = new TextEncoder().encode(`${normalizedOrderNo}:${normalizedToken}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyGuestOrderAccessToken(input: {
  orderNo: string;
  token?: string | null;
  expectedHash?: string | null;
}): Promise<boolean> {
  if (!input.token || !input.expectedHash || !/^[a-f0-9]{64}$/i.test(input.expectedHash)) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.token)) return false;
  return (await hashGuestOrderAccessToken(input.orderNo, input.token)) === input.expectedHash.toLowerCase();
}

export function guestOrderStorageKey(orderNo: string): string {
  return `g3d_guest_order:${orderNo.trim().toUpperCase()}`;
}
