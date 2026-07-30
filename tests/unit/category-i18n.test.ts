import { describe, expect, it } from "vitest";
import { localizeCategory, localizeCategoryName } from "@/lib/category-i18n";

describe("category localization", () => {
  it("localizes built-in storefront categories", () => {
    expect(localizeCategoryName("game-accounts", "游戏账号", "en")).toBe("Game accounts");
    expect(localizeCategoryName("membership", "会员充值", "ko")).toBe("멤버십 충전");
    expect(localizeCategoryName("others", "其他", "de")).toBe("Weitere");
    expect(localizeCategoryName("software", "软件授权", "ja")).toBe("ソフトウェアライセンス");
    expect(localizeCategoryName("game-accounts", "游戏账号", "es")).toBe("Cuentas de juego");
    expect(localizeCategoryName("membership", "会员充值", "pt")).toBe("Recargas de assinatura");
  });

  it("preserves custom category names", () => {
    expect(localizeCategoryName("custom", "自定义分类", "en")).toBe("自定义分类");
    expect(localizeCategory({ id: "1", slug: "software", name: "软件授权" }, "en")).toEqual({
      id: "1",
      slug: "software",
      name: "Software licenses",
    });
  });
});
