"use server";

import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, memberTransactions, rechargeOrders, users, walletTransactions } from "@/lib/db";
import type { PaymentLaunchData } from "@/lib/payment/types";
import { createGatewayPayment } from "@/lib/payment/gateway";
import { calculateRechargeBonus } from "@/lib/membership";

const rechargeSchema = z.number().int().min(100, "最低充值 1.00").max(10_000_000, "单笔充值不能超过 100,000.00");

async function getSiteUrl() {
  const values = await headers();
  const host = values.get("host") || "localhost:3000";
  const protocol = values.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

export async function getWalletOverview() {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") {
    return { success: false as const, message: "请先登录" };
  }
  const [user, transactions, memberHistory] = await Promise.all([
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
  ]);
  if (!user) return { success: false as const, message: "账号不存在" };
  return { success: true as const, user, transactions, memberHistory };
}

export async function getCheckoutMembership() {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") return null;
  return db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { balanceCents: true, bonusBalanceCents: true, pointsBalance: true },
  });
}

export async function createRecharge(amountCents: number): Promise<{
  success: boolean;
  message: string;
  rechargeNo?: string;
  paymentForm?: PaymentLaunchData;
}> {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") return { success: false, message: "请先登录" };
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
  });
  return { success: true, message: "充值单已创建", rechargeNo, paymentForm };
}
