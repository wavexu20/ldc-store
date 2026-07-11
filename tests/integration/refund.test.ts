import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withEnv } from "@/tests/utils";
import {
  getClientRefundParams,
  getRefundMode,
  isRefundEnabled,
  refundOrder,
} from "@/lib/payment/ldc";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  (console.log as unknown as { mockRestore: () => void }).mockRestore?.();
  (console.error as unknown as { mockRestore: () => void }).mockRestore?.();
  globalThis.fetch = originalFetch;
});

describe("refund mode", () => {
  it("默认应为 client（无 proxy 配置）", async () => {
    await withEnv(
      { LDC_REFUND_MODE: undefined, LDC_PROXY_URL: undefined },
      async () => {
        expect(getRefundMode()).toBe("client");
        expect(isRefundEnabled()).toBe(true);
      }
    );
  });

  it("当存在 LDC_PROXY_URL 时应为 proxy（未显式指定 client/disabled）", async () => {
    await withEnv({ LDC_PROXY_URL: "https://proxy.example.com/api.php" }, async () => {
      expect(getRefundMode()).toBe("proxy");
      expect(isRefundEnabled()).toBe(true);
    });
  });

  it("显式 proxy 应强制使用服务端退款模式", async () => {
    await withEnv(
      { LDC_REFUND_MODE: "proxy", LDC_PROXY_URL: undefined },
      async () => {
        expect(getRefundMode()).toBe("proxy");
        expect(isRefundEnabled()).toBe(true);
      }
    );
  });

  it("显式 disabled 应禁用退款", async () => {
    await withEnv({ LDC_REFUND_MODE: "disabled" }, async () => {
      expect(getRefundMode()).toBe("disabled");
      expect(isRefundEnabled()).toBe(false);
    });
  });
});

describe("refundOrder", () => {
  it("应在 proxy 模式下请求 LDC_PROXY_URL（并移除尾部斜杠）", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 1, msg: "退款成功" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await withEnv(
      {
        LDC_CLIENT_ID: "1001",
        LDC_CLIENT_SECRET: "secret",
        LDC_PROXY_URL: "https://proxy.example.com/api.php/",
      },
      async () => {
        const result = await refundOrder("TRADE_1", "10.00");
        expect(result.code).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("https://proxy.example.com/api.php");
      }
    );
  });

  it("应使用 x-www-form-urlencoded POST 调用退款接口", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 1, msg: "退款成功" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await withEnv(
      {
        LDC_CLIENT_ID: "1001",
        LDC_CLIENT_SECRET: "secret",
        LDC_GATEWAY: "https://pay.example.com/epay",
        LDC_PROXY_URL: undefined,
      },
      async () => {
        await refundOrder("TRADE_1", "10.00");

        const call = fetchMock.mock.calls[0];
        const url = call?.[0] as string;
        const init = call?.[1] as RequestInit | undefined;

        expect(url).toBe("https://pay.example.com/epay/api.php");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        });

        // 为什么要断言 body：退款的 money 必须与原订单一致，且字段名固定（pid/key/trade_no/money）
        expect(String(init?.body)).toBe("pid=1001&key=secret&trade_no=TRADE_1&money=10.00");
      }
    );
  });

  it("client 模式下应返回前端直连所需参数（gateway 自动补齐 /epay）", async () => {
    await withEnv(
      {
        LDC_CLIENT_ID: "1001",
        LDC_CLIENT_SECRET: "secret",
        LDC_GATEWAY: "https://pay.example.com",
        LDC_REFUND_MODE: "client",
      },
      async () => {
        const params = getClientRefundParams("TRADE_1", "10.00");
        expect(params.apiUrl).toBe("https://pay.example.com/epay/api.php");
        expect(params.pid).toBe("1001");
        expect(params.key).toBe("secret");
        expect(params.trade_no).toBe("TRADE_1");
        expect(params.money).toBe("10.00");
      }
    );
  });
});
