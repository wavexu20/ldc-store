import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-utils";
import { getProductMediaBucket, productMediaUrlForKey } from "@/lib/product-media-storage";

const mediaTypes = new Map([
  ["image/jpeg", { extension: "jpg", maxBytes: 10 * 1024 * 1024 }],
  ["image/png", { extension: "png", maxBytes: 10 * 1024 * 1024 }],
  ["image/webp", { extension: "webp", maxBytes: 10 * 1024 * 1024 }],
  ["video/mp4", { extension: "mp4", maxBytes: 50 * 1024 * 1024 }],
  ["video/webm", { extension: "webm", maxBytes: 50 * 1024 * 1024 }],
]);

function isUploadedFile(entry: FormDataEntryValue | null): entry is File {
  return Boolean(entry && typeof entry !== "string" && entry.size > 0 && typeof entry.arrayBuffer === "function");
}

function hasExpectedSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (type === "video/mp4") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type === "video/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, message: "需要管理员权限" }, { status: 401 });
  }

  let uploadedKey: string | undefined;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!isUploadedFile(file)) {
      return NextResponse.json({ success: false, message: "请选择文件" }, { status: 400 });
    }
    const config = mediaTypes.get(file.type);
    if (!config) throw new Error("仅支持 JPG、PNG、WebP、MP4 或 WebM 文件");
    if (file.size > config.maxBytes) {
      throw new Error(file.type.startsWith("video/") ? "视频不能超过 50 MB" : "图片不能超过 10 MB");
    }
    const content = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedSignature(content, file.type)) throw new Error("媒体文件格式无效");

    uploadedKey = `product-media/${crypto.randomUUID()}.${config.extension}`;
    await getProductMediaBucket().put(uploadedKey, content, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedFor: "product-description" },
    });
    return NextResponse.json({
      success: true,
      url: productMediaUrlForKey(uploadedKey),
      kind: file.type.startsWith("video/") ? "video" : "image",
    });
  } catch (error) {
    if (uploadedKey) await getProductMediaBucket().delete(uploadedKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "媒体上传失败，请稍后重试";
    const isValidationError = message.startsWith("仅支持") || message.includes("不能超过") || message.includes("格式无效");
    return NextResponse.json({ success: false, message }, { status: isValidationError ? 400 : 500 });
  }
}
