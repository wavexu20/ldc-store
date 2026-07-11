import { describe, expect, it, vi } from "vitest";

const allMock = vi.fn();

// 避免在单元测试中读取真实 D1 Binding。
vi.mock("@/lib/db", () => ({
  db: {
    all: (...args: unknown[]) => allMock(...args),
  },
}));

// 关键：避免 drizzle-orm sql tag 依赖真实实现（这里只需要保留 strings/values 便于断言）
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

import { getCustomersSpendLeaderboard } from "@/lib/actions/customers";

describe("getCustomersSpendLeaderboard", () => {
  it("should clamp limit and map rows", async () => {
    allMock.mockResolvedValueOnce([
      {
        user_id: "u1",
        username: "tester",
        user_image: null,
        order_count: 2,
        total_spent: "10.5",
      },
    ]);

    const result = await getCustomersSpendLeaderboard({ limit: 9999 });

    expect(allMock).toHaveBeenCalledTimes(1);
    const sqlArg = allMock.mock.calls[0]?.[0] as { values?: unknown[] } | undefined;
    expect(sqlArg?.values).toContain(200);
    expect(result).toEqual([
      {
        userId: "u1",
        username: "tester",
        userImage: null,
        orderCount: 2,
        totalSpent: "10.5",
      },
    ]);
  });
});
