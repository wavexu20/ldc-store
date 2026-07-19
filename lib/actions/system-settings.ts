"use server";

import { db, settings } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-utils";
import { revalidateAllStoreCache } from "@/lib/cache";
import { getOrderExpireMinutes } from "@/lib/order-config";
import { systemSettingsSchema, type SystemSettings, type SystemSettingsInput } from "@/lib/validations/system-settings";
import { inArray, sql } from "drizzle-orm";

const SYSTEM_SETTING_KEYS = {
  siteName: "site.name",
  siteDescription: "site.description",
  siteIcon: "site.icon",
  siteIconUrl: "site.icon_url",
  orderExpireMinutes: "order.expire_minutes",
  telegramEnabled: "telegram.enabled",
  telegramBotToken: "telegram.bot_token",
  telegramChatId: "telegram.chat_id",
  telegramNotifyOrderCreated: "telegram.notify.order_created",
  telegramNotifyPaymentSuccess: "telegram.notify.payment_success",
  telegramNotifyRefundRequested: "telegram.notify.refund_requested",
  telegramNotifyRefundApproved: "telegram.notify.refund_approved",
  telegramNotifyRefundRejected: "telegram.notify.refund_rejected",
} as const;

export async function getSystemSettings(): Promise<SystemSettings> {
  const envSiteName = process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  const envSiteDescription =
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "基于 Linux DO Credit 的虚拟商品自动发卡平台";

  const keys = Object.values(SYSTEM_SETTING_KEYS);
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));

  const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

  const rawExpireMinutes = map.get(SYSTEM_SETTING_KEYS.orderExpireMinutes);
  const parsedExpireMinutes = Number.parseInt(String(rawExpireMinutes ?? ""), 10);
  const expireMinutes = Number.isFinite(parsedExpireMinutes)
    ? parsedExpireMinutes
    : getOrderExpireMinutes();

  const candidate = {
    siteName: (map.get(SYSTEM_SETTING_KEYS.siteName) ?? envSiteName) || envSiteName,
    siteDescription:
      (map.get(SYSTEM_SETTING_KEYS.siteDescription) ?? envSiteDescription) ||
      envSiteDescription,
    siteIcon: map.get(SYSTEM_SETTING_KEYS.siteIcon) ?? "Store",
    siteIconUrl: map.get(SYSTEM_SETTING_KEYS.siteIconUrl) || "/brand/game3dtech-icon.png",
    orderExpireMinutes: expireMinutes,
    // Telegram 配置 - 敏感字段脱敏，仅返回启用状态
    // 完整配置需通过 getSystemSettingsForAdmin() 获取
    telegramEnabled: map.get(SYSTEM_SETTING_KEYS.telegramEnabled) === "true",
    telegramBotToken: "", // 脱敏：不在公共函数中返回
    telegramChatId: "",   // 脱敏：不在公共函数中返回
    // 通知开关 - 默认关闭
    telegramNotifyOrderCreated: map.get(SYSTEM_SETTING_KEYS.telegramNotifyOrderCreated) === "true",
    telegramNotifyPaymentSuccess: map.get(SYSTEM_SETTING_KEYS.telegramNotifyPaymentSuccess) === "true",
    telegramNotifyRefundRequested: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRequested) === "true",
    telegramNotifyRefundApproved: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundApproved) === "true",
    telegramNotifyRefundRejected: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRejected) === "true",
  };

  // 为什么这样做：DB 配置是运行时数据，可能被写入非法值；这里用 safeParse 兜底，避免因"单个脏字段"导致整站 500。
  const parsed = systemSettingsSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn("系统配置存在非法值，已回退到默认配置:", parsed.error.issues);
  return {
    siteName: envSiteName,
    siteDescription: envSiteDescription,
    siteIcon: "Store",
    siteIconUrl: "/brand/game3dtech-icon.png",
    orderExpireMinutes: getOrderExpireMinutes(),
    telegramEnabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    telegramNotifyOrderCreated: false,
    telegramNotifyPaymentSuccess: false,
    telegramNotifyRefundRequested: false,
    telegramNotifyRefundApproved: false,
    telegramNotifyRefundRejected: false,
  };
}

