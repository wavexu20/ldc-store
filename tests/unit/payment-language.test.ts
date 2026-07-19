import { describe, expect, it } from "vitest";
import { getGatewayLanguage, getPaymentIntroductionUrl } from "@/lib/payment/language";

describe("payment language", () => {
  it("prefers the explicit site-language cookie", () => {
    expect(getGatewayLanguage("foo=1; game3dtech_locale=zh", "en-US")).toBe("zh");
    expect(getGatewayLanguage("game3dtech_locale=ko", "zh-CN")).toBe("ko");
  });

  it("falls back to supported gateway languages", () => {
    expect(getGatewayLanguage(null, "zh-CN,zh;q=0.9")).toBe("zh");
    expect(getGatewayLanguage(null, "de-DE")).toBe("en");
  });

  it("links Chinese visitors to Chinese introduction and all other locales to English", () => {
    expect(getPaymentIntroductionUrl("zh")).toBe("https://pay.game3dtech.com/?lang=zh");
    expect(getPaymentIntroductionUrl("en")).toBe("https://pay.game3dtech.com/?lang=en");
    expect(getPaymentIntroductionUrl("ko")).toBe("https://pay.game3dtech.com/?lang=en");
  });
});
