import { eq } from "drizzle-orm";
import { db, getD1Binding, orders } from "@/lib/db";
import { calculatePointsEarned } from "@/lib/membership";

export async function awardOrderPoints(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order?.userId || order.status !== "completed") return false;
  const paidCents = Math.round(Number(order.totalAmount) * 100);
  const points = order.pointsEarned || calculatePointsEarned(paidCents);
  if (points <= 0) return true;
  const now = Math.floor(Date.now() / 1000);
  const key = `points:reward:${order.id}`;
  const d1 = getD1Binding();
  await d1.batch([
    d1.prepare(`
      UPDATE users SET points_balance = points_balance + ?, updated_at = ?
      WHERE id = ? AND NOT EXISTS (SELECT 1 FROM member_transactions WHERE idempotency_key = ?)
    `).bind(points, now, order.userId, key),
    d1.prepare(`
      INSERT INTO member_transactions
        (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at)
      SELECT ?,id,'points','purchase_reward',?,points_balance,'order',?,?,?,?
      FROM users WHERE id = ? ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(crypto.randomUUID(), points, order.id, key, `订单 ${order.orderNo} 消费积分`, now, order.userId),
    d1.prepare(`UPDATE orders SET points_earned = ?, updated_at = ? WHERE id = ?`).bind(points, now, order.id),
  ]);
  return true;
}

export async function reverseExternalOrderPoints(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order?.userId || order.pointsEarned <= 0) return;
  const now = Math.floor(Date.now() / 1000);
  const key = `points:refund:${order.id}`;
  const d1 = getD1Binding();
  await d1.batch([
    d1.prepare(`UPDATE users SET points_balance = points_balance - ?, updated_at = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM member_transactions WHERE idempotency_key = ?)`).bind(order.pointsEarned, now, order.userId, key),
    d1.prepare(`INSERT INTO member_transactions (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at) SELECT ?,id,'points','refund',?,points_balance,'order',?,?,?,? FROM users WHERE id = ? ON CONFLICT(idempotency_key) DO NOTHING`).bind(crypto.randomUUID(), -order.pointsEarned, order.id, key, `订单 ${order.orderNo} 退款扣回积分`, now, order.userId),
  ]);
}
