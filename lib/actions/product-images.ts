"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { getProductImageBucket, productImageKeyFromUrl } from "@/lib/product-image-storage";

export async function deleteProductImage(url: string) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }
  const key = productImageKeyFromUrl(url);
  if (!key) return { success: true };
  try {
    await getProductImageBucket().delete(key);
    return { success: true };
  } catch {
    return { success: false, message: "图片删除失败，请稍后重试" };
  }
}
