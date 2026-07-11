"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, emailVerificationTokens, getD1Binding, oauthAccounts, users } from "@/lib/db";
import { isPlaceholderEmail, normalizeEmail } from "@/lib/email-address";
import { findValidVerificationToken, hashVerificationCode, issueEmailVerification } from "@/lib/email/verification";
import { avatarKeyFromUrl, avatarUrlForKey, getAvatarBucket } from "@/lib/avatar-storage";

const emailSchema = z.string().trim().email("请输入有效的邮箱地址").transform(normalizeEmail)
  .refine((email) => !isPlaceholderEmail(email), "请输入可接收邮件的真实邮箱");

async function currentUserId() {
  const session = await auth();
  const id = session?.user?.id;
  return id && id !== "admin" ? id : null;
}

const profileNameSchema = z.string().trim().min(2, "昵称至少 2 个字符").max(50, "昵称不能超过 50 个字符");
const avatarMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxAvatarBytes = 2 * 1024 * 1024;

function hasExpectedImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export async function updateProfile(formData: FormData) {
  const userId = await currentUserId();
  if (!userId) return { success: false, message: "请先登录" };
  const name = profileNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { success: false, message: name.error.issues[0].message };
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { success: false, message: "账号不存在" };

  const candidate = formData.get("avatar");
  const avatar = candidate instanceof File && candidate.size > 0 ? candidate : null;
  let image = user.image;
  let avatarSource = user.avatarSource;
  let uploadedKey: string | null = null;

  if (avatar) {
    const extension = avatarMimeTypes.get(avatar.type);
    if (!extension) return { success: false, message: "头像仅支持 JPG、PNG 或 WebP 图片" };
    if (avatar.size > maxAvatarBytes) return { success: false, message: "头像文件不能超过 2 MB" };
    const content = new Uint8Array(await avatar.arrayBuffer());
    if (!hasExpectedImageSignature(content, avatar.type)) return { success: false, message: "头像文件格式无效" };
    uploadedKey = `avatars/${userId}/${crypto.randomUUID()}.${extension}`;
    try {
      await getAvatarBucket().put(uploadedKey, content, { httpMetadata: { contentType: avatar.type } });
    } catch {
      return { success: false, message: "头像上传失败，请稍后重试" };
    }
    image = avatarUrlForKey(uploadedKey);
    avatarSource = "custom";
  }

  try {
    await db.update(users).set({ name: name.data, nameSource: "custom", image, avatarSource, updatedAt: new Date() }).where(eq(users.id, userId));
  } catch {
    if (uploadedKey) await getAvatarBucket().delete(uploadedKey);
    return { success: false, message: "资料保存失败，请稍后重试" };
  }

  const previousAvatarKey = uploadedKey && user.avatarSource === "custom" ? avatarKeyFromUrl(user.image) : null;
  if (previousAvatarKey) await getAvatarBucket().delete(previousAvatarKey).catch(() => undefined);
  revalidatePath("/");
  revalidatePath("/account/profile");
  return { success: true, message: "个人资料已保存", name: name.data, image };
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
