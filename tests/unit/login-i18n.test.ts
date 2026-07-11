import { describe, expect, it } from "vitest";
import { localizeAuthMessage, loginMessages } from "@/lib/i18n/login";

describe("login localization", () => {
  it("provides matching Chinese and English login labels", () => {
    expect(loginMessages.zh.signIn).toBe("登录");
    expect(loginMessages.en.signIn).toBe("Sign in");
    expect(loginMessages.zh.register).toBeTruthy();
    expect(loginMessages.en.register).toBeTruthy();
  });

  it("localizes server-side authentication messages", () => {
    expect(localizeAuthMessage("验证码无效或已过期", "en")).toBe(
      "The verification code is invalid or expired",
    );
    expect(localizeAuthMessage("验证码无效或已过期", "zh")).toBe("验证码无效或已过期");
  });

  it("does not expose untranslated server details in English", () => {
    expect(localizeAuthMessage("未知内部错误", "en")).toBe("Something went wrong. Please try again.");
  });
});
