import { eq } from "drizzle-orm";
import { db, getD1Binding, rechargeOrders } from "@/lib/db";

export async function handleRechargePaymentSuccess(
  rechargeNo: string,
  tradeNo: string,
  receivedCents: number
) {
  const recharge = await db.query.rechargeOrders.findFirst({
    where: eq(rechargeOrders.rechargeNo, rechargeNo),
  });
  if (!recharge) return { found: false, success: false };
  if (recharge.amountCents !== receivedCents) return { found: true, success: false };
  if (recharge.status === "paid") return { found: true, success: true };
  if (recharge.status !== "pending" || recharge.expiredAt < new Date()) {
    return { found: true, success: false };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const idempotencyKey = `recharge:${recharge.id}`;
  const d1 = getD1Binding();
  const results = await d1.batch<{ id: string }>([
    d1.prepare(`
      UPDATE recharge_orders
      SET status = 'paid', trade_no = ?, paid_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' RETURNING id
    `).bind(tradeNo, nowEpoch, nowEpoch, recharge.id),
    d1.prepare(`
      UPDATE users SET balance_cents = balance_cents + ?, updated_at = ?
      WHERE id = ?
        AND EXISTS (SELECT 1 FROM recharge_orders WHERE id = ? AND status = 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM wallet_transactions WHERE idempotency_key = ?
        )
    `).bind(recharge.amountCents, nowEpoch, recharge.userId, recharge.id, idempotencyKey),
    d1.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, type, amount_cents, balance_after_cents,
        reference_type, reference_id, idempotency_key, description, created_at
      )
      SELECT ?, id, 'recharge', ?, balance_cents, 'recharge', ?, ?, ?, ?
      FROM users WHERE id = ?
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(
      crypto.randomUUID(), recharge.amountCents, recharge.id, idempotencyKey,
      "Linux DO Credit 充值", nowEpoch, recharge.userId
    ),
  ]);
  return { found: true, success: Boolean(results[0]?.results[0]) };
}
