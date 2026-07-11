import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { withEnv } from "@/tests/utils";

afterEach(() => vi.unstubAllGlobals());

describe("Turnstile server validation", () => {
  it("accepts a valid registration token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: "register",
      hostname: "store.example.com",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
      await expect(verifyTurnstileToken({
        token: "valid-token",
        remoteIp: "203.0.113.1",
        expectedAction: "register",
      })).resolves.toEqual({ success: true });
    });
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("valid-token");
    expect(body.get("remoteip")).toBe("203.0.113.1");
  });

  it("rejects an action mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: "login",
    }), { status: 200 })));
    await withEnv({ TURNSTILE_SECRET_KEY: "secret" }, async () => {
      const result = await verifyTurnstileToken({ token: "token", expectedAction: "register" });
      expect(result.success).toBe(false);
    });
  });

  it("requires the server secret", async () => {
    await withEnv({ TURNSTILE_SECRET_KEY: undefined }, async () => {
      const result = await verifyTurnstileToken({ token: "token", expectedAction: "register" });
      expect(result).toEqual({ success: false, message: "Turnstile 服务端密钥未配置" });
    });
  });
});
