import { describe, expect, it } from "vitest";

import { createProductSchema, productPreviewSchema, productSchema, updateProductSchema } from "@/lib/validations/product";

function makeValidProductInput() {
  return {
    name: "Test Product",
    slug: "test-product-1",
    price: 9.9,
    maxQuantity: 10,
    minQuantity: 1,
    sortOrder: 0,
    isActive: true,
    isFeatured: false,
  };
}

describe("validations/product", () => {
  it("productSchema 应通过最小合法输入并补齐默认值", () => {
    const result = productSchema.safeParse(makeValidProductInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    // 为什么要断言默认值：避免后续排序/开关逻辑依赖 undefined 导致分支不一致
    expect(result.data.isActive).toBe(true);
    expect(result.data.isFeatured).toBe(false);
    expect(result.data.sortOrder).toBe(0);
  });

  it("应拒绝缺失必填字段", () => {
    const result = productSchema.safeParse({
      slug: "x",
      price: 1,
      maxQuantity: 1,
      minQuantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝不符合规则的 slug", () => {
    const result = productSchema.safeParse({
      ...makeValidProductInput(),
      slug: "Bad Slug!",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.message.includes("URL标识只能包含"))).toBe(true);
  });

  it("coverImage 应允许空字符串/null/合法 URL", () => {
    expect(
      productSchema.safeParse({
        ...makeValidProductInput(),
        coverImage: "",
      }).success
    ).toBe(true);

    expect(
      productSchema.safeParse({
        ...makeValidProductInput(),
        coverImage: null,
      }).success
    ).toBe(true);

    expect(
      productSchema.safeParse({
        ...makeValidProductInput(),
        coverImage: "https://example.com/a.png",
      }).success
    ).toBe(true);

    expect(
      productSchema.safeParse({
        ...makeValidProductInput(),
        coverImage: "not-a-url",
      }).success
    ).toBe(false);
  });

  it("应允许 Cloudflare R2 站内商品图片地址", () => {
    const storedImage = "/api/product-images/products/0195eb17-2db8-7f93-b950-7259b29c5a10.webp";
    expect(productSchema.safeParse({
      ...makeValidProductInput(),
      coverImage: storedImage,
      images: [storedImage],
    }).success).toBe(true);
    expect(productPreviewSchema.safeParse({
      name: "Preview",
      coverImage: storedImage,
      images: [storedImage],
    }).success).toBe(true);
  });

  it("应拒绝非商品存储路径和非 HTTP 外部图片", () => {
    for (const image of ["/api/avatars/test.png", "/api/product-images/products/not-a-uuid.png", "javascript:alert(1)"]) {
      expect(productSchema.safeParse({ ...makeValidProductInput(), coverImage: image }).success).toBe(false);
    }
  });

  it("updateProductSchema 应允许 partial update", () => {
    const result = updateProductSchema.safeParse({
      name: "Only Name Updated",
    });
    expect(result.success).toBe(true);
  });

  it("createProductSchema 与 productSchema 行为一致", () => {
    const input = makeValidProductInput();
    expect(createProductSchema.safeParse(input).success).toBe(true);
  });
});
