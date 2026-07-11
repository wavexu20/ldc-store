"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-utils";
import { sql } from "drizzle-orm";

export interface AdminCustomersFilters {
  query?: string;
}

export interface AdminCustomerListItem {
  userId: string;
  username: string | null;
  userImage: string | null;
  orderCount: number;
  totalSpent: string;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
}

export interface AdminCustomersPageResult {
  items: AdminCustomerListItem[];
  total: number;
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") return value;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePage(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.floor(safe));
}

function normalizePageSize(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(200, Math.max(1, Math.floor(safe)));
}

export async function getAdminCustomersPage(input: {
  page: number;
  pageSize: number;
  filters?: AdminCustomersFilters;
}): Promise<AdminCustomersPageResult> {
  await requireAdmin();

  const page = normalizePage(input.page, 1);
  const pageSize = normalizePageSize(input.pageSize, 20);
  const offset = (page - 1) * pageSize;

  const q = input.filters?.query?.trim();
  const pattern = q ? `%${q}%` : null;
  const whereSql = pattern
    ? sql`WHERE (user_id LIKE ${pattern} OR username LIKE ${pattern})`
    : sql``;

  const [itemsRows, totalRows] = await Promise.all([
    db.all(sql`
      WITH agg AS (
        SELECT
          o.user_id,
          (SELECT latest.username FROM orders latest
           WHERE latest.user_id = o.user_id ORDER BY latest.created_at DESC LIMIT 1) AS username,
          (SELECT latest.user_image FROM orders latest
           WHERE latest.user_id = o.user_id ORDER BY latest.created_at DESC LIMIT 1) AS user_image,
          COUNT(*) AS order_count,
          printf('%.2f', COALESCE(SUM(CAST(o.total_amount AS REAL)), 0)) AS total_spent,
          MIN(o.paid_at) AS first_paid_at,
          MAX(o.paid_at) AS last_paid_at
        FROM orders o
        WHERE o.status = 'completed' AND o.user_id IS NOT NULL
        GROUP BY o.user_id
      )
      SELECT user_id, username, user_image, order_count, total_spent, first_paid_at, last_paid_at
      FROM agg
      ${whereSql}
      ORDER BY CAST(total_spent AS REAL) DESC, order_count DESC, user_id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    db.all(sql`
      WITH agg AS (
        SELECT
          o.user_id,
          (SELECT latest.username FROM orders latest
           WHERE latest.user_id = o.user_id ORDER BY latest.created_at DESC LIMIT 1) AS username
        FROM orders o
        WHERE o.status = 'completed' AND o.user_id IS NOT NULL
        GROUP BY o.user_id
      )
      SELECT COUNT(*) AS count
      FROM agg
      ${whereSql}
    `),
  ]);

  const typedItems =
    (itemsRows as unknown as Array<{
      user_id: string;
      username: string | null;
      user_image: string | null;
      order_count: number;
      total_spent: string;
      first_paid_at: Date | string | null;
      last_paid_at: Date | string | null;
    }>) ?? [];

  const typedTotal =
    (totalRows as unknown as Array<{
      count: number;
    }>) ?? [];

  const total = typedTotal[0]?.count ?? 0;

  return {
    items: typedItems.map((row) => ({
      userId: row.user_id,
      username: row.username ?? null,
      userImage: row.user_image ?? null,
      orderCount: Number.isFinite(row.order_count) ? row.order_count : 0,
      totalSpent: row.total_spent ?? "0",
      firstPaidAt: toIsoString(row.first_paid_at),
      lastPaidAt: toIsoString(row.last_paid_at),
    })),
    total,
  };
}
