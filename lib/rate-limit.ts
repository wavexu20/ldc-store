/**
 * 登录速率限制器（数据库存储）
 * 用于防止管理员密码暴力破解攻击
 */

import { db, loginRateLimits } from "@/lib/db";
import { eq } from "drizzle-orm";

// 配置
const CONFIG = {
  // 时间窗口（毫秒）- 15分钟
  WINDOW_MS: 15 * 60 * 1000,
  // 最大尝试次数
  MAX_ATTEMPTS: 5,
  // 封禁时间（毫秒）- 30分钟
  BLOCK_DURATION_MS: 30 * 60 * 1000,
};

function secondsUntil(targetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // 秒
  blocked: boolean;
  message?: string;
}

/**
 * 检查是否允许登录尝试
 * @param identifier 标识符（通常是 IP 地址）
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const nowMs = Date.now();

  const record = await db.query.loginRateLimits.findFirst({
    where: eq(loginRateLimits.identifier, identifier),
  });

  if (!record) {
    return {
      success: true,
      remaining: CONFIG.MAX_ATTEMPTS,
      resetIn: secondsUntil(nowMs + CONFIG.WINDOW_MS, nowMs),
      blocked: false,
    };
  }

  if (record.blockedUntil) {
    const blockedUntilMs = record.blockedUntil.getTime();
    if (blockedUntilMs > nowMs) {
      const resetIn = secondsUntil(blockedUntilMs, nowMs);
      return {
        success: false,
        remaining: 0,
        resetIn,
        blocked: true,
        message: `登录尝试次数过多，请 ${Math.ceil(resetIn / 60)} 分钟后再试`,
      };
    }
  }

  const windowStartMs = record.firstAttemptAt.getTime();
  const windowEndsMs = windowStartMs + CONFIG.WINDOW_MS;
  if (nowMs > windowEndsMs) {
    return {
      success: true,
      remaining: CONFIG.MAX_ATTEMPTS,
      resetIn: secondsUntil(nowMs + CONFIG.WINDOW_MS, nowMs),
      blocked: false,
    };
  }

  const remaining = CONFIG.MAX_ATTEMPTS - record.count;
  if (remaining <= 0) {
    return {
      success: false,
      remaining: 0,
      resetIn: secondsUntil(windowEndsMs, nowMs),
      blocked: false,
      message: "尝试次数过多，请稍后再试",
    };
  }

  return {
    success: true,
    remaining,
    resetIn: secondsUntil(windowEndsMs, nowMs),
    blocked: false,
  };
}

/**
 * 记录登录失败
 * @param identifier 标识符（通常是 IP 地址）
 */
export async function recordFailedAttempt(identifier: string): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const now = new Date(nowMs);

  {
    const existingRows = await db
      .select()
      .from(loginRateLimits)
      .where(eq(loginRateLimits.identifier, identifier));

    const record = existingRows[0];

    // 初次记录
    if (!record) {
      await db.insert(loginRateLimits).values({
        identifier,
        count: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        blockedUntil: null,
      });

      return {
        success: true,
        remaining: CONFIG.MAX_ATTEMPTS - 1,
        resetIn: secondsUntil(nowMs + CONFIG.WINDOW_MS, nowMs),
        blocked: false,
      };
    }

    // 仍在封禁期
    if (record.blockedUntil) {
      const blockedUntilMs = record.blockedUntil.getTime();
      if (blockedUntilMs > nowMs) {
        const resetIn = secondsUntil(blockedUntilMs, nowMs);
        return {
          success: false,
          remaining: 0,
          resetIn,
          blocked: true,
          message: `登录尝试次数过多，请 ${Math.ceil(resetIn / 60)} 分钟后再试`,
        };
      }
    }

    // 封禁已过期或窗口已过期：重置窗口
    const windowStartMs = record.firstAttemptAt.getTime();
    const windowEndsMs = windowStartMs + CONFIG.WINDOW_MS;
    const shouldResetWindow = nowMs > windowEndsMs;

    if (shouldResetWindow) {
      await db
        .update(loginRateLimits)
        .set({
          count: 1,
          firstAttemptAt: now,
          lastAttemptAt: now,
          blockedUntil: null,
        })
        .where(eq(loginRateLimits.identifier, identifier));

      return {
        success: true,
        remaining: CONFIG.MAX_ATTEMPTS - 1,
        resetIn: secondsUntil(nowMs + CONFIG.WINDOW_MS, nowMs),
        blocked: false,
      };
    }

    const newCount = record.count + 1;

    // 触发封禁
    if (newCount >= CONFIG.MAX_ATTEMPTS) {
      const blockedUntilMs = nowMs + CONFIG.BLOCK_DURATION_MS;
      await db
        .update(loginRateLimits)
        .set({
          count: newCount,
          lastAttemptAt: now,
          blockedUntil: new Date(blockedUntilMs),
        })
        .where(eq(loginRateLimits.identifier, identifier));

      const resetIn = secondsUntil(blockedUntilMs, nowMs);
      return {
        success: false,
        remaining: 0,
        resetIn,
        blocked: true,
        message: `登录尝试次数过多，账户已被临时锁定 ${Math.ceil(resetIn / 60)} 分钟`,
      };
    }

    // 正常累加
    await db
      .update(loginRateLimits)
      .set({
        count: newCount,
        lastAttemptAt: now,
      })
      .where(eq(loginRateLimits.identifier, identifier));

    const remaining = CONFIG.MAX_ATTEMPTS - newCount;
    return {
      success: true,
      remaining,
      resetIn: secondsUntil(windowEndsMs, nowMs),
      blocked: false,
      message: remaining <= 2 ? `还剩 ${remaining} 次尝试机会` : undefined,
    };
  }
}

/**
 * 登录成功后清除记录
 * @param identifier 标识符
 */
export async function clearRateLimit(identifier: string): Promise<void> {
  await db.delete(loginRateLimits).where(eq(loginRateLimits.identifier, identifier));
}

/**
 * 获取客户端 IP（适用于 Next.js）
 * @param headers 请求头
 */
export function getClientIP(headers: Headers): string {
  // Cloudflare
  const cfConnectingIP = headers.get("cf-connecting-ip");
  if (cfConnectingIP) return cfConnectingIP;

  // Vercel / 通用代理
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // 取第一个 IP（最原始的客户端 IP）
    return xForwardedFor.split(",")[0].trim();
  }

  // X-Real-IP
  const xRealIP = headers.get("x-real-ip");
  if (xRealIP) return xRealIP;

  // 默认
  return "unknown";
}
