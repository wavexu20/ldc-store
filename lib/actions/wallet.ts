"use server";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, memberTransactions, rechargeOrders, users, vouchers, walletTransactions } from "@/lib/db";
import type { PaymentLaunchData } from "@/lib/payment/types";
import { createGatewayPayment } from "@/lib/payment/gateway";
import { calculateRechargeBonus, getMembershipStatus } from "@/lib/membership";
import { SECOND_FACTOR_REQUIRED_MESSAGE, requireSecondFactor } from "@/lib/security/two-factor-session";
import { getExternalStoreLinks } from "@/lib/actions/external-stores";
import { getGatewayLanguage } from "@/lib/payment/language";

const rechargeSchema = z.number().int().min(100, "最低充值 1.00").max(10_000_000, "单笔充值不能超过 100,000.00");

async function getSiteUrl() {
  const values = await headers();
  const host = values.get("host") || "localhost:3000";
  const protocol = values.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

async function getPaymentLanguage() {
  const values = await headers();
  return getGatewayLanguage(values.get("cookie"), values.get("accept-language"));
}

export async function getWalletOverview() {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") {
    return { success: false as const, message: "请先登录" };
  }
  const [user, transactions, memberHistory, spendRows, externalStoreLinks] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { balanceCents: true, bonusBalanceCents: true, pointsBalance: true, memberNo: true, email: true, name: true },
    }),
    db.query.walletTransactions.findMany({
      where: eq(walletTransactions.userId, session.user.id),
      orderBy: [desc(walletTransactions.createdAt)],
      limit: 50,
    }),
    db.query.memberTransactions.findMany({
      where: eq(memberTransactions.userId, session.user.id),
      orderBy: [desc(memberTransactions.createdAt)],
      limit: 50,
    }),
    db.all(sql`
      SELECT COALESCE(SUM(CAST(total_amount AS REAL)), 0) AS total_spent
      FROM orders
      WHERE user_id = ${session.user.id} AND status = 'completed'
    `),
    getExternalStoreLinks(),
  ]);
  if (!user) return { success: false as const, message: "账号不存在" };
  const lifetimeSpend = Number((spendRows as Array<{ total_spent?: unknown }>)[0]?.total_spent ?? 0);
  const totalSpentCents = Number.isFinite(lifetimeSpend) ? Math.max(0, Math.round(lifetimeSpend * 100)) : 0;
  return { success: true as const, user, transactions, memberHistory, membership: getMembershipStatus(totalSpentCents), externalStoreLinks };
}

export async function getCheckoutMembership() {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") return null;
  const now = new Date();
  const [member, discountVouchers] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { balanceCents: true, bonusBalanceCents: true, pointsBalance: true },
    }),
    db.query.vouchers.findMany({
      where: and(
        eq(vouchers.ownerUserId, session.user.id),
        eq(vouchers.type, "discount"),
        eq(vouchers.status, "claimed"),
        or(isNull(vouchers.expiresAt), sql`${vouchers.expiresAt} > ${now}`),
      ),
      columns: { id: true, code: true, discountAmountCents: true, minOrderCents: true, expiresAt: true },
      orderBy: [desc(vouchers.createdAt)],
    }),
  ]);
  return member ? { ...member, discountVouchers } : null;
}

export async function createRecharge(amountCents: number): Promise<{
  success: boolean;
  message: string;
  rechargeNo?: string;
  paymentForm?: PaymentLaunchData;
  requiresSecondFactor?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") return { success: false, message: "请先登录" };
  try {
    await requireSecondFactor(session.user.id);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : SECOND_FACTOR_REQUIRED_MESSAGE, requiresSecondFactor: true };
  }
  const parsed = rechargeSchema.safeParse(amountCents);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };

  const rechargeNo = `RC${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`;
  await db.insert(rechargeOrders).values({
    rechargeNo,
    userId: session.user.id,
    amountCents: parsed.data,
    bonusCents: calculateRechargeBonus(parsed.data),
    provider: "gateway",
    expiredAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  const siteUrl = await getSiteUrl();
  const paymentForm = await createGatewayPayment({
    orderId: rechargeNo,
    amount: parsed.data / 100,
    productName: "账户余额充值",
    productDescription: "Game3DTech 商城账户余额充值",
    siteUrl,
    successPath: `/account/wallet?recharge=${encodeURIComponent(rechargeNo)}&status=success`,
    cancelPath: `/account/wallet?recharge=${encodeURIComponent(rechargeNo)}&status=cancelled`,
    language: await getPaymentLanguage(),
  });
  return { success: true, message: "充值单已创建", rechargeNo, paymentForm };
}