export async function updateSystemSettings(input: SystemSettingsInput): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = systemSettingsSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0]?.message || "参数错误",
    };
  }

  const now = new Date();
  const {
    siteName,
    siteDescription,
    siteIcon,
    siteIconUrl,
    orderExpireMinutes,
    telegramEnabled,
    telegramBotToken,
    telegramChatId,
    telegramNotifyOrderCreated,
    telegramNotifyPaymentSuccess,
    telegramNotifyRefundRequested,
    telegramNotifyRefundApproved,
    telegramNotifyRefundRejected,
  } = validationResult.data;

  try {
    // 为什么这样做：系统配置需要"可覆盖 + 可回滚"；用 key-value 做幂等 upsert，避免多次保存产生重复记录。
    await db
      .insert(settings)
      .values([
        {
          key: SYSTEM_SETTING_KEYS.siteName,
          value: siteName,
          description: "网站名称",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteDescription,
          value: siteDescription,
          description: "网站描述",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteIcon,
          value: siteIcon,
          description: "网站图标（Lucide icon name）",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteIconUrl,
          value: siteIconUrl,
          description: "自定义网站图标 URL",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.orderExpireMinutes,
          value: String(orderExpireMinutes),
          description: "订单过期时间（分钟）",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramEnabled,
          value: String(telegramEnabled),
          description: "Telegram 通知开关",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramBotToken,
          value: telegramBotToken,
          description: "Telegram Bot Token",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramChatId,
          value: telegramChatId,
          description: "Telegram Chat ID",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramNotifyOrderCreated,
          value: String(telegramNotifyOrderCreated),
          description: "新订单通知",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramNotifyPaymentSuccess,
          value: String(telegramNotifyPaymentSuccess),
          description: "支付成功通知",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramNotifyRefundRequested,
          value: String(telegramNotifyRefundRequested),
          description: "退款申请通知",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramNotifyRefundApproved,
          value: String(telegramNotifyRefundApproved),
          description: "退款成功通知",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.telegramNotifyRefundRejected,
          value: String(telegramNotifyRefundRejected),
          description: "退款拒绝通知",
          updatedAt: now,
        },
      ])
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: sql`excluded.value`,
          description: sql`excluded.description`,
          updatedAt: now,
        },
      });

    // 为什么这样做：前台页面包含 ISR 缓存；配置更新后需要主动清理，确保用户“马上看到”新配置。
    await revalidateAllStoreCache();

    return { success: true, message: "系统配置已更新（已热生效）" };
  } catch (error) {
    console.error("更新系统配置失败:", error);
    return { success: false, message: "更新失败，请稍后重试" };
  }
}

/**
 * 获取 Telegram 配置（供通知模块内部调用）
 * - 不需要管理员权限，因为只在服务端内部使用
 */
export async function getTelegramConfig(): Promise<{
  enabled: boolean;
  botToken: string;
  chatId: string;
}> {
  const keys = [
    SYSTEM_SETTING_KEYS.telegramEnabled,
    SYSTEM_SETTING_KEYS.telegramBotToken,
    SYSTEM_SETTING_KEYS.telegramChatId,
  ];

  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, keys));

    const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

    return {
      enabled: map.get(SYSTEM_SETTING_KEYS.telegramEnabled) === "true",
      botToken: map.get(SYSTEM_SETTING_KEYS.telegramBotToken) ?? "",
      chatId: map.get(SYSTEM_SETTING_KEYS.telegramChatId) ?? "",
    };
  } catch (error) {
    console.error("[getTelegramConfig] 获取 Telegram 配置失败:", error);
    return { enabled: false, botToken: "", chatId: "" };
  }
}

import type { TelegramConfigWithToggles } from "@/lib/notifications/telegram";

