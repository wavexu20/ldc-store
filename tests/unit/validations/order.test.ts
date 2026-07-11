import { describe, expect, it } from "vitest";

import { createOrderSchema, updateOrderStatusSchema } from "@/lib/validations/order";

describe("validations/order", () => {
  describe("createOrderSchema", () => {
    it("应通过合法的下单参数，并补齐默认 paymentMethod", () => {
      const result = createOrderSchema.safeParse({
        productId: "00000000-0000-0000-0000-000000000000",
        quantity: 1,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      // 为什么要断言 default：避免调用方忘传 paymentMethod 导致服务端分支不一致
      expect(result.data.paymentMethod).toBe("gateway");
    });

    it("应拒绝无效的 productId（非 UUID）", () => {
      const result = createOrderSchema.safeParse({
        productId: "not-a-uuid",
        quantity: 1,
        paymentMethod: "ldc",
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.issues[0]?.message).toBe("无效的商品ID");
    });

    it("应拒绝数量越界（<1 或 >100）", () => {
      const tooSmall = createOrderSchema.safeParse({
        productId: "00000000-0000-0000-0000-000000000000",
        quantity: 0,
        paymentMethod: "ldc",
      });
      expect(tooSmall.success).toBe(false);

      const tooLarge = createOrderSchema.safeParse({
        productId: "00000000-0000-0000-0000-000000000000",
        quantity: 101,
        paymentMethod: "ldc",
      });
      expect(tooLarge.success).toBe(false);
    });
  });

  describe("updateOrderStatusSchema", () => {
    it("应通过合法的订单状态更新参数", () => {
      const result = updateOrderStatusSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000000",
        status: "paid",
        adminRemark: "ok",
      });

      expect(result.success).toBe(true);
    });

    it("应拒绝非法 status 枚举", () => {
      const result = updateOrderStatusSchema.safeParse({
        orderId: "00000000-0000-0000-0000-000000000000",
        status: "unknown",
      });

      expect(result.success).toBe(false);
    });
  });
});
