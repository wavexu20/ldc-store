import { describe, expect, it, vi } from "vitest";

const allMock = vi.fn();
const requireAdminMock = vi.fn();

// 避免在单元测试中读取真实 D1 Binding。
vi.mock("@/lib/db", () => ({
  db: {
    all: (...args: unknown[]) => allMock(...args),
  },
}));

vi.mock("@/lib/auth-utils", () => ({
  requireAdmin: () => requireAdminMock(),
}));

// 关键：避免 drizzle-orm sql tag 依赖真实实现（这里只需要保留 strings/values 便于断言）
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

import { getAdminCustomersPage } from "@/lib/actions/admin-customers";

describe("getAdminCustomersPage", () => {
  it("should require admin and return items/total", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "a1", role: "admin" } });

    allMock
      .mockResolvedValueOnce([
        {
          user_id: "u1",
          username: "tester",
          user_image: null,
          order_count: 3,
          total_spent: "30",
          first_paid_at: "2025-01-01T00:00:00.000Z",
          last_paid_at: "2025-01-02T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);

    const result = await getAdminCustomersPage({
      page: 2,
      pageSize: 20,
      filters: { query: "tester" },
    });

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(allMock).toHaveBeenCalledTimes(2);

    const firstCallSql = allMock.mock.calls[0]?.[0] as { values?: unknown[] } | undefined;
    // values 中会包含 whereSql(嵌套 sql 对象)、limit、offset
    expect(firstCallSql?.values).toContain(20);

    const whereSql = (firstCallSql?.values ?? []).find(
      (v): v is { type: string; values: unknown[] } =>
        typeof v === "object" && v !== null && (v as { type?: string }).type === "sql"
    );
    expect(whereSql?.values).toEqual(["%tester%", "%tester%"]);

    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      {
        userId: "u1",
        username: "tester",
        userImage: null,
        orderCount: 3,
        totalSpent: "30",
        firstPaidAt: "2025-01-01T00:00:00.000Z",
        lastPaidAt: "2025-01-02T00:00:00.000Z",
      },
    ]);
  });
});
