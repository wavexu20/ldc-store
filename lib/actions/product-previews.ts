"use server";

import { and, eq, gt, lt } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-utils";
import { categories, db, productPreviews } from "@/lib/db";
import { productPreviewSchema, type ProductInput } from "@/lib/validations/product";

const previewLifetimeMs = 24 * 60 * 60 * 1000;
const previewTokenPattern = /^[a-f0-9]{32}$/;

export async function createProductPreview(input: ProductInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const parsed = productPreviewSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };

  const data = parsed.data;
  const category = data.categoryId
    ? await db.query.categories.findFirst({ where: eq(categories.id, data.categoryId), columns: { name: true } })
    : null;
  const imageUrls = Array.from(new Set([data.coverImage || null, ...data.images].filter((url): url is string => Boolean(url))));
  const expiresAt = new Date(Date.now() + previewLifetimeMs);
  const token = crypto.randomUUID().replaceAll("-", "");

  try {
    await db.delete(productPreviews).where(lt(productPreviews.expiresAt, new Date()));
    await db.insert(productPreviews).values({
      token,
      expiresAt,
      payload: {
        name: data.name,
        description: data.description,
        content: data.content,
        price: data.price,
        originalPrice: data.originalPrice ?? null,
        coverImage: data.coverImage || imageUrls[0] || null,
        images: imageUrls,
        isFeatured: data.isFeatured,
        categoryName: category?.name ?? null,
      },
    });
    const origin = process.env.AUTH_URL || "https://game3dtech.com";
    return { success: true, url: new URL(`/preview/product/${token}`, origin).toString(), expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error("[createProductPreview]", error);
    return { success: false, message: "临时预览链接创建失败，请稍后重试" };
  }
}

export async function getProductPreviewByToken(token: string) {
  if (!previewTokenPattern.test(token)) return null;
  const preview = await db.query.productPreviews.findFirst({
    where: and(eq(productPreviews.token, token), gt(productPreviews.expiresAt, new Date())),
    columns: { payload: true, expiresAt: true },
  });
  return preview || null;
}
