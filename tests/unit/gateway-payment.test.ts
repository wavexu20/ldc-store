import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGatewayPayment,
  verifyGatewayWebhook,
} from "@/lib/payment/gateway";

describe("Game3DTech payment gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PAYMENT_GATEWAY_API_KEY;
    delete process.env.PAYMENT_GATEWAY_APP_ID;
    delete process.env.PAYMENT_GATEWAY_URL;
  });

  it("creates a trusted hosted checkout URL without exposing the API key", async () => {
    process.env.PAYMENT_GATEWAY_API_KEY = "gk_test_secret";
    process.env.PAYMENT_GATEWAY_APP_ID = "game3dtech";
    const checkoutUrl = "https://pay.game3dtech.com/checkout?app_id=game3dtech&sign=abc";
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({
      checkout_url: checkoutUrl,
      app_id: "game3dtech",
      client_order_id: "ORDER-1",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGatewayPayment({
      orderId: "ORDER-1",
      amount: 12.34,
      productName: "测试商品",
      siteUrl: "https://game3dtech.com",
      successPath: "/order/result?out_trade_no=ORDER-1",
      cancelPath: "/order/result?out_trade_no=ORDER-1&cancelled=1",
    });

    expect(result).toEqual({ redirectUrl: checkoutUrl });
    const [requestUrl, options] = fetchMock.mock.calls[0];
    const parsed = new URL(String(requestUrl));
    expect(parsed.searchParams.get("amount")).toBe("12.34");
    expect(parsed.searchParams.get("client_order_id")).toBe("ORDER-1");
    expect((options?.headers as Record<string, string>)["X-API-Key"]).toBe("gk_test_secret");
    expect(String(requestUrl)).not.toContain("gk_test_secret");
  });

  it("verifies the gateway HMAC and rejects stale deliveries", () => {
    process.env.PAYMENT_GATEWAY_API_KEY = "gk_test_secret";
    const rawBody = JSON.stringify({ event: "payment.paid", payment_id: "pay_1" });
    const timestamp = "1783759000";
    const keyHash = crypto.createHash("sha256").update("gk_test_secret").digest("hex");
    const signature = crypto
      .createHmac("sha256", keyHash)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    expect(verifyGatewayWebhook({ rawBody, timestamp, signature, nowSeconds: 1783759050 })).toBe(true);
    expect(verifyGatewayWebhook({ rawBody, timestamp, signature, nowSeconds: 1783759401 })).toBe(false);
    expect(verifyGatewayWebhook({ rawBody: `${rawBody} `, timestamp, signature, nowSeconds: 1783759050 })).toBe(false);
  });
});
