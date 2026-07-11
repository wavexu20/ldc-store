"use server";

import { signIn } from "@/lib/auth";
import { headers } from "next/headers";
import { z } from "zod";
import { hash } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, emailVerificationTokens, users } from "@/lib/db";
import {
  findValidVerificationToken,
  hashVerificationCode,
  issueEmailVerification,
} from "@/lib/email/verification";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { passwordContainsIdentity, strongPasswordSchema } from "@/lib/validations/password";
import { createMemberNo } from "@/lib/membership";
import {
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  getClientIP,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "昵称至少 2 个字符").max(50, "昵称不能超过 50 个字符"),
  email: z.string().email("请输入有效的 Email").transform((value) => value.trim().toLowerCase()),
  password: strongPasswordSchema,
}).superRefine((data, context) => {
  if (passwordContainsIdentity(data.password, data)) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "密码不能包含邮箱名前缀或昵称",
    });
  }
});

export interface LoginResult {
  success: boolean;
  message: string;
  remaining?: number;
  blocked?: boolean;
  verificationRequired?: boolean;
  email?: string;
}

export async function registerWithEmail(input: {
  name: string;
  email: string;
  password: string;
  turnstileToken: string;
}): Promise<LoginResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const headersList = await headers();
  const turnstile = await verifyTurnstileToken({
    token: input.turnstileToken,
    remoteIp: getClientIP(headersList),
    expectedAction: "register",
  });
  if (!turnstile.success) return { success: false, message: turnstile.message };

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
    columns: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (existing?.emailVerifiedAt) return { success: false, message: "该 Email 已注册，可直接登录" };
  if (existing) {
    try {
      await issueEmailVerification({ userId: existing.id, email: existing.email, name: existing.name });
      return {
        success: true,
        message: "验证码已重新发送",
        verificationRequired: true,
        email: existing.email,
      };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "验证码发送失败" };
    }
  }

  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const id = crypto.randomUUID();
    const [created] = await db.insert(users).values({
      id,
      name: parsed.data.name,
      nameSource: "custom",
      email: parsed.data.email,
      passwordHash,
      memberNo: createMemberNo(id),
    }).returning({ id: users.id, email: users.email, name: users.name });
    await issueEmailVerification({ userId: created.id, email: created.email, name: created.name });
    return {
      success: true,
      message: "注册成功，验证码已发送",
      verificationRequired: true,
      email: created.email,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return { success: false, message: "该 Email 已注册，可直接登录" };
    console.error("Email 注册失败", error);
    return { success: false, message: "注册失败，请稍后重试" };
  }
}

const verifyEmailSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  code: z.string().regex(/^\d{6}$/, "请输入 6 位数字验证码"),
});

export async function verifyEmailCode(input: { email: string; code: string }): Promise<LoginResult> {
  const parsed = verifyEmailSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (!user) return { success: false, message: "验证码无效或已过期" };
  if (user.emailVerifiedAt) return { success: true, message: "邮箱已验证" };

  const tokenHash = await hashVerificationCode(parsed.data.email, parsed.data.code);
  const token = await findValidVerificationToken(user.id, tokenHash);
  if (!token) return { success: false, message: "验证码无效或已过期" };

  await db.batch([
    db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id)),
    db.update(emailVerificationTokens).set({ consumedAt: new Date() })
      .where(and(
        eq(emailVerificationTokens.userId, user.id),
        isNull(emailVerificationTokens.consumedAt)
      )),
  ]);
  return { success: true, message: "邮箱验证成功" };
}

export async function resendEmailVerification(email: string): Promise<LoginResult> {
  const normalized = z.string().email().safeParse(email.trim().toLowerCase());
  if (!normalized.success) return { success: false, message: "请输入有效的 Email" };
  const user = await db.query.users.findFirst({ where: eq(users.email, normalized.data) });
  if (!user || user.emailVerifiedAt) {
    return { success: true, message: "如果该邮箱需要验证，验证码将会发送" };
  }
  try {
    await issueEmailVerification({ userId: user.id, email: user.email, name: user.name });
    return { success: true, message: "验证码已发送" };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "验证码发送失败" };
  }
}

/**
 * 管理员密码登录（带速率限制）
 */
export async function adminLogin(password: string): Promise<LoginResult> {
  // 获取客户端 IP
  const headersList = await headers();
  const clientIP = getClientIP(headersList);

  // 检查速率限制
  const rateLimit = await checkRateLimit(clientIP);
  if (!rateLimit.success) {
    return {
      success: false,
      message: rateLimit.message || "请求过于频繁，请稍后再试",
      remaining: rateLimit.remaining,
      blocked: rateLimit.blocked,
    };
  }

  // 验证输入
  const parsed = loginSchema.safeParse({ password });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    // 尝试登录
    const result = await signIn("credentials", {
      password: parsed.data.password,
      redirect: false,
    });

    // signIn 成功时不会返回 error
    if (result?.error) {
      // 登录失败，记录失败尝试
      const failResult = await recordFailedAttempt(clientIP);
      
      let message = "密码错误";
      if (failResult.blocked) {
        message = failResult.message || "登录尝试次数过多，请稍后再试";
      } else if (failResult.remaining !== undefined && failResult.remaining <= 2) {
        message = `密码错误，还剩 ${failResult.remaining} 次尝试机会`;
      }

      return {
        success: false,
        message,
        remaining: failResult.remaining,
        blocked: failResult.blocked,
      };
    }

    // 登录成功，清除速率限制记录
    await clearRateLimit(clientIP);

    return {
      success: true,
      message: "登录成功",
    };
  } catch (error) {
    // NextAuth 登录失败会抛出错误
    const failResult = await recordFailedAttempt(clientIP);

    let message = "密码错误";
    if (failResult.blocked) {
      message = failResult.message || "登录尝试次数过多，请稍后再试";
    } else if (failResult.remaining !== undefined && failResult.remaining <= 2) {
      message = `密码错误，还剩 ${failResult.remaining} 次尝试机会`;
    }

    // 检查是否是凭证错误
    if (error instanceof Error && error.message.includes("CredentialsSignin")) {
      return {
        success: false,
        message,
        remaining: failResult.remaining,
        blocked: failResult.blocked,
      };
    }

    console.error("登录错误:", error);
    return {
      success: false,
      message: "登录失败，请稍后再试",
    };
  }
}
