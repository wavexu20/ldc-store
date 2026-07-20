import { describe, expect, it } from "vitest";
import { localizeProduct, localizeProducts } from "@/lib/product-i18n";

const product = {
  name: "原始名称",
  description: "原始简介",
  content: "原始详情",
  translations: {
    en: {
      name: "Translated name",
      description: "Translated summary",
      content: "Translated details",
    },
    de: { name: "Übersetzter Name" },
  },
};

describe("product localization", () => {
  it("uses the requested product translation", () => {
    expect(localizeProduct(product, "en")).toMatchObject({
      name: "Translated name",
      description: "Translated summary",
      content: "Translated details",
    });
  });

  it("falls back field-by-field to the source content", () => {
    expect(localizeProduct(product, "de")).toMatchObject({
      name: "Übersetzter Name",
      description: "原始简介",
      content: "原始详情",
    });
  });

  it("returns source content when the locale has no translation", () => {
    expect(localizeProduct(product, "ko")).toEqual(product);
    expect(localizeProducts([product], "ko")).toEqual([product]);
  });

  it("localizes a built-in category even when the product has no translation", () => {
    expect(localizeProduct({
      ...product,
      translations: null,
      category: { id: "category-1", slug: "membership", name: "会员充值" },
    }, "en")).toMatchObject({
      name: "原始名称",
      category: { id: "category-1", slug: "membership", name: "Membership top-ups" },
    });
  });
});
