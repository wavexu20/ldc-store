import { and, eq } from "drizzle-orm";
import { db, rechargeOrders, users, walletTransactions } from "@/lib/db";

export async function handleRechargePaymentSuccess(
  rechargeNo: string,
  tradeNo: string,
  receivedCents: number
) {
  return db.transaction(async (tx) => {
    const recharge = await tx.query.rechargeOrders.findFirst({
      where: eq(rechargeOrders.rechargeNo, rechargeNo),
    });
    if (!recharge) return { found: false, success: false };
    if (recharge.amountCents !== receivedCents) return { found: true, success: false };
    if (recharge.status === "paid") return { found: true, success: true };
    if (recharge.status !== "pending" || recharge.expiredAt < new Date()) {
      return { found: true, success: false };
    }

    const [updated] = await tx.update(rechargeOrders).set({
      status: "paid",
      tradeNo,
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(rechargeOrders.id, recharge.id),
      eq(rechargeOrders.status, "pending")
    )).returning();
    if (!updated) return { found: true, success: true };

    const [walletUser] = await tx.select().from(users)
      .where(eq(users.id, recharge.userId)).for("update");
    if (!walletUser) throw new Error("充值用户不存在");
    const balanceAfterCents = walletUser.balanceCents + recharge.amountCents;
    await tx.update(users).set({ balanceCents: balanceAfterCents, updatedAt: new Date() })
      .where(eq(users.id, walletUser.id));
    await tx.insert(walletTransactions).values({
      userId: walletUser.id,
      type: "recharge",
      amountCents: recharge.amountCents,
      balanceAfterCents,
      referenceType: "recharge",
      referenceId: recharge.id,
      idempotencyKey: `recharge:${recharge.id}`,
      description: "Linux DO Credit 充值",
    }).onConflictDoNothing({ target: walletTransactions.idempotencyKey });
    return { found: true, success: true };
  });
}