export async function getTelegramConfigWithToggles(): Promise<TelegramConfigWithToggles> {
  const keys = [
    SYSTEM_SETTING_KEYS.telegramEnabled,
    SYSTEM_SETTING_KEYS.telegramBotToken,
    SYSTEM_SETTING_KEYS.telegramChatId,
    SYSTEM_SETTING_KEYS.telegramNotifyOrderCreated,
    SYSTEM_SETTING_KEYS.telegramNotifyPaymentSuccess,
    SYSTEM_SETTING_KEYS.telegramNotifyRefundRequested,
    SYSTEM_SETTING_KEYS.telegramNotifyRefundApproved,
    SYSTEM_SETTING_KEYS.telegramNotifyRefundRejected,
  ];

  try {
    const rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, keys));

    const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

    return {
      enabled: map.get(SYSTEM_SETTING_KEYS.telegramEnabled) === "true",
      botToken: map.get(SYSTEM_SETTING_KEYS.telegramBotToken) ?? "",
      chatId: map.get(SYSTEM_SETTING_KEYS.telegramChatId) ?? "",
      notifyOrderCreated: map.get(SYSTEM_SETTING_KEYS.telegramNotifyOrderCreated) === "true",
      notifyPaymentSuccess: map.get(SYSTEM_SETTING_KEYS.telegramNotifyPaymentSuccess) === "true",
      notifyRefundRequested: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRequested) === "true",
      notifyRefundApproved: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundApproved) === "true",
      notifyRefundRejected: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRejected) === "true",
    };
  } catch (error) {
    console.error("[getTelegramConfigWithToggles] 获取 Telegram 配置失败:", error);
    return {
      enabled: false,
      botToken: "",
      chatId: "",
      notifyOrderCreated: false,
      notifyPaymentSuccess: false,
      notifyRefundRequested: false,
      notifyRefundApproved: false,
      notifyRefundRejected: false,
    };
  }
}

/**
 * 获取完整系统配置（仅限管理员）
 * - 包含敏感字段（Telegram Bot Token 等）
 * - 用于后台配置页面
 */
export async function getSystemSettingsForAdmin(): Promise<SystemSettings> {
  // 此函数仅在 admin 页面的 server component 中调用，
  // 页面本身已有 middleware 保护，这里再做一次防御性检查
  try {
    await requireAdmin();
  } catch {
    // 未授权时返回脱敏配置
    return getSystemSettings();
  }

  const envSiteName = process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  const envSiteDescription =
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "基于 Linux DO Credit 的虚拟商品自动发卡平台";

  const keys = Object.values(SYSTEM_SETTING_KEYS);
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));

  const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

  const rawExpireMinutes = map.get(SYSTEM_SETTING_KEYS.orderExpireMinutes);
  const parsedExpireMinutes = Number.parseInt(String(rawExpireMinutes ?? ""), 10);
  const expireMinutes = Number.isFinite(parsedExpireMinutes)
    ? parsedExpireMinutes
    : getOrderExpireMinutes();

  return {
    siteName: (map.get(SYSTEM_SETTING_KEYS.siteName) ?? envSiteName) || envSiteName,
    siteDescription:
      (map.get(SYSTEM_SETTING_KEYS.siteDescription) ?? envSiteDescription) ||
      envSiteDescription,
    siteIcon: (map.get(SYSTEM_SETTING_KEYS.siteIcon) ?? "Store") as SystemSettings["siteIcon"],
    siteIconUrl: map.get(SYSTEM_SETTING_KEYS.siteIconUrl) || "/brand/game3dtech-icon.png",
    orderExpireMinutes: expireMinutes,
    telegramEnabled: map.get(SYSTEM_SETTING_KEYS.telegramEnabled) === "true",
    telegramBotToken: map.get(SYSTEM_SETTING_KEYS.telegramBotToken) ?? "",
    telegramChatId: map.get(SYSTEM_SETTING_KEYS.telegramChatId) ?? "",
    telegramNotifyOrderCreated: map.get(SYSTEM_SETTING_KEYS.telegramNotifyOrderCreated) === "true",
    telegramNotifyPaymentSuccess: map.get(SYSTEM_SETTING_KEYS.telegramNotifyPaymentSuccess) === "true",
    telegramNotifyRefundRequested: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRequested) === "true",
    telegramNotifyRefundApproved: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundApproved) === "true",
    telegramNotifyRefundRejected: map.get(SYSTEM_SETTING_KEYS.telegramNotifyRefundRejected) === "true",
  };
}
