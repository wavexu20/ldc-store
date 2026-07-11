"use server";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, passwordResetTokens, twoFactorRecoveryCodes, users } from "@/lib/db";
import { hasVerifiedRealEmail, normalizeEmail } from "@/lib/email-address";
import { sendPasswordResetEmail } from "@/lib/email/cloudflare";
import { hashVerificationCode } from "@/lib/email/verification";
import { passwordContainsIdentity, strongPasswordSchema } from "@/lib/validations/password";
import { buildOtpAuthUrl, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/security/totp";
import { clearSecondFactorGrant, grantSecondFactor, requireSecondFactor } from "@/lib/security/two-factor-session";

async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || id === "admin") throw new Error("请先登录");
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user || user.status !== "active") throw new Error("账号不可用");
  return user;
}

const codeSchema = z.string().regex(/^\d{6}$/, "请输入 6 位验证码");
const passwordSchema = z.object({
  password: strongPasswordSchema,
  name: z.string(),
  email: z.string(),
}).superRefine((input, context) => {
  if (passwordContainsIdentity(input.password, input)) context.addIssue({ code: "custom", path: ["password"], message: "密码不能包含邮箱名前缀或昵称" });
});

export async function getSecurityOverview() {
  const user = await requireUser();
  const remainingRecoveryCodes = user.twoFactorEnabledAt
    ? await db.query.twoFactorRecoveryCodes.findMany({ where: and(eq(twoFactorRecoveryCodes.userId, user.id), isNull(twoFactorRecoveryCodes.usedAt)), columns: { id: true } })
    : [];
  return {
    success: true as const,
    email: user.email,
    hasPassword: Boolean(user.passwordHash),
    twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    recoveryCodesRemaining: remainingRecoveryCodes.length,
  };
}

export async function setAccountPassword(input: { currentPassword?: string; password: string }) {
  const user = await requireUser();
  await requireSecondFactor(user.id);
  const parsed = passwordSchema.safeParse({ password: input.password, email: user.email, name: user.name || "" });
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  if (user.passwordHash && (!input.currentPassword || !(await compare(input.currentPassword, user.passwordHash)))) {
    return { success: false, message: "当前密码不正确" };
  }
  await db.update(users).set({ passwordHash: await hash(parsed.data.password, 12), updatedAt: new Date() }).where(eq(users.id, user.id));
  return { success: true, message: user.passwordHash ? "密码已更新" : "密码已设置" };
}

export async function requestPasswordReset(emailInput: string) {
  const parsed = z.string().email().safeParse(normalizeEmail(emailInput));
  const generic = { success: true, message: "如果该邮箱可用，验证码将发送至收件箱" };
  if (!parsed.success) return generic;
  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data) });
  if (!user || !hasVerifiedRealEmail(user)) return generic;
  const latest = await db.query.passwordResetTokens.findFirst({ where: eq(passwordResetTokens.userId, user.id), orderBy: [desc(passwordResetTokens.createdAt)] });
  if (latest && Date.now() - latest.createdAt.getTime() < 60_000) return { success: false, message: "验证码发送过于频繁，请 60 秒后重试" };
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const code = String(random[0] % 1_000_000).padStart(6, "0");
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: await hashVerificationCode(user.email, code), expiresAt: new Date(Date.now() + 10 * 60_000) });
  await sendPasswordResetEmail({ to: user.email, name: user.name, code });
  return generic;
}

export async function resetPasswordWithCode(input: { email: string; code: string; password: string }) {
  const email = z.string().email("请输入有效的邮箱").safeParse(normalizeEmail(input.email));
  const code = codeSchema.safeParse(input.code);
  if (!email.success) return { success: false, message: email.error.issues[0].message };
  if (!code.success) return { success: false, message: code.error.issues[0].message };
  const user = await db.query.users.findFirst({ where: eq(users.email, email.data) });
  if (!user || !hasVerifiedRealEmail(user)) return { success: false, message: "验证码无效或已过期" };
  const password = passwordSchema.safeParse({ password: input.password, email: user.email, name: user.name || "" });
  if (!password.success) return { success: false, message: password.error.issues[0].message };
  const token = await db.query.passwordResetTokens.findFirst({ where: and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.tokenHash, await hashVerificationCode(user.email, code.data)), isNull(passwordResetTokens.consumedAt), gt(passwordResetTokens.expiresAt, new Date())) });
  if (!token) return { success: false, message: "验证码无效或已过期" };
  await db.batch([
    db.update(users).set({ passwordHash: await hash(password.data.password, 12), updatedAt: new Date() }).where(eq(users.id, user.id)),
    db.update(passwordResetTokens).set({ consumedAt: new Date() }).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.consumedAt))),
  ]);
  return { success: true, message: "密码已重置，请使用新密码登录" };
}

