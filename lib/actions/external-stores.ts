"use server";

import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import { db, settings } from "@/lib/db";

const STORE_KEYS = {
  xianyu: "store.external.xianyu",
  liandong: "store.external.liandong",
  plati: "store.external.plati",
} as const;

const urlSchema = z.string().trim().max(500, "链接最多 500 个字符").refine((value) => !value || /^https?:\/\//i.test(value), "请输入以 http:// 或 https:// 开头的链接");
const externalStoreSchema = z.object({ xianyu: urlSchema, liandong: urlSchema, plati: urlSchema });

export type ExternalStoreLinks = z.infer<typeof externalStoreSchema>;

export async function getExternalStoreLinks(): Promise<ExternalStoreLinks> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key, Object.values(STORE_KEYS)));
  const values = new Map(rows.map((row) => [row.key, row.value || ""]));
  const parsed = externalStoreSchema.safeParse({
    xianyu: values.get(STORE_KEYS.xianyu) || "",
    liandong: values.get(STORE_KEYS.liandong) || "",
    plati: values.get(STORE_KEYS.plati) || "",
  });
  return parsed.success ? parsed.data : { xianyu: "", liandong: "", plati: "" };
}

export async function updateExternalStoreLinks(input: ExternalStoreLinks) {
  try { await requireAdmin(); } catch { return { success: false, message: "需要管理员权限" }; }
  const parsed = externalStoreSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || "链接格式不正确" };
  const now = new Date();
  try {
    await db.insert(settings).values([
      { key: STORE_KEYS.xianyu, value: parsed.data.xianyu, description: "闲鱼店铺链接", updatedAt: now },
      { key: STORE_KEYS.liandong, value: parsed.data.liandong, description: "链动小铺店铺链接", updatedAt: now },
      { key: STORE_KEYS.plati, value: parsed.data.plati, description: "Plati 店铺链接", updatedAt: now },
    ]).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, description: sql`excluded.description`, updatedAt: now } });
    revalidatePath("/account/wallet");
    revalidatePath("/");
    return { success: true, message: "第三方店铺链接已更新" };
  } catch {
    return { success: false, message: "保存失败，请稍后重试" };
  }
}
