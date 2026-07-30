import { describe, expect, it } from "vitest";
import {
  createGuestOrderAccessToken,
  guestOrderStorageKey,
  hashGuestOrderAccessToken,
  verifyGuestOrderAccessToken,
} from "@/lib/order-access";

describe("guest order access", () => {
  it("creates an opaque token and verifies only the matching order", async () => {
    const token = createGuestOrderAccessToken();
    const hash = await hashGuestOrderAccessToken("ORDER-1", token);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyGuestOrderAccessToken({ orderNo: "ORDER-1", token, expectedHash: hash })).toBe(true);
    expect(await verifyGuestOrderAccessToken({ orderNo: "ORDER-2", token, expectedHash: hash })).toBe(false);
    const alteredToken = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
    expect(await verifyGuestOrderAccessToken({ orderNo: "ORDER-1", token: alteredToken, expectedHash: hash })).toBe(false);
  });

  it("uses a namespaced local storage key", () => {
    expect(guestOrderStorageKey(" order-1 ")).toBe("g3d_guest_order:ORDER-1");
  });
});
