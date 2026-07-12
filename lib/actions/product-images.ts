"use server";

import { requireAdmin } from "@/lib/auth-utils";
import { getProductImageBucket, productImageKeyFromUrl, productImageUrlForKey } from "@/lib/product-image-storage";

const imageMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxImagesPerUpload = 6;
const maxImageBytes = 2 * 1024 * 1024;

function hasExpectedImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export async function uploadProductImages(formData: FormData) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { success: false, message: "请选择至少一张图片" };
  if (files.length > maxImagesPerUpload) return { success: false, message: `单次最多上传 ${maxImagesPerUpload} 张图片` };

  const bucket = getProductImageBucket();
  const uploadedKeys: string[] = [];
  try {
    for (const file of files) {
      const extension = imageMimeTypes.get(file.type);
      if (!extension) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
      if (file.size > maxImageBytes) throw new Error("单张图片不能超过 2 MB");
      const content = new Uint8Array(await file.arrayBuffer());
      if (!hasExpectedImageSignature(content, file.type)) throw new Error("图片文件格式无效");
      const key = `products/${crypto.randomUUID()}.${extension}`;
      await bucket.put(key, content, { httpMetadata: { contentType: file.type } });
      uploadedKeys.push(key);
    }
    return { success: true, urls: uploadedKeys.map(productImageUrlForKey), message: `已上传 ${uploadedKeys.length} 张图片` };
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => bucket.delete(key).catch(() => undefined)));
    return { success: false, message: error instanceof Error ? error.message : "图片上传失败，请稍后重试" };
  }
}

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
