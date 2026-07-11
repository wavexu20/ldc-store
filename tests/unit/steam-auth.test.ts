import { describe, expect, it } from "vitest";
import {
  createSteamTicket,
  getSteamReturnTo,
  sanitizeSteamCallbackUrl,
  verifySteamTicket,
} from "@/lib/auth/steam";

describe("Steam authentication", () => {
  it("uses a query-free one-time callback path", () => {
    expect(getSteamReturnTo("https://game3dtech.com", "state-1")).toBe(
      "https://game3dtech.com/api/auth/steam/callback/state-1",
    );
  });

  it("rejects external callback URLs", () => {
    expect(sanitizeSteamCallbackUrl("https://evil.example")).toBe("/");
    expect(sanitizeSteamCallbackUrl("//evil.example")).toBe("/");
    expect(sanitizeSteamCallbackUrl("/account/wallet")).toBe("/account/wallet");
  });

  it("signs and verifies short-lived Steam login tickets", async () => {
    const ticket = await createSteamTicket({
      steamId: "76561198000000000",
      name: "Player",
      image: null,
    }, "test-secret");
    await expect(verifySteamTicket(ticket, "test-secret")).resolves.toMatchObject({
      steamId: "76561198000000000",
      name: "Player",
    });
    await expect(verifySteamTicket(ticket, "wrong-secret")).resolves.toBeNull();
  });
});
