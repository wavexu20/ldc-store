import { describe, expect, it } from "vitest";
import {
  createSteamAuthorizationUrl,
  createSteamTicket,
  sanitizeSteamCallbackUrl,
  verifySteamTicket,
} from "@/lib/auth/steam";

describe("Steam authentication", () => {
  it("builds a Steam OpenID authorization URL for the production origin", () => {
    const url = createSteamAuthorizationUrl("https://game3dtech.com", "state-1", "/account/wallet");
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.realm")).toBe("https://game3dtech.com/");
    expect(url.searchParams.get("openid.return_to")).toBe(
      "https://game3dtech.com/api/auth/steam/callback?state=state-1&callbackUrl=%2Faccount%2Fwallet",
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
      image: "https://example.com/avatar.jpg",
    }, "test-secret");
    await expect(verifySteamTicket(ticket, "test-secret")).resolves.toMatchObject({
      steamId: "76561198000000000",
      name: "Player",
    });
    await expect(verifySteamTicket(ticket, "wrong-secret")).resolves.toBeNull();
  });
});
