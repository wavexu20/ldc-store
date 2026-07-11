import { describe, expect, it, vi } from "vitest";

// 通过 mock db + LDC 查询结果，覆盖“notify 未到时的补偿查询发货”链路。

const ldcMocks = vi.hoisted(() => ({
  queryPaymentOrder: vi.fn(),
}));

vi.mock("@/lib/payment/ldc", () => ({
  createPayment: vi.fn(),
  refundOrder: vi.fn(),
  isRefundEnabled: vi.fn(),
  getRefundMode: vi.fn(),
  getClientRefundParams: vi.fn(),
  queryPaymentOrder: (...args: unknown[]) => ldcMocks.queryPaymentOrder(...args),
}));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/actions/system-settings", () => ({
  getSystemSettings: vi.fn(),
  getTelegramConfigWithToggles: async () => ({}),
}));

vi.mock("@/lib/notifications/telegram", () => ({
  sendNewOrderNotification: vi.fn(),
  sendPaymentSuccessNotification: vi.fn(),
  sendOrderExpiredNotification: vi.fn(),
  sendOrderExpiredSummaryNotification: vi.fn(),
  sendRefundRequestNotification: vi.fn(),
  sendRefundApprovedNotification: vi.fn(),
  sendRefundRejectedNotification: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getRequestIdFromHeaders: async () => "rid",
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  sql: (...args: unknown[]) => ({ type: "sql", args }),
  desc: (arg: unknown) => ({ type: "desc", arg }),
  inArray: (...args: unknown[]) => ({ type: "inArray", args }),
}));

const dbState = {
  status: "pending" as "pending" | "completed",
  tradeNo: null as string | null,
  cards: [{ id: "c1", content: "CARD-001", status: "locked" as "locked" | "sold" }],
};

vi.mock("@/lib/db", () => {
  const orders = { orderNo: {}, userId: {}, status: {} };
  const cards = { orderId: {} };
  const products = { id: {}, salesCount: {} };

  const db = {
    query: {
      orders: {
        findFirst: vi.fn(async () => ({
          id: "o1",
          orderNo: "ORDER_1",
          userId: "u1",
          status: dbState.status,
          paymentMethod: "ldc",
          totalAmount: "10.00",
          productName: "商品 A",
          quantity: 1,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          paidAt: dbState.status === "completed" ? new Date("2026-01-01T00:01:00.000Z") : null,
          productId: null,
          cards: dbState.cards,
        })),
      },
      products: {
        findFirst: vi.fn(async () => ({ slug: "product-slug" })),
      },
    },
  };
  const statement = { bind: vi.fn(() => statement) };
  const d1 = {
    prepare: vi.fn(() => statement),
    batch: vi.fn(async () => {
      dbState.status = "completed";
      dbState.tradeNo = "TRADE_1";
      dbState.cards = dbState.cards.map((c) => ({ ...c, status: "sold" }));
      return [{ results: [] }, { results: [] }, { results: [{ id: "o1" }] }];
    }),
  };

  return { db, orders, cards, products, getD1Binding: () => d1 };
});

import { getOrderByNo } from "@/lib/actions/orders";

describe("getOrderByNo - payment compensation", () => {
  it("should sync LDC paid status when order is pending", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "u1", provider: "linux-do" },
    });

    ldcMocks.queryPaymentOrder.mockResolvedValueOnce({
      code: 1,
      msg: "ok",
      trade_no: "TRADE_1",
      out_trade_no: "ORDER_1",
      type: "epay",
      pid: "1001",
      addtime: "2026-01-01 00:00:00",
      endtime: "2026-01-01 00:01:00",
      name: "商品 A",
      money: "10.00",
      status: 1,
    });

    const result = await getOrderByNo("ORDER_1");
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("completed");
    expect(result.data?.cards).toEqual(["CARD-001"]);
  });
});
