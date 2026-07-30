"use server";

import { and, desc, eq, inArray, like, notExists, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { db, orders, productReviews, products, users } from "@/lib/db";
import { adminReplySchema, reviewInputSchema, reviewUpdateSchema } from "@/lib/reviews";

const PUBLIC_PAGE_SIZE = 10;

function iso(value: Date | string | number | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function currentUserId() {
  const session = await auth();
  const id = session?.user?.id;
  return id && id !== "admin" ? id : null;
}

async function revalidateProduct(productId: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { slug: true },
  });
  if (product) revalidatePath(`/product/${product.slug}`);
  revalidatePath("/admin/reviews");
}

export async function getProductReviewData(productId: string, page = 1) {
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * PUBLIC_PAGE_SIZE;
  const userId = await currentUserId();

  const [summaryRows, distributionRows, rows, eligibleOrders, ownReviews] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      average: sql<number>`coalesce(avg(${productReviews.rating}), 0)`,
    }).from(productReviews).where(and(eq(productReviews.productId, productId), eq(productReviews.status, "published"))),
    db.select({ rating: productReviews.rating, count: sql<number>`count(*)` })
      .from(productReviews)
      .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "published")))
      .groupBy(productReviews.rating),
    db.select({
      id: productReviews.id,
      rating: productReviews.rating,
      content: productReviews.content,
      adminReply: productReviews.adminReply,
      adminRepliedAt: productReviews.adminRepliedAt,
      createdAt: productReviews.createdAt,
      updatedAt: productReviews.updatedAt,
      userName: users.name,
      userImage: users.image,
      variantName: orders.productVariantName,
    })
      .from(productReviews)
      .innerJoin(users, eq(users.id, productReviews.userId))
      .innerJoin(orders, eq(orders.id, productReviews.orderId))
      .where(and(eq(productReviews.productId, productId), eq(productReviews.status, "published")))
      .orderBy(desc(productReviews.createdAt))
      .limit(PUBLIC_PAGE_SIZE)
      .offset(offset),
    userId
      ? db.select({ id: orders.id, orderNo: orders.orderNo, variantName: orders.productVariantName, completedAt: orders.fulfilledAt, createdAt: orders.createdAt })
          .from(orders)
          .where(and(
            eq(orders.userId, userId),
            eq(orders.productId, productId),
            eq(orders.status, "completed"),
            notExists(db.select({ id: productReviews.id }).from(productReviews).where(eq(productReviews.orderId, orders.id))),
          ))
          .orderBy(desc(orders.createdAt))
      : Promise.resolve([]),
    userId
      ? db.select({ id: productReviews.id, orderId: productReviews.orderId, rating: productReviews.rating, content: productReviews.content, status: productReviews.status, createdAt: productReviews.createdAt })
          .from(productReviews)
          .where(and(eq(productReviews.userId, userId), eq(productReviews.productId, productId), inArray(productReviews.status, ["published", "hidden"])))
          .orderBy(desc(productReviews.createdAt))
      : Promise.resolve([]),
  ]);

  const total = Number(summaryRows[0]?.total ?? 0);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const row of distributionRows) {
    if (row.rating >= 1 && row.rating <= 5) distribution[row.rating as 1 | 2 | 3 | 4 | 5] = Number(row.count);
  }

  return {
    summary: { total, average: Number(Number(summaryRows[0]?.average ?? 0).toFixed(1)), distribution },
    reviews: rows.map((row) => ({ ...row, createdAt: iso(row.createdAt)!, updatedAt: iso(row.updatedAt)!, adminRepliedAt: iso(row.adminRepliedAt) })),
    page: safePage,
    totalPages: Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE)),
    eligibleOrders: eligibleOrders.map((row) => ({ ...row, completedAt: iso(row.completedAt), createdAt: iso(row.createdAt)! })),
    ownReviews: ownReviews.map((row) => ({ ...row, createdAt: iso(row.createdAt)! })),
    isLoggedIn: Boolean(userId),
  };
}

export async function submitProductReview(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { success: false as const, message: "请先登录" };
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message || "评价内容无效" };

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, parsed.data.orderId), eq(orders.userId, userId), eq(orders.status, "completed")),
    columns: { id: true, productId: true },
  });
  if (!order?.productId) return { success: false as const, message: "只有已完成订单才能评价" };

  try {
    await db.insert(productReviews).values({
      productId: order.productId,
      orderId: order.id,
      userId,
      rating: parsed.data.rating,
      content: parsed.data.content,
    });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return { success: false as const, message: "该订单已经评价过" };
    throw error;
  }
  await revalidateProduct(order.productId);
  return { success: true as const, message: "评价已发布" };
}

