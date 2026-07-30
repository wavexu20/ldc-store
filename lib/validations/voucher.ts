import { z } from "zod";

export const voucherTypes = ["recharge", "product", "discount"] as const;

export const createVoucherBatchSchema = z.object({
  name: z.string().trim().min(2, "批次名称至少 2 个字符").max(80, "批次名称最多 80 个字符"),
  type: z.enum(voucherTypes),
  quantity: z.number().int().min(1, "至少生成 1 张卡券").max(10_000, "单次最多生成 10,000 张卡券"),
  rechargeAmountCents: z.number().int().min(0).max(10_000_000).default(0),
  discountAmountCents: z.number().int().min(0).max(10_000_000).default(0),
  minOrderCents: z.number().int().min(0).max(10_000_000).default(0),
  productId: z.string().uuid().nullable().optional(),
  productVariantId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).superRefine((input, ctx) => {
  if (input.type === "recharge" && input.rechargeAmountCents < 100) {
    ctx.addIssue({ code: "custom", path: ["rechargeAmountCents"], message: "充值券面额至少为 ¥1" });
  }
  if (input.type === "discount") {
    if (input.discountAmountCents < 1) ctx.addIssue({ code: "custom", path: ["discountAmountCents"], message: "请设置满减金额" });
    if (input.minOrderCents < input.discountAmountCents) ctx.addIssue({ code: "custom", path: ["minOrderCents"], message: "使用门槛不能低于优惠金额" });
  }
  if (input.type === "product" && !input.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "请选择可兑换商品" });
  }
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "有效期必须晚于当前时间" });
  }
});

export type CreateVoucherBatchInput = z.input<typeof createVoucherBatchSchema>;
