"use server";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export interface CustomerSpendLeaderboardItem {
  userId: string;
  username: string | null;
  userImage: string | null;
  orderCount: number;
  totalSpent: string;
}

function normalizeLimit(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(200, Math.max(1, Math.floor(safe)));
}

export async function getCustomersSpendLeaderboard(input?: {
  limit?: number;
}): Promise<CustomerSpendLeaderboardItem[]> {
  const limit = normalizeLimit(input?.limit, 50);

  const rows = await db.all(sql`
    SELECT
      o.user_id,
      (SELECT latest.username FROM orders latest
       WHERE latest.user_id = o.user_id ORDER BY latest.created_at DESC LIMIT 1) AS username,
      (SELECT latest.user_image FROM orders latest
       WHERE latest.user_id = o.user_id ORDER BY latest.created_at DESC LIMIT 1) AS user_image,
      COUNT(*) AS order_count,
      printf('%.2f', COALESCE(SUM(CAST(o.total_amount AS REAL)), 0)) AS total_spent
    FROM orders o
    WHERE o.status = 'completed' AND o.user_id IS NOT NULL
    GROUP BY o.user_id
    ORDER BY SUM(CAST(o.total_amount AS REAL)) DESC, order_count DESC, o.user_id ASC
    LIMIT ${limit}
  `);

  const typedRows =
    (rows as unknown as Array<{
      user_id: string;
      username: string | null;
      user_image: string | null;
      order_count: number;
      total_spent: string;
    }>) ?? [];

  return typedRows.map((row) => ({
    userId: row.user_id,
    username: row.username ?? null,
    userImage: row.user_image ?? null,
    orderCount: Number.isFinite(row.order_count) ? row.order_count : 0,
    totalSpent: row.total_spent ?? "0",
  }));
}
