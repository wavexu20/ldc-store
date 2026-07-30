import crypto from "node:crypto";
import type { PaymentLaunchData } from "@/lib/payment/types";

const DEFAULT_GATEWAY_URL = "https://pay.game3dtech.com";
const DEFAULT_APP_ID = "game3dtech";

function getConfig() {
  const baseUrl = (process.env.PAYMENT_GATEWAY_URL || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
  const appId = process.env.PAYMENT_GATEWAY_APP_ID || DEFAULT_APP_ID;
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("自有支付网关未配置：缺少 PAYMENT_GATEWAY_API_KEY");
  return { baseUrl, appId, apiKey };
}

export function isGatewayConfigured(): boolean {
  return Boolean(process.env.PAYMENT_GATEWAY_API_KEY);
}

export async function createGatewayPayment(input: {
  orderId: string;
  amount: number;
  productName: string;
  productDescription?: string;
  siteUrl: string;
  successPath: string;
  cancelPath: string;
  language?: string;
}): Promise<PaymentLaunchData> {
  const { baseUrl, appId, apiKey } = getConfig();
  const query = new URLSearchParams({
    app_id: appId,
    client_order_id: input.orderId,
    amount: input.amount.toFixed(2),
    product_name: input.productName.slice(0, 80),
    product_description: (input.productDescription || "Game3DTech 商城订单").slice(0, 180),
    success_url: new URL(input.successPath, input.siteUrl).toString(),
    cancel_url: new URL(input.cancelPath, input.siteUrl).toString(),
    lang: input.language === "zh" || input.language === "ko" ? input.language : "en",
  });
  const response = await fetch(`${baseUrl}/v1/checkout/sign?${query}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`支付网关创建收银台失败（${response.status}）`);
  }
  let data: { checkout_url?: string; app_id?: string; client_order_id?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error("支付网关返回了无效响应");
  }
  if (!data.checkout_url || data.app_id !== appId || data.client_order_id !== input.orderId) {
    throw new Error("支付网关返回的订单信息不匹配");
  }
  const checkoutUrl = new URL(data.checkout_url);
  if (checkoutUrl.origin !== new URL(baseUrl).origin || checkoutUrl.pathname !== "/checkout") {
    throw new Error("支付网关返回了不受信任的收银台地址");
  }
  return { redirectUrl: checkoutUrl.toString() };
}

export interface GatewayWebhookPayload {
  event_id: string;
  event: string;
  app_id: string;
  payment_id: string;
  client_order_id: string;
  status: string;
  provider: string;
  amount_cny: number;
  paid_at?: string | null;
  metadata?: Record<string, unknown>;
}

export function verifyGatewayWebhook(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  nowSeconds?: number;
}): boolean {
  const { apiKey } = getConfig();
  if (!/^\d{10}$/.test(input.timestamp) || !/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(input.timestamp)) > 300) return false;
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const expected = crypto
    .createHmac("sha256", apiKeyHash)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
}

export async function queryGatewayPayment(orderId: string): Promise<GatewayWebhookPayload | null> {
  const { baseUrl, appId, apiKey } = getConfig();
  const query = new URLSearchParams({ app_id: appId, client_order_id: orderId, limit: "1" });
  const response = await fetch(`${baseUrl}/v1/payments?${query}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`支付网关查单失败（${response.status}）`);
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    event_id: "query",
    event: `payment.${String(row.status || "pending")}`,
    app_id: String(row.app_id || ""),
    payment_id: String(row.id || ""),
    client_order_id: String(row.client_order_id || ""),
    status: String(row.status || "pending"),
    provider: String(row.provider || ""),
    amount_cny: Number(row.amount_cny),
    paid_at: row.paid_at ? String(row.paid_at) : null,
  };
}

export async function cancelGatewayPayment(orderId: string): Promise<{
  status: string;
  cancelled: boolean;
  canRetry: boolean;
}> {
  const { baseUrl, appId, apiKey } = getConfig();
  const response = await fetch(`${baseUrl}/v1/payments/cancel`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ app_id: appId, client_order_id: orderId }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as {
    status?: string;
    cancelled?: boolean;
    can_retry?: boolean;
    detail?: string | { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    const detail = body?.detail;
    const code = typeof detail === "object" ? detail?.code : undefined;
    const message = typeof detail === "object" ? detail?.message : detail;
    if (code === "ORDER_PAID") throw new Error("订单已经支付，不能取消");
    if (code === "CANCEL_NOT_SUPPORTED") throw new Error("当前支付渠道已生成付款单，暂时不能安全取消，请等待订单过期或联系客服");
    throw new Error(message || `支付网关取消失败（${response.status}）`);
  }
  return {
    status: body?.status || "cancelled",
    cancelled: Boolean(body?.cancelled),
    canRetry: Boolean(body?.can_retry),
  };
}
