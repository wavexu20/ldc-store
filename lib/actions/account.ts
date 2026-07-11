"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, emailVerificationTokens, getD1Binding, oauthAccounts, users } from "@/lib/db";
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
  const tokenHash = await hashVerificationCode(email.data, code.data);
  const token = await findValidVerificationToken(userId, tokenHash);
  if (!token) return { success: false, message: "验证码无效或已过期" };

  const duplicate = await db.query.users.findFirst({
    where: and(eq(users.email, email.data), ne(users.id, userId)),
    columns: { id: true, status: true },
  });
  if (duplicate) {
    if (duplicate.status !== "active") return { success: false, message: "该邮箱账号当前不可用，请联系客服" };
    const source = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, balanceCents: true, bonusBalanceCents: true, pointsBalance: true },
    });
    if (!source || !isPlaceholderEmail(source.email)) {
      return { success: false, message: "该邮箱已绑定其他账号，请使用原账号登录" };
    }
    if (source.balanceCents !== 0 || source.bonusBalanceCents !== 0 || source.pointsBalance !== 0) {
      return { success: false, message: "两个账号都包含资产，请联系客服协助合并" };
    }

    const now = Math.floor(Date.now() / 1000);
    const d1 = getD1Binding();
    const results = await d1.batch<{ id: string }>([
      d1.prepare(`
        UPDATE oauth_accounts SET user_id = ?, updated_at = ? WHERE user_id = ? AND EXISTS (
          SELECT 1 FROM users s WHERE s.id = ? AND s.balance_cents = 0 AND s.bonus_balance_cents = 0 AND s.points_balance = 0
            AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM recharge_orders WHERE user_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE user_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM member_transactions WHERE user_id = s.id)
        )
      `).bind(duplicate.id, now, userId, userId),
      d1.prepare(`
        UPDATE support_conversations SET user_id = ?, updated_at = ? WHERE user_id = ?
          AND NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE user_id = ?)
      `).bind(duplicate.id, now, userId, userId),
      d1.prepare(`
        DELETE FROM restock_requests WHERE user_id = ?
          AND NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE user_id = ?)
          AND product_id IN (SELECT product_id FROM restock_requests WHERE user_id = ?)
      `).bind(userId, userId, duplicate.id),
      d1.prepare(`
        UPDATE restock_requests SET user_id = ? WHERE user_id = ?
          AND NOT EXISTS (SELECT 1 FROM oauth_accounts WHERE user_id = ?)
      `).bind(duplicate.id, userId, userId),
      d1.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`).bind(now, now, duplicate.id),
      d1.prepare(`
        DELETE FROM users WHERE id = ?
          AND balance_cents = 0 AND bonus_balance_cents = 0 AND points_balance = 0
          AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = ?)
          AND NOT EXISTS (SELECT 1 FROM recharge_orders WHERE user_id = ?)
          AND NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE user_id = ?)
          AND NOT EXISTS (SELECT 1 FROM member_transactions WHERE user_id = ?)
        RETURNING id
      `).bind(userId, userId, userId, userId, userId),
    ]);
    if (!results[5]?.results[0]) {
      return { success: false, message: "账号已有交易记录，请联系客服协助合并" };
    }
    return { success: true, message: "账号已合并，请重新登录", reloginRequired: true };
  }

  await db.batch([
    db.update(users).set({ email: email.data, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)),
    db.update(emailVerificationTokens).set({ consumedAt: new Date() }).where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.consumedAt))),
  ]);
  return { success: true, message: "邮箱绑定成功", reloginRequired: false };
}
