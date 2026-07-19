import { describe, expect, it } from "vitest";
import { adminReplySchema, ratingDistributionPercent, reviewInputSchema, reviewUpdateSchema } from "@/lib/reviews";

describe("review validation", () => {
  const orderId = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid verified-order review payload", () => {
    const result = reviewInputSchema.safeParse({ orderId, rating: 5, content: "真实购买体验很好" });
    expect(result.success).toBe(true);
  });

  it.each([
    [{ orderId: "bad", rating: 5, content: "内容足够长" }, "订单信息无效"],
    [{ orderId, rating: 0, content: "内容足够长" }, "请选择评分"],
    [{ orderId, rating: 6, content: "内容足够长" }, "评分无效"],
    [{ orderId, rating: 5, content: "短" }, "评价至少需要 5 个字符"],
    [{ orderId, rating: 5, content: "x".repeat(1001) }, "评价最多 1000 个字符"],
  ])("rejects invalid input", (input, message) => {
    const result = reviewInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(message);
  });

  it("validates edit and admin reply payloads", () => {
    expect(reviewUpdateSchema.safeParse({ reviewId: orderId, rating: 4, content: "更新后的真实评价" }).success).toBe(true);
    expect(adminReplySchema.safeParse({ reviewId: orderId, reply: "感谢您的支持" }).success).toBe(true);
    expect(adminReplySchema.safeParse({ reviewId: orderId, reply: "" }).success).toBe(false);
  });

  it("calculates stable rating distribution percentages", () => {
    expect(ratingDistributionPercent(3, 4)).toBe(75);
    expect(ratingDistributionPercent(0, 4)).toBe(0);
    expect(ratingDistributionPercent(1, 0)).toBe(0);
  });
});
