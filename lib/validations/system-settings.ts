import { z } from "zod";
import { telegramSettingsSchema } from "./telegram-settings";

export const SITE_ICON_OPTIONS = [
  "Store",
  "Sparkles",
  "ShoppingCart",
  "Package",
  "CreditCard",
  "Gem",
  "Rocket",
  "Shield",
  "Zap",
] as const;

export type SiteIconOption = (typeof SITE_ICON_OPTIONS)[number];

function isValidIconUrl(val: string): boolean {
  if (!val) return true;

  // 禁止协议相对 URL（//example.com）
  if (val.startsWith("//")) return false;

  // 站内相对路径：必须以单个 / 开头，且第二个字符不能是 /
  if (val.startsWith("/")) {
    return val.length === 1 || val[1] !== "/";
  }

  // 外链：使用 URL 构造函数校验合法性
  try {
    const url = new URL(val);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// 基础系统配置
const baseSystemSettingsSchema = z.object({
  siteName: z
    .string()
    .trim()
    .min(1, "请输入网站名称")
    .max(50, "网站名称最多 50 个字符"),
  siteDescription: z
    .string()
    .trim()
    .max(200, "网站描述最多 200 个字符")
    .default(""),
  siteIcon: z.enum(SITE_ICON_OPTIONS).default("Store"),
  siteIconUrl: z
    .string()
    .trim()
    .max(500, "图标 URL 最多 500 个字符")
    .refine(isValidIconUrl, "请输入有效的 URL（https:// 外链或 / 开头的站内路径）")
    .default(""),
  orderExpireMinutes: z
    .number({ error: "请输入数字" })
    .int("必须为整数")
    .min(1, "至少 1 分钟")
    .max(1440, "最大 1440 分钟"),
  usdCnyRate: z
    .number({ error: "请输入有效汇率" })
    .min(1, "汇率不能低于 1")
    .max(20, "汇率不能高于 20")
    .default(7.2),
});

// 合并 Telegram 配置
export const systemSettingsSchema = baseSystemSettingsSchema.merge(telegramSettingsSchema);

export type SystemSettingsInput = z.input<typeof systemSettingsSchema>;
export type SystemSettings = z.output<typeof systemSettingsSchema>;
