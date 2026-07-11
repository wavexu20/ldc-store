"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, emailVerificationTokens, oauthAccounts, users } from "@/lib/db";
import { isPlaceholderEmail, normalizeEmail } from "@/lib/email-address";
import { findValidVerificationToken, hashVerificationCode, issueEmailVerification } from "@/lib/email/verification";

const emailSchema = z.string().trim().email("请输入有效的邮箱地址").transform(normalizeEmail)
  .refine((email) => !isPlaceholderEmail(email), "请输入可接收邮件的真实邮箱");

async function currentUserId() {
  const session = await auth();
  const id = session?.user?.id;
  return id && id !== "admin" ? id : null;
}

export async function getAccountEmailStatus() {
  const userId = await currentUserId();
  if (!userId) return { success: false as const, message: "请先登录" };
  const [user, oauth] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true, emailVerifiedAt: true } }),
    db.query.oauthAccounts.findFirst({ where: eq(oauthAccounts.userId, userId), columns: { id: true } }),
  ]);
  if (!user) return { success: false as const, message: "账号不存在" };
  return { success: true as const, email: user.email, verified: Boolean(user.emailVerifiedAt) && !isPlaceholderEmail(user.email), oauth: Boolean(oauth) };
}

export async function sendBindingEmail(email: string) {
  const userId = await currentUserId();
  if (!userId) return { success: false, message: "请先登录" };
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const existing = await db.query.users.findFirst({ where: and(eq(users.email, parsed.data), ne(users.id, userId)), columns: { id: true } });
  if (existing) return { success: false, message: "该邮箱已绑定其他账号" };
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { name: true } });
  if (!user) return { success: false, message: "账号不存在" };
  try {
    await issueEmailVerification({ userId, email: parsed.data, name: user.name });
    return { success: true, message: "验证码已发送，请检查收件箱" };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "邮件发送失败" };
  }
}

export async function verifyBindingEmail(input: { email: string; code: string }) {
  const userId = await currentUserId();
  if (!userId) return { success: false, message: "请先登录" };
  const email = emailSchema.safeParse(input.email);
  const code = z.string().regex(/^\d{6}$/, "请输入 6 位数字验证码").safeParse(input.code);
  if (!email.success) return { success: false, message: email.error.issues[0].message };
  if (!code.success) return { success: false, message: code.error.issues[0].message };
  const duplicate = await db.query.users.findFirst({ where: and(eq(users.email, email.data), ne(users.id, userId)), columns: { id: true } });
  if (duplicate) return { success: false, message: "该邮箱已绑定其他账号" };
  const tokenHash = await hashVerificationCode(email.data, code.data);
  const token = await findValidVerificationToken(userId, tokenHash);
  if (!token) return { success: false, message: "验证码无效或已过期" };
  await db.batch([
    db.update(users).set({ email: email.data, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)),
    db.update(emailVerificationTokens).set({ consumedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.consumedAt))),
  ]);
  return { success: true, message: "邮箱绑定成功" };
}
