import { describe, expect, it } from "vitest";
import { detectLocale, locales, translate } from "@/lib/i18n";

describe("internationalization", () => {
  it("supports all configured storefront locales", () => {
    expect(locales).toEqual(["en", "ko", "zh", "ru", "de", "id", "hi"]);
  });

  it("detects supported browser languages", () => {
    expect(detectLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(detectLocale("ko-KR")).toBe("ko");
    expect(detectLocale("fr-FR")).toBe("en");
  });

  it("interpolates translated messages", () => {
    expect(translate("de", "sold", { count: 3 })).toBe("3 verkauft");
    expect(translate("zh", "onlyLeft", { count: 2 })).toBe("仅剩 2");
  });
});