export async function updateOwnProductReview(input: unknown) {
  const userId = await currentUserId();
  if (!userId) return { success: false as const, message: "请先登录" };
  const parsed = reviewUpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message || "评价内容无效" };
  const review = await db.query.productReviews.findFirst({
    where: and(eq(productReviews.id, parsed.data.reviewId), eq(productReviews.userId, userId), inArray(productReviews.status, ["published", "hidden"])),
    columns: { id: true, productId: true },
  });
  if (!review) return { success: false as const, message: "评价不存在或不可修改" };
  await db.update(productReviews).set({ rating: parsed.data.rating, content: parsed.data.content, updatedAt: new Date() }).where(eq(productReviews.id, review.id));
  await revalidateProduct(review.productId);
  return { success: true as const, message: "评价已更新" };
}

export async function deleteOwnProductReview(reviewId: string) {
  const userId = await currentUserId();
  if (!userId) return { success: false as const, message: "请先登录" };
  const review = await db.query.productReviews.findFirst({
    where: and(eq(productReviews.id, reviewId), eq(productReviews.userId, userId), inArray(productReviews.status, ["published", "hidden"])),
    columns: { id: true, productId: true },
  });
  if (!review) return { success: false as const, message: "评价不存在或不可删除" };
  await db.update(productReviews).set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() }).where(eq(productReviews.id, review.id));
  await revalidateProduct(review.productId);
  return { success: true as const, message: "评价已删除" };
}

export async function getAdminReviews(filters?: { status?: "published" | "hidden" | "deleted"; rating?: number; query?: string }) {
  await requireAdmin();
  const conditions = [];
  if (filters?.status) conditions.push(eq(productReviews.status, filters.status));
  if (filters?.rating && filters.rating >= 1 && filters.rating <= 5) conditions.push(eq(productReviews.rating, filters.rating));
  if (filters?.query?.trim()) {
    const pattern = `%${filters.query.trim()}%`;
    conditions.push(or(like(productReviews.content, pattern), like(products.name, pattern), like(users.name, pattern), like(orders.orderNo, pattern))!);
  }
  const rows = await db.select({
    id: productReviews.id, productId: productReviews.productId, rating: productReviews.rating, content: productReviews.content,
    status: productReviews.status, adminReply: productReviews.adminReply, adminRepliedAt: productReviews.adminRepliedAt,
    createdAt: productReviews.createdAt, productName: products.name, productSlug: products.slug,
    userName: users.name, userImage: users.image, orderNo: orders.orderNo,
  }).from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .innerJoin(users, eq(users.id, productReviews.userId))
    .innerJoin(orders, eq(orders.id, productReviews.orderId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(productReviews.createdAt))
    .limit(200);
  return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt)!, adminRepliedAt: iso(row.adminRepliedAt) }));
}

export async function setReviewVisibility(reviewId: string, status: "published" | "hidden") {
  await requireAdmin();
  const review = await db.query.productReviews.findFirst({ where: eq(productReviews.id, reviewId), columns: { id: true, productId: true, status: true } });
  if (!review || review.status === "deleted") return { success: false as const, message: "评价不存在或已删除" };
  await db.update(productReviews).set({ status, updatedAt: new Date() }).where(eq(productReviews.id, review.id));
  await revalidateProduct(review.productId);
  return { success: true as const, message: status === "published" ? "评价已公开" : "评价已隐藏" };
}

export async function replyToReview(input: unknown) {
  await requireAdmin();
  const parsed = adminReplySchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message || "回复内容无效" };
  const review = await db.query.productReviews.findFirst({ where: eq(productReviews.id, parsed.data.reviewId), columns: { id: true, productId: true, status: true } });
  if (!review || review.status === "deleted") return { success: false as const, message: "评价不存在或已删除" };
  await db.update(productReviews).set({ adminReply: parsed.data.reply, adminRepliedBy: null, adminRepliedAt: new Date(), updatedAt: new Date() }).where(eq(productReviews.id, review.id));
  await revalidateProduct(review.productId);
  return { success: true as const, message: "回复已发布" };
}

export async function deleteAdminReply(reviewId: string) {
  await requireAdmin();
  const review = await db.query.productReviews.findFirst({ where: eq(productReviews.id, reviewId), columns: { id: true, productId: true } });
  if (!review) return { success: false as const, message: "评价不存在" };
  await db.update(productReviews).set({ adminReply: null, adminRepliedBy: null, adminRepliedAt: null, updatedAt: new Date() }).where(eq(productReviews.id, review.id));
  await revalidateProduct(review.productId);
  return { success: true as const, message: "回复已删除" };
}
