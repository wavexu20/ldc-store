import { z } from "zod";

// 创建订单验证：游客需额外提供邮箱与 Turnstile token，登录用户可省略。
export const createOrderSchema = z.object({
  productId: z.string().uuid("无效的商品ID"),
  variantId: z.string().uuid("无效的商品规格").optional(),
  quantity: z.number().int().min(1, "数量至少为1").max(100, "数量不能超过100"),
  paymentMethod: z.enum(["gateway", "ldc", "balance", "alipay", "wechat", "usdt", "voucher"]).default("gateway"),
  usePoints: z.boolean().default(false),
  voucherId: z.string().uuid("无效的优惠券").optional(),
  email: z.string().trim().email("请输入有效邮箱").max(254, "邮箱地址过长").optional(),
  turnstileToken: z.string().min(1, "请完成人机验证").max(2048, "人机验证无效").optional(),
});

// 管理员更新订单状态验证
export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["pending", "paid", "completed", "expired", "refunded"]),
  adminRemark: z.string().optional(),
});

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
