import { describe, expect, it } from "vitest";
import { detectLocale, locales, translate } from "@/lib/i18n";

describe("internationalization", () => {
  it("supports all configured storefront locales", () => {
    expect(locales).toEqual(["en", "zh", "ja", "ko", "es", "de", "pt", "ru", "id", "hi"]);
  });

  it("detects supported browser languages", () => {
    expect(detectLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(detectLocale("ko-KR")).toBe("ko");
    expect(detectLocale("ja-JP")).toBe("ja");
    expect(detectLocale("es-MX")).toBe("es");
    expect(detectLocale("pt-BR")).toBe("pt");
    expect(detectLocale("fr-FR")).toBe("en");
  });

  it("interpolates translated messages", () => {
    expect(translate("de", "sold", { count: 3 })).toBe("3 verkauft");
    expect(translate("zh", "onlyLeft", { count: 2 })).toBe("仅剩 2");
    expect(translate("ja", "allProducts")).toBe("すべての商品");
    expect(translate("es", "buyNow")).toBe("Comprar ahora");
    expect(translate("pt", "soldOut")).toBe("Esgotado");
  });
});
