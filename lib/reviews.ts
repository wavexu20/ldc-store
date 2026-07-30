import { z } from "zod";

export const reviewInputSchema = z.object({
  orderId: z.string().uuid("订单信息无效"),
  rating: z.number().int().min(1, "请选择评分").max(5, "评分无效"),
  content: z.string().trim().min(5, "评价至少需要 5 个字符").max(1000, "评价最多 1000 个字符"),
});

export const reviewUpdateSchema = z.object({
  reviewId: z.string().uuid("评价信息无效"),
  rating: z.number().int().min(1, "请选择评分").max(5, "评分无效"),
  content: z.string().trim().min(5, "评价至少需要 5 个字符").max(1000, "评价最多 1000 个字符"),
});

export const adminReplySchema = z.object({
  reviewId: z.string().uuid("评价信息无效"),
  reply: z.string().trim().min(1, "回复不能为空").max(1000, "回复最多 1000 个字符"),
});

export function ratingDistributionPercent(count: number, total: number) {
  if (total <= 0 || count <= 0) return 0;
  return Math.round((count / total) * 100);
}
