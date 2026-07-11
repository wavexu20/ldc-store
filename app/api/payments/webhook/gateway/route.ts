import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, orders } from "@/lib/db";
import { handlePaymentSuccess } from "@/lib/actions/orders";
import { handleRechargePaymentSuccess } from "@/lib/wallet-service";
import { parseWalletAmount } from "@/lib/money";
import {
  verifyGatewayWebhook,
  type GatewayWebhookPayload,
} from "@/lib/payment/gateway";
import { logger } from "@/lib/logger";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-gateway-timestamp") || "";
  const signature = request.headers.get("x-gateway-signature") || "";
  const headerEvent = request.headers.get("x-gateway-event") || "";
  if (!verifyGatewayWebhook({ rawBody, timestamp, signature })) {
    return fail("invalid signature", 401);
  }

  let payload: GatewayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GatewayWebhookPayload;
  } catch {
    return fail("invalid json");
  }
  const expectedAppId = process.env.PAYMENT_GATEWAY_APP_ID || "game3dtech";
  if (
    !payload.event_id || !payload.payment_id || !payload.client_order_id ||
    payload.app_id !== expectedAppId || payload.event !== headerEvent
  ) {
    return fail("invalid payload");
  }
  if (payload.event !== "payment.paid" || payload.status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const amount = parseWalletAmount(String(payload.amount_cny));
  if (amount === null) return fail("invalid amount");
  const receivedCents = Math.round(amount * 100);

  if (payload.client_order_id.startsWith("RC")) {
    const result = await handleRechargePaymentSuccess(
      payload.client_order_id,
      payload.payment_id,
      receivedCents
    );
    if (!result.found) return fail("recharge not found", 404);
    if (!result.success) return fail("recharge amount or state mismatch", 409);
    return NextResponse.json({ ok: true });
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.orderNo, payload.client_order_id),
    columns: { id: true, status: true, totalAmount: true, paymentMethod: true },
  });
  if (!order) return fail("order not found", 404);
  if (order.paymentMethod !== "gateway") return fail("payment method mismatch", 409);
  const expectedAmount = parseWalletAmount(order.totalAmount);
  if (expectedAmount === null || Math.round(expectedAmount * 100) !== receivedCents) {
    return fail("amount mismatch", 409);
  }
  if (order.status === "completed" || order.status === "paid") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (order.status !== "pending") return fail("order state mismatch", 409);
  const completed = await handlePaymentSuccess(payload.client_order_id, payload.payment_id);
  if (!completed) {
    logger.error({ orderNo: payload.client_order_id, paymentId: payload.payment_id }, "网关回调发货失败");
    return fail("delivery failed", 500);
  }
  return NextResponse.json({ ok: true });
}