export async function beginTwoFactorSetup() {
  const user = await requireUser();
  if (!hasVerifiedRealEmail(user)) return { success: false, message: "请先绑定并验证真实邮箱" };
  const secret = generateTotpSecret();
  return { success: true, secret, otpauthUrl: buildOtpAuthUrl(secret, user.email) };
}

export async function enableTwoFactor(input: { secret: string; code: string }) {
  const user = await requireUser();
  if (!hasVerifiedRealEmail(user)) return { success: false, message: "请先绑定并验证真实邮箱" };
  const code = codeSchema.safeParse(input.code);
  if (!code.success) return { success: false, message: code.error.issues[0].message };
  try {
    if (!(await verifyTotp(input.secret, code.data))) return { success: false, message: "验证码不正确，请检查验证器时间" };
    const recoveryCodes = generateRecoveryCodes();
    const hashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
    await db.batch([
      db.update(users).set({ twoFactorSecret: await encryptTotpSecret(input.secret), twoFactorEnabledAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id)),
      db.delete(twoFactorRecoveryCodes).where(eq(twoFactorRecoveryCodes.userId, user.id)),
      db.insert(twoFactorRecoveryCodes).values(hashes.map((codeHash) => ({ userId: user.id, codeHash }))),
    ]);
    await grantSecondFactor(user.id);
    return { success: true, message: "二次验证已开启", recoveryCodes };
  } catch {
    return { success: false, message: "无法开启二次验证，请重新扫描二维码后重试" };
  }
}

async function verifySecondFactorCode(user: Awaited<ReturnType<typeof requireUser>>, value: string) {
  const code = value.replace(/\s/g, "");
  if (/^\d{6}$/.test(code) && user.twoFactorSecret) {
    return verifyTotp(await decryptTotpSecret(user.twoFactorSecret), code);
  }
  const hash = await hashRecoveryCode(code);
  const recovery = await db.query.twoFactorRecoveryCodes.findFirst({ where: and(eq(twoFactorRecoveryCodes.userId, user.id), eq(twoFactorRecoveryCodes.codeHash, hash), isNull(twoFactorRecoveryCodes.usedAt)) });
  if (!recovery) return false;
  await db.update(twoFactorRecoveryCodes).set({ usedAt: new Date() }).where(eq(twoFactorRecoveryCodes.id, recovery.id));
  return true;
}

export async function verifyLoginTwoFactor(value: string) {
  const user = await requireUser();
  if (!user.twoFactorEnabledAt || !user.twoFactorSecret) return { success: false, message: "该账号尚未开启二次验证" };
  try {
    if (!(await verifySecondFactorCode(user, value))) return { success: false, message: "验证码或恢复码不正确" };
    await grantSecondFactor(user.id);
    return { success: true, message: "验证成功" };
  } catch {
    return { success: false, message: "验证失败，请重试" };
  }
}

export async function disableTwoFactor(value: string) {
  const user = await requireUser();
  if (!user.twoFactorEnabledAt || !user.twoFactorSecret) return { success: false, message: "二次验证尚未开启" };
  try {
    if (!(await verifySecondFactorCode(user, value))) return { success: false, message: "验证码或恢复码不正确" };
    await db.batch([
      db.update(users).set({ twoFactorSecret: null, twoFactorEnabledAt: null, updatedAt: new Date() }).where(eq(users.id, user.id)),
      db.delete(twoFactorRecoveryCodes).where(eq(twoFactorRecoveryCodes.userId, user.id)),
    ]);
    await clearSecondFactorGrant();
    return { success: true, message: "二次验证已关闭" };
  } catch {
    return { success: false, message: "无法关闭二次验证，请重试" };
  }
}
