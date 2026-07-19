import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  orderFind: vi.fn(),
  productFind: vi.fn(),
  reviewFind: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }), desc: (arg: unknown) => arg,
  eq: (...args: unknown[]) => ({ eq: args }), inArray: (...args: unknown[]) => ({ inArray: args }),
  like: (...args: unknown[]) => ({ like: args }), notExists: (arg: unknown) => ({ notExists: arg }),
  or: (...args: unknown[]) => ({ or: args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock("@/lib/auth", () => ({ auth: () => mocks.auth() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args) }));
vi.mock("@/lib/auth-utils", () => ({ requireAdmin: () => mocks.requireAdmin() }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      orders: { findFirst: (...args: unknown[]) => mocks.orderFind(...args) },
      products: { findFirst: (...args: unknown[]) => mocks.productFind(...args) },
      productReviews: { findFirst: (...args: unknown[]) => mocks.reviewFind(...args) },
    },
    insert: () => ({ values: (...args: unknown[]) => mocks.insertValues(...args) }),
    update: () => ({ set: (value: unknown) => { mocks.updateSet(value); return { where: vi.fn().mockResolvedValue(undefined) }; } }),
  },
  orders: { id: "orders.id", userId: "orders.userId", status: "orders.status" },
  productReviews: { id: "reviews.id", orderId: "reviews.orderId" },
  products: { id: "products.id" },
  users: {},
}));

import { replyToReview, submitProductReview } from "@/lib/actions/reviews";

const valid = { orderId: "11111111-1111-4111-8111-111111111111", rating: 5, content: "真实购买，体验很好" };

beforeEach(() => {
  mocks.auth.mockReset(); mocks.orderFind.mockReset(); mocks.productFind.mockReset(); mocks.reviewFind.mockReset(); mocks.insertValues.mockReset(); mocks.updateSet.mockReset(); mocks.requireAdmin.mockReset(); mocks.revalidatePath.mockReset();
});

describe("replyToReview", () => {
  const reviewId = "99999999-9999-4999-8999-999999999999";

  it("requires an administrator", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("需要管理员权限"));
    await expect(replyToReview({ reviewId, reply: "感谢支持" })).rejects.toThrow("需要管理员权限");
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it("writes a public merchant reply and revalidates product pages", async () => {
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    mocks.reviewFind.mockResolvedValue({ id: reviewId, productId: "p1", status: "published" });
    mocks.productFind.mockResolvedValue({ slug: "product-one" });
    expect(await replyToReview({ reviewId, reply: "感谢支持" })).toEqual({ success: true, message: "回复已发布" });
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ adminReply: "感谢支持", adminRepliedBy: null }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/product/product-one");
  });
});

describe("submitProductReview", () => {
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await submitProductReview(valid)).toEqual({ success: false, message: "请先登录" });
    expect(mocks.orderFind).not.toHaveBeenCalled();
  });

  it("rejects invalid input before database access", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    const result = await submitProductReview({ ...valid, rating: 9 });
    expect(result.success).toBe(false);
    expect(mocks.orderFind).not.toHaveBeenCalled();
  });

  it("requires a completed order belonging to the current user", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.orderFind.mockResolvedValue(null);
    expect(await submitProductReview(valid)).toEqual({ success: false, message: "只有已完成订单才能评价" });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("creates one review and revalidates the product", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.orderFind.mockResolvedValue({ id: valid.orderId, productId: "p1" });
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.productFind.mockResolvedValue({ slug: "product-one" });
    expect(await submitProductReview(valid)).toEqual({ success: true, message: "评价已发布" });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ productId: "p1", orderId: valid.orderId, userId: "u1", rating: 5 }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/product/product-one");
  });

  it("turns the unique-order constraint into a friendly error", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1" } });
    mocks.orderFind.mockResolvedValue({ id: valid.orderId, productId: "p1" });
    mocks.insertValues.mockRejectedValue(new Error("UNIQUE constraint failed: product_reviews.order_id"));
    expect(await submitProductReview(valid)).toEqual({ success: false, message: "该订单已经评价过" });
  });
});
