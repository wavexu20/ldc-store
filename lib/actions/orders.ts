"use server";

/**
 * 订单相关 Server Actions
 *
 * 时区策略说明：
 * - 所有时间使用 JavaScript Date 对象（内部为 UTC 时间戳）
 * - D1 时间字段使用 Unix 秒时间戳，以 UTC 语义存储
 * - 过期判断使用显式 Unix 时间戳参数，确保批处理内口径一致
 * - 前端显示时浏览器自动转换为用户本地时区
 */

import { db, getD1Binding, orders, cards, products, productVariants, users, vouchers } from "@/lib/db";
import { eq, and, desc, inArray, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { after } from "next/server";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validations/order";
import {
  createPayment,
  refundOrder,
  isRefundEnabled,
  getRefundMode,
  getClientRefundParams,
  queryPaymentOrder,
  type RefundMode,
  type ClientRefundParams,
} from "@/lib/payment/ldc";
import type { PaymentLaunchData } from "@/lib/payment/types";
import { cancelGatewayPayment, createGatewayPayment, queryGatewayPayment } from "@/lib/payment/gateway";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { getExpireTime } from "@/lib/time";
import { getSystemSettings, getTelegramConfigWithToggles } from "@/lib/actions/system-settings";
import { logger, getRequestIdFromHeaders } from "@/lib/logger";
import { parseWalletAmount } from "@/lib/money";
import { calculatePointsEarned, calculatePointsRedemption, splitBalancePayment } from "@/lib/membership";
import { awardOrderPoints, reverseExternalOrderPoints } from "@/lib/member-service";
import { getFulfillmentDueAt, isManualFulfillment } from "@/lib/fulfillment";
import { getGatewayLanguage } from "@/lib/payment/language";
import { isSecondFactorVerificationRequired, SECOND_FACTOR_REQUIRED_MESSAGE, requireSecondFactor } from "@/lib/security/two-factor-session";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { normalizeEmail } from "@/lib/email-address";
import { createGuestOrderAccessToken, hashGuestOrderAccessToken, verifyGuestOrderAccessToken } from "@/lib/order-access";
import { sendGuestOrderCreatedEmail, sendGuestOrderDeliveryEmail } from "@/lib/email/cloudflare";
import {
  sendNewOrderNotification,
  sendPaymentSuccessNotification,
  sendRefundRequestNotification,
  sendRefundApprovedNotification,
  sendRefundRejectedNotification,
  type NewOrderNotificationPayload,
  type PaymentSuccessNotificationPayload,
  type RefundRequestNotificationPayload,
  type RefundApprovedNotificationPayload,
  type RefundRejectedNotificationPayload,
} from "@/lib/notifications/telegram";

/**
 * 从请求头自动获取网站 URL
 */
async function getSiteUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

async function getPaymentLanguage() {
  const requestHeaders = await headers();
  return getGatewayLanguage(requestHeaders.get("cookie"), requestHeaders.get("accept-language"));
}

// 生成订单号: 时间戳 + 随机字符
function generateOrderNo(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = nanoid(6).toUpperCase();
  return `LD${timestamp}${random}`;
}

export interface CreateOrderResult {
  success: boolean;
  message: string;
  orderNo?: string;
  paymentForm?: PaymentLaunchData;
  requiresSecondFactor?: boolean;
  guestAccessToken?: string;
}

/**
 * 创建订单
 * 1. 验证账号或游客联系方式
 * 2. 验证输入
 * 3. 检查库存
 * 4. 创建订单并锁定卡密（使用事务）
 * 5. 调用支付接口获取支付链接
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const requestId = await getRequestIdFromHeaders();
  const log = logger.child({ requestId, action: "createOrder" });

  // 1. 识别登录用户或游客。游客只能使用在线支付，并需通过邮箱与 Turnstile 验证。
  const session = await auth();
  const user = session?.user as { id?: string; username?: string; image?: string; provider?: string } | undefined;

  // 2. 验证输入
  const validationResult = createOrderSchema.safeParse(input);
  if (!validationResult.success) {
    log.warn({ issues: validationResult.error.issues }, "创建订单参数校验失败");
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  if (user?.id === "admin") {
    return { success: false, message: "管理员账号不能创建前台订单" };
  }

  const isGuest = !user?.id;
  const userId = user?.id ?? null;
  const guestEmail = isGuest && validationResult.data.email
    ? normalizeEmail(validationResult.data.email)
    : null;

  if (isGuest) {
    if (!guestEmail || !validationResult.data.turnstileToken) {
      return { success: false, message: "填写接收订单通知的邮箱并完成人机验证后即可购买" };
    }
    if (validationResult.data.paymentMethod !== "gateway") {
      return { success: false, message: "游客订单仅支持在线支付，登录后可使用余额、积分和优惠券" };
    }
    if (validationResult.data.usePoints || validationResult.data.voucherId) {
      return { success: false, message: "积分和优惠券仅限登录账号使用" };
    }
    const requestHeaders = await headers();
    const turnstile = await verifyTurnstileToken({
      token: validationResult.data.turnstileToken,
      remoteIp: requestHeaders.get("cf-connecting-ip") || undefined,
      expectedAction: "guest_checkout",
    });
    if (!turnstile.success) return { success: false, message: turnstile.message };
  }

  if (userId) {
    try {
      await requireSecondFactor(userId);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : SECOND_FACTOR_REQUIRED_MESSAGE, requiresSecondFactor: true };
    }
  }

  const { productId, variantId, quantity, paymentMethod, usePoints, voucherId } = validationResult.data;

  try {
    log.info({ userId, guestEmail, productId, quantity, paymentMethod }, "开始创建订单");

    // 2.1 释放过期订单，确保库存准确（懒加载策略）
    await releaseExpiredOrders();
    
    // 2.2 获取商品信息
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.isActive, true)),
    });

    if (!product) {
      return { success: false, message: "商品不存在或已下架" };
    }

    const activeVariants = await db.query.productVariants.findMany({
      where: and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)),
      orderBy: [productVariants.sortOrder],
    });
    const selectedVariant = variantId ? activeVariants.find((variant) => variant.id === variantId) : null;
    if (activeVariants.length > 0 && !selectedVariant) return { success: false, message: "请选择有效的商品规格" };
    if (activeVariants.length === 0 && variantId) return { success: false, message: "该商品当前不支持规格选择" };
    const cardVariantCondition = selectedVariant ? eq(cards.variantId, selectedVariant.id) : isNull(cards.variantId);
    const unitPrice = selectedVariant?.price ?? product.price;
    const variantLabel = selectedVariant ? ` · ${selectedVariant.name}` : "";

    // 验证购买数量限制
    if (quantity < product.minQuantity || quantity > product.maxQuantity) {
      return {
        success: false,
        message: `购买数量需在 ${product.minQuantity} - ${product.maxQuantity} 之间`,
      };
    }

    const { orderExpireMinutes } = await getSystemSettings();

    const manualFulfillment = isManualFulfillment(product.fulfillmentMode);
    const availableCards = manualFulfillment
      ? []
      : await db
          .select({ id: cards.id })
          .from(cards)
          .where(and(eq(cards.productId, productId), cardVariantCondition, eq(cards.status, "available")))
          .limit(quantity);
    if (!manualFulfillment && availableCards.length < quantity) {
      throw new Error(`库存不足，当前仅剩 ${availableCards.length} 件`);
    }

    const cardIds = availableCards.map((card) => card.id);
    const orderId = crypto.randomUUID();
    const walletTransactionId = crypto.randomUUID();
    const orderNo = generateOrderNo();
    const guestAccessToken = isGuest ? createGuestOrderAccessToken() : undefined;
    const guestAccessHash = guestAccessToken
      ? await hashGuestOrderAccessToken(orderNo, guestAccessToken)
      : null;
    const totalAmount = parseFloat(unitPrice) * quantity;
    const totalCents = Math.round(totalAmount * 100);
    const createdAt = new Date();
    const expiredAt = getExpireTime(orderExpireMinutes);
    const createdEpoch = Math.floor(createdAt.getTime() / 1000);
    const expiredEpoch = Math.floor(expiredAt.getTime() / 1000);
    const placeholders = cardIds.length > 0 ? cardIds.map(() => "?").join(", ") : "NULL";
    const selectedVoucher = userId && voucherId
      ? await db.query.vouchers.findFirst({ where: eq(vouchers.id, voucherId) })
      : null;
    if (voucherId) {
      if (!selectedVoucher || selectedVoucher.type !== "discount" || selectedVoucher.status !== "claimed" || selectedVoucher.ownerUserId !== userId) {
        throw new Error("所选满减券不可用，请重新选择");
      }
      if (selectedVoucher.expiresAt && selectedVoucher.expiresAt <= new Date()) {
        throw new Error("所选满减券已过期");
      }
      if (totalCents < selectedVoucher.minOrderCents) {
        throw new Error(`该满减券需满 ¥${(selectedVoucher.minOrderCents / 100).toFixed(2)} 才可使用`);
      }
    }
    const voucherDiscountCents = selectedVoucher ? Math.min(totalCents, selectedVoucher.discountAmountCents) : 0;
    const afterVoucherCents = totalCents - voucherDiscountCents;
    const isVoucherOnly = Boolean(selectedVoucher && afterVoucherCents === 0);
    const effectivePaymentMethod = isVoucherOnly ? "voucher" : paymentMethod;
    if (paymentMethod === "voucher" && !isVoucherOnly) throw new Error("卡券支付方式不可用");
    const isBalance = effectivePaymentMethod === "balance";
    const isImmediatePayment = isBalance || effectivePaymentMethod === "voucher";
    const member = isBalance ? await db.query.users.findFirst({
      where: eq(users.id, userId!),
      columns: { balanceCents: true, bonusBalanceCents: true, pointsBalance: true },
    }) : null;
    if (isBalance && !member) throw new Error("账号不存在");
    const redemption = isBalance && usePoints
      ? calculatePointsRedemption(afterVoucherCents, member?.pointsBalance || 0)
      : { points: 0, discountCents: 0 };
    const payableCents = afterVoucherCents - redemption.discountCents;
    const split = isBalance ? splitBalancePayment(payableCents, member?.balanceCents || 0, member?.bonusBalanceCents || 0) : null;
    if (isBalance && !split) throw new Error("账户余额不足，请先充值");
    const cashSpentCents = split?.cashSpentCents || 0;
    const bonusSpentCents = split?.bonusSpentCents || 0;
    const pointsEarned = calculatePointsEarned(payableCents);
    const initialStatus = isImmediatePayment
      ? manualFulfillment ? "paid" : "completed"
      : "pending";
    const initialDueAt = isImmediatePayment
      ? getFulfillmentDueAt(product.fulfillmentMode, createdAt)
      : null;
    const initialDueEpoch = initialDueAt ? Math.floor(initialDueAt.getTime() / 1000) : null;
    const initialFulfilledEpoch = isImmediatePayment && !manualFulfillment ? createdEpoch : null;
    const stockGuardSql = manualFulfillment
      ? "1 = 1"
      : `(SELECT COUNT(*) FROM cards
          WHERE product_id = ? AND ${selectedVariant ? "variant_id = ?" : "variant_id IS NULL"} AND status = 'available' AND id IN (${placeholders})
        ) = ?`;
    const stockGuardBinds = manualFulfillment
      ? []
      : [productId, ...(selectedVariant ? [selectedVariant.id] : []), ...cardIds, quantity];
    const d1 = getD1Binding();

    const statements = [
      d1.prepare(`
        INSERT INTO orders (
          id, order_no, product_id, product_variant_id, product_variant_name, product_name, product_price, quantity,
          total_amount, original_amount, cash_spent_cents, bonus_spent_cents, points_redeemed, points_earned,
          payment_method, status, fulfillment_mode, trade_no, user_id, username,
          user_image, email, query_password, paid_at, delivery_due_at, fulfilled_at, expired_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ${stockGuardSql}
        AND (? <> 'balance' OR EXISTS (
          SELECT 1 FROM users WHERE id = ? AND balance_cents >= ? AND bonus_balance_cents >= ? AND points_balance >= ?
        ))
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM vouchers WHERE id = ? AND type = 'discount' AND status = 'claimed' AND owner_user_id = ?
        ))
        RETURNING id, order_no
      `).bind(
        orderId, orderNo, productId, selectedVariant?.id ?? null, selectedVariant?.name ?? null, product.name, unitPrice, quantity,
        (payableCents / 100).toFixed(2), totalAmount.toFixed(2), cashSpentCents, bonusSpentCents, redemption.points, pointsEarned,
        effectivePaymentMethod,
        initialStatus, product.fulfillmentMode,
        isImmediatePayment ? `${effectivePaymentMethod.toUpperCase()}-${orderNo}` : null,
        userId, user?.username ?? null, user?.image ?? null, guestEmail, guestAccessHash,
        isImmediatePayment ? createdEpoch : null, initialDueEpoch, initialFulfilledEpoch, expiredEpoch, createdEpoch, createdEpoch,
        ...stockGuardBinds, effectivePaymentMethod, userId, cashSpentCents, bonusSpentCents, redemption.points,
        voucherId ?? null, voucherId ?? "", userId
      ),
      d1.prepare(`
        UPDATE cards SET status = ?, order_id = ?, locked_at = ?, sold_at = ?
        WHERE ? = 'auto' AND product_id = ? AND ${selectedVariant ? "variant_id = ?" : "variant_id IS NULL"} AND status = 'available'
          AND id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(
        isImmediatePayment ? "sold" : "locked", orderId,
        isImmediatePayment ? null : createdEpoch, isImmediatePayment ? createdEpoch : null,
        product.fulfillmentMode,
        productId, ...(selectedVariant ? [selectedVariant.id] : []), ...cardIds, orderId
      ),
      d1.prepare(`
        UPDATE vouchers
        SET status = CASE WHEN ? = 1 THEN 'redeemed' ELSE 'reserved' END,
            owner_user_id = ?, order_id = ?, redeemed_at = CASE WHEN ? = 1 THEN ? ELSE NULL END
        WHERE id = ? AND type = 'discount' AND status = 'claimed' AND owner_user_id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(isImmediatePayment ? 1 : 0, userId, orderId, isImmediatePayment ? 1 : 0, isImmediatePayment ? createdEpoch : null, voucherId ?? "", userId, orderId),
      d1.prepare(`
        UPDATE users
        SET balance_cents = balance_cents - ?, bonus_balance_cents = bonus_balance_cents - ?,
            points_balance = points_balance - ?, updated_at = ?
        WHERE id = ? AND ? = 'balance'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(cashSpentCents, bonusSpentCents, redemption.points, createdEpoch, userId, effectivePaymentMethod, orderId),
      d1.prepare(`
        INSERT INTO wallet_transactions (
          id, user_id, type, amount_cents, balance_after_cents,
          reference_type, reference_id, idempotency_key, description, created_at
        )
        SELECT ?, id, 'purchase', ?, balance_cents, 'order', ?, ?, ?, ?
        FROM users
        WHERE id = ? AND ? = 'balance'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
        ON CONFLICT(idempotency_key) DO NOTHING
        `).bind(
        walletTransactionId, -cashSpentCents, orderId, `purchase:${orderId}`,
        `购买 ${product.name}${variantLabel}`, createdEpoch, userId, effectivePaymentMethod, orderId
      ),
      d1.prepare(`
        INSERT INTO member_transactions (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at)
        SELECT ?,id,'bonus','purchase',?,bonus_balance_cents,'order',?,?,?,? FROM users
        WHERE id = ? AND ? = 'balance' AND ? > 0 AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
        ON CONFLICT(idempotency_key) DO NOTHING
      `).bind(crypto.randomUUID(), -bonusSpentCents, orderId, `bonus:purchase:${orderId}`, `购买 ${product.name}${variantLabel}`, createdEpoch, userId, effectivePaymentMethod, bonusSpentCents, orderId),
      d1.prepare(`
        INSERT INTO member_transactions (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at)
        SELECT ?,id,'points','purchase',?,points_balance,'order',?,?,?,? FROM users
        WHERE id = ? AND ? = 'balance' AND ? > 0 AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
        ON CONFLICT(idempotency_key) DO NOTHING
      `).bind(crypto.randomUUID(), -redemption.points, orderId, `points:purchase:${orderId}`, `订单 ${orderNo} 积分抵扣`, createdEpoch, userId, effectivePaymentMethod, redemption.points, orderId),
      d1.prepare(`
        UPDATE products SET sales_count = sales_count + ?, updated_at = ?
        WHERE id = ? AND ? = 1
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(quantity, createdEpoch, productId, isImmediatePayment ? 1 : 0, orderId),
    ];
    const [insertResult] = await d1.batch<{ id: string; order_no: string }>(statements);
    if (!insertResult.results[0]) {
      throw new Error("库存或余额已发生变化，请刷新后重试");
    }
    const result = {
      order: { orderNo, createdAt, expiredAt },
      totalAmount: payableCents / 100,
    };
    if (isImmediatePayment) await awardOrderPoints(orderId);

    // 4. 刷新页面缓存，确保库存显示准确
    revalidatePath("/");
    revalidatePath(`/product/${product.slug}`);

    // 5. 为外部支付创建托管收银台链接。
    let paymentForm: PaymentLaunchData | undefined;
    const siteUrl = await getSiteUrl();
    if (effectivePaymentMethod === "gateway" || effectivePaymentMethod === "ldc") {
      try {
        paymentForm = effectivePaymentMethod === "gateway"
          ? await createGatewayPayment({
              orderId: result.order.orderNo,
              amount: result.totalAmount,
              productName: `${product.name}${variantLabel}`,
              productDescription: product.description || undefined,
              siteUrl,
              successPath: `/order/result?out_trade_no=${encodeURIComponent(result.order.orderNo)}${guestAccessToken ? `&access_token=${encodeURIComponent(guestAccessToken)}` : ""}`,
              cancelPath: `/order/result?out_trade_no=${encodeURIComponent(result.order.orderNo)}&cancelled=1${guestAccessToken ? `&access_token=${encodeURIComponent(guestAccessToken)}` : ""}`,
              language: await getPaymentLanguage(),
            })
          : createPayment(result.order.orderNo, result.totalAmount, `${product.name}${variantLabel}`, siteUrl);
      } catch (error) {
        // 支付接口调用失败，但订单已创建
        log.error(
          { err: error, orderNo: result.order.orderNo, userId, guestEmail },
          "创建支付链接失败（订单已创建）"
        );
        return {
          success: true,
          message: "订单创建成功，但支付链接生成失败，请稍后重试支付",
          orderNo: result.order.orderNo,
        };
      }
    }

    log.info(
      {
        orderNo: result.order.orderNo,
        userId,
        guestEmail,
        productId, variantId: selectedVariant?.id,
        quantity,
        totalAmount: result.totalAmount,
        paymentMethod: effectivePaymentMethod,
      },
      "订单创建成功"
    );

    // 触发新订单通知
    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: NewOrderNotificationPayload = {
          orderNo: result.order.orderNo,
          productName: `${product.name}${variantLabel}`,
          quantity,
          totalAmount: result.totalAmount.toFixed(2),
          paymentMethod: effectivePaymentMethod,
          username: user?.username || guestEmail,
          createdAt: result.order.createdAt,
          expiredAt: result.order.expiredAt!,
        };
        await sendNewOrderNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 新订单通知发送失败:", e);
      }
    });

    if (guestEmail && guestAccessToken) {
      after(async () => {
        try {
          const accessUrl = new URL("/order/result", siteUrl);
          accessUrl.searchParams.set("out_trade_no", result.order.orderNo);
          accessUrl.searchParams.set("access_token", guestAccessToken);
          await sendGuestOrderCreatedEmail({
            to: guestEmail,
            orderNo: result.order.orderNo,
            productName: `${product.name}${variantLabel}`,
            amount: result.totalAmount.toFixed(2),
            accessUrl: accessUrl.toString(),
          });
        } catch (error) {
          log.error({ err: error, orderNo: result.order.orderNo }, "游客订单邮件发送失败");
        }
      });
    }

    return {
      success: true,
      message: "订单创建成功",
      orderNo: result.order.orderNo,
      paymentForm,
      guestAccessToken,
    };
  } catch (error) {
    log.error(
      { err: error, userId, guestEmail, productId, quantity, paymentMethod },
      "创建订单失败"
    );
    return {
      success: false,
      message: error instanceof Error ? error.message : "创建订单失败，请稍后重试",
    };
  }
}

/**
 * 处理支付成功回调
 * 1. 更新订单状态
 * 2. 更新卡密状态为已售出
 * 3. 更新商品销量
 */
export async function handlePaymentSuccess(
  orderNo: string,
  tradeNo: string
): Promise<boolean> {
  try {
    const log = logger.child({ action: "handlePaymentSuccess", orderNo, tradeNo });
    let productSlug: string | null = null;

    const pendingOrder = await db.query.orders.findFirst({
      where: and(eq(orders.orderNo, orderNo), eq(orders.status, "pending")),
    });
    if (!pendingOrder) throw new Error("订单不存在或已处理");
    const nowEpoch = Math.floor(Date.now() / 1000);
    const paidAt = new Date();
    const manualFulfillment = isManualFulfillment(pendingOrder.fulfillmentMode);
    const deliveryDueAt = getFulfillmentDueAt(pendingOrder.fulfillmentMode, paidAt);
    const deliveryDueEpoch = deliveryDueAt ? Math.floor(deliveryDueAt.getTime() / 1000) : null;
    const d1 = getD1Binding();
    const statements = [
      d1.prepare(`
        UPDATE cards SET status = 'sold', sold_at = ?
        WHERE ? = 'auto' AND order_id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(nowEpoch, pendingOrder.fulfillmentMode, pendingOrder.id, pendingOrder.id),
      d1.prepare(`
        UPDATE products SET sales_count = sales_count + ?, updated_at = ?
        WHERE id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(pendingOrder.quantity, nowEpoch, pendingOrder.productId, pendingOrder.id),
      d1.prepare(`
        UPDATE vouchers SET status = 'redeemed', redeemed_at = ?
        WHERE order_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(nowEpoch, pendingOrder.id, pendingOrder.id),
      d1.prepare(`
        UPDATE orders
        SET status = ?, trade_no = ?, paid_at = ?, delivery_due_at = ?, fulfilled_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
        RETURNING id
      `).bind(
        manualFulfillment ? "paid" : "completed",
        tradeNo,
        nowEpoch,
        deliveryDueEpoch,
        manualFulfillment ? null : nowEpoch,
        nowEpoch,
        pendingOrder.id
      ),
    ];
    const batchResult = await d1.batch<{ id: string }>(statements);
    if (!batchResult[3]?.results[0]) throw new Error("订单不存在或已处理");
    await awardOrderPoints(pendingOrder.id);
    const result = {
      ...pendingOrder,
      status: manualFulfillment ? "paid" as const : "completed" as const,
      tradeNo,
      paidAt,
    };
    if (pendingOrder.productId) {
      const product = await db.query.products.findFirst({
        where: eq(products.id, pendingOrder.productId),
        columns: { slug: true },
      });
      productSlug = product?.slug || null;
    }

    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    revalidatePath("/");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: PaymentSuccessNotificationPayload = {
          orderNo: result.orderNo,
          productName: result.productName,
          quantity: result.quantity,
          totalAmount: result.totalAmount,
          paymentMethod: result.paymentMethod,
          username: result.username,
          paidAt: result.paidAt!,
          tradeNo,
        };
        await sendPaymentSuccessNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 支付成功通知发送失败:", e);
      }
    });

    if (result.email && !manualFulfillment) {
      after(async () => {
        try {
          const deliveredCards = await db.query.cards.findMany({
            where: and(eq(cards.orderId, result.id), eq(cards.status, "sold")),
            columns: { content: true },
          });
          if (deliveredCards.length > 0) {
            await sendGuestOrderDeliveryEmail({
              to: result.email!,
              orderNo: result.orderNo,
              productName: result.productVariantName ? `${result.productName} · ${result.productVariantName}` : result.productName,
              cards: deliveredCards.map((card) => card.content),
              orderUrl: `https://game3dtech.com/order/result?out_trade_no=${encodeURIComponent(result.orderNo)}`,
            });
          }
        } catch (error) {
          log.error({ err: error }, "游客自动发货邮件发送失败");
        }
      });
    }

    log.info("支付成功回调处理完成");
    return true;
  } catch (error) {
    logger.error({ err: error, action: "handlePaymentSuccess", orderNo, tradeNo }, "处理支付成功回调失败");
    return false;
  }
}

/**
 * 释放过期订单的锁定卡密
 * 采用懒加载策略：在关键操作时自动调用
 *
 * 时区一致性说明：
 * - 订单创建时 expiredAt 使用 JavaScript Date（UTC 时间戳）
 * - D1 以 Unix 秒时间戳存储（UTC 语义）
 * - 过期检查使用同一次调用生成的时间参数
 * - 这确保了无论服务器部署在哪个时区，过期判断都是准确的
 */
export async function releaseExpiredOrders(): Promise<number> {
  try {
    const expiredOrdersData = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, "pending"), lt(orders.expiredAt, new Date())));
    if (expiredOrdersData.length > 0) {
      const orderIds = expiredOrdersData.map((order) => order.id);
      await db.batch([
        db
          .update(cards)
          .set({ status: "available", orderId: null, lockedAt: null })
          .where(and(eq(cards.status, "locked"), inArray(cards.orderId, orderIds))),
        db
          .update(orders)
          .set({ status: "expired", updatedAt: new Date() })
          .where(
            and(
              eq(orders.status, "pending"),
              inArray(orders.id, orderIds),
            lt(orders.expiredAt, new Date())
          )
        ),
        db
          .update(vouchers)
          .set({ status: "claimed", orderId: null })
          .where(and(eq(vouchers.status, "reserved"), inArray(vouchers.orderId, orderIds))),
      ]);
    }

    if (expiredOrdersData.length > 0) {
      revalidatePath("/admin/orders");
      revalidatePath("/");
      logger.info({ action: "releaseExpiredOrders", expiredOrders: expiredOrdersData.length }, "释放过期订单完成");
    }
    return expiredOrdersData.length;
  } catch (error) {
    logger.error({ err: error, action: "releaseExpiredOrders" }, "释放过期订单失败");
    return 0;
  }
}

/**
 * 管理员手动完成订单
 */
export async function adminCompleteOrder(
  orderId: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    let productSlug: string | null = null;

    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!order) throw new Error("订单不存在");
    const nowEpoch = Math.floor(Date.now() / 1000);
    const d1 = getD1Binding();
    const results = await d1.batch<{ id: string }>([
      d1.prepare(`
        UPDATE cards SET status = 'sold', sold_at = ?
        WHERE order_id = ? AND EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND status IN ('pending', 'paid')
        )
      `).bind(nowEpoch, orderId, orderId),
      d1.prepare(`
        UPDATE products SET sales_count = sales_count + ?, updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND status IN ('pending', 'paid')
        )
      `).bind(order.quantity, nowEpoch, order.productId, orderId),
      d1.prepare(`
        UPDATE vouchers SET status = 'redeemed', redeemed_at = ?
        WHERE order_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status IN ('pending', 'paid'))
      `).bind(nowEpoch, orderId, orderId),
      d1.prepare(`
        UPDATE orders SET status = 'completed', paid_at = ?, admin_remark = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'paid') AND fulfillment_mode = 'auto' RETURNING id
      `).bind(nowEpoch, adminRemark ?? null, nowEpoch, orderId),
    ]);
    if (!results[3]?.results[0]) throw new Error("订单状态不允许手动完成");
    await awardOrderPoints(orderId);
    if (order.productId) {
      const product = await db.query.products.findFirst({
        where: eq(products.id, order.productId),
        columns: { slug: true },
      });
      productSlug = product?.slug || null;
    }

    // 刷新页面缓存
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    revalidatePath("/");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }
    return { success: true, message: "订单已完成" };
  } catch (error) {
    console.error("手动完成订单失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "操作失败",
    };
  }
}

/**
 * 人工发货：每个非空行作为一条卡密交付记录，并一次性完成订单。
 */
export async function adminFulfillManualOrder(
  orderId: string,
  deliveryContent: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const normalizedOrderId = orderId.trim();
  const deliveryItems = deliveryContent
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!normalizedOrderId) return { success: false, message: "订单 ID 无效" };
  if (deliveryItems.length === 0) return { success: false, message: "请填写发货内容" };
  if (deliveryItems.some((item) => item.length > 1000)) {
    return { success: false, message: "单条发货内容不能超过 1000 个字符" };
  }
  if (deliveryContent.length > 20_000) {
    return { success: false, message: "发货内容过长" };
  }

  try {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, normalizedOrderId),
      columns: {
        id: true,
        orderNo: true,
        productId: true,
        productVariantId: true,
        productName: true,
        quantity: true,
        status: true,
        fulfillmentMode: true,
        email: true,
      },
    });
    if (!order) throw new Error("订单不存在");
    if (order.status !== "paid" || !isManualFulfillment(order.fulfillmentMode)) {
      throw new Error("仅已支付的人工发货订单可以执行此操作");
    }
    if (!order.productId) throw new Error("商品已删除，无法写入发货记录");
    if (deliveryItems.length !== order.quantity) {
      throw new Error(`该订单购买 ${order.quantity} 件，请填写 ${order.quantity} 行发货内容`);
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const d1 = getD1Binding();
    const statements = deliveryItems.map((content) =>
      d1.prepare(`
        INSERT INTO cards (id, product_id, variant_id, content, status, order_id, sold_at, created_at)
        SELECT ?, ?, ?, ?, 'sold', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND status = 'paid' AND fulfillment_mode <> 'auto'
        )
      `).bind(
        crypto.randomUUID(),
        order.productId,
        order.productVariantId,
        content,
        order.id,
        nowEpoch,
        nowEpoch,
        order.id
      )
    );
    statements.push(
      d1.prepare(`
        UPDATE orders
        SET status = 'completed', fulfilled_at = ?, admin_remark = ?, updated_at = ?
        WHERE id = ? AND status = 'paid' AND fulfillment_mode <> 'auto'
        RETURNING id
      `).bind(nowEpoch, adminRemark?.trim() || null, nowEpoch, order.id)
    );
    const results = await d1.batch<{ id: string }>(statements);
    if (!results.at(-1)?.results[0]) throw new Error("订单已被处理，请刷新后重试");

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${order.id}`);
    revalidatePath("/order/my");
    if (order.email) {
      after(async () => {
        try {
          await sendGuestOrderDeliveryEmail({
            to: order.email!,
            orderNo: order.orderNo,
            productName: order.productName,
            cards: deliveryItems,
            orderUrl: `https://game3dtech.com/order/result?out_trade_no=${encodeURIComponent(order.orderNo)}`,
          });
        } catch (error) {
          logger.error({ err: error, action: "adminFulfillManualOrder", orderNo: order.orderNo }, "游客人工发货邮件发送失败");
        }
      });
    }
    return { success: true, message: "发货成功，用户已可查看卡密" };
  } catch (error) {
    console.error("人工发货失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "发货失败，请稍后重试",
    };
  }
}

async function authorizeOrderAccess(
  order: { orderNo: string; userId: string | null; queryPassword: string | null },
  accessToken?: string | null
): Promise<{ authorized: boolean; userId: string | null }> {
  const session = await auth();
  const sessionUser = session?.user as { id?: string } | undefined;
  const userId = sessionUser?.id && sessionUser.id !== "admin" ? sessionUser.id : null;
  if (userId && order.userId === userId) return { authorized: true, userId };
  if (!order.userId && await verifyGuestOrderAccessToken({
    orderNo: order.orderNo,
    token: accessToken,
    expectedHash: order.queryPassword,
  })) {
    return { authorized: true, userId: null };
  }
  return { authorized: false, userId };
}

export async function resumePendingOrderPayment(
  orderNo: string,
  accessToken?: string
): Promise<{ success: boolean; message: string; paymentForm?: PaymentLaunchData }> {
  const normalizedOrderNo = orderNo.trim();
  if (!normalizedOrderNo) return { success: false, message: "订单号无效" };

  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.orderNo, normalizedOrderNo) });
    if (!order) return { success: false, message: "订单不存在" };
    const access = await authorizeOrderAccess(order, accessToken);
    if (!access.authorized) return { success: false, message: "订单访问凭证无效" };
    if (order.status !== "pending") return { success: false, message: "该订单当前不需要支付" };
    if (order.expiredAt && order.expiredAt <= new Date()) {
      await releaseExpiredOrders();
      return { success: false, message: "订单已过期，库存已经释放，请重新下单" };
    }

    const siteUrl = await getSiteUrl();
    const amount = Number(order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: "订单金额无效" };
    const paymentForm = order.paymentMethod === "gateway"
      ? await createGatewayPayment({
          orderId: order.orderNo,
          amount,
          productName: order.productVariantName ? `${order.productName} · ${order.productVariantName}` : order.productName,
          siteUrl,
          successPath: `/order/result?out_trade_no=${encodeURIComponent(order.orderNo)}${accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ""}`,
          cancelPath: `/order/result?out_trade_no=${encodeURIComponent(order.orderNo)}&cancelled=1${accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ""}`,
          language: await getPaymentLanguage(),
        })
      : order.paymentMethod === "ldc"
        ? createPayment(order.orderNo, amount, order.productName, siteUrl)
        : undefined;
    if (!paymentForm) return { success: false, message: "该支付方式不支持重新发起付款" };
    return { success: true, message: "正在打开支付页面", paymentForm };
  } catch (error) {
    logger.error({ err: error, action: "resumePendingOrderPayment", orderNo: normalizedOrderNo }, "重新发起订单支付失败");
    return { success: false, message: error instanceof Error ? error.message : "重新支付失败，请稍后重试" };
  }
}

export async function cancelPendingOrder(
  orderNo: string,
  accessToken?: string
): Promise<{ success: boolean; message: string }> {
  const normalizedOrderNo = orderNo.trim();
  if (!normalizedOrderNo) return { success: false, message: "订单号无效" };

  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.orderNo, normalizedOrderNo) });
    if (!order) return { success: false, message: "订单不存在" };
    const access = await authorizeOrderAccess(order, accessToken);
    if (!access.authorized) return { success: false, message: "订单访问凭证无效" };
    if (order.status !== "pending") return { success: false, message: "只有待支付订单可以取消" };

    if (order.paymentMethod === "gateway") {
      await cancelGatewayPayment(order.orderNo);
    } else if (order.paymentMethod === "ldc") {
      return { success: false, message: "该历史支付方式无法安全取消，请等待订单自动过期" };
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const d1 = getD1Binding();
    const results = await d1.batch<{ id: string }>([
      d1.prepare(`
        UPDATE cards SET status = 'available', order_id = NULL, locked_at = NULL
        WHERE order_id = ? AND status = 'locked'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(order.id, order.id),
      d1.prepare(`
        UPDATE vouchers SET status = 'claimed', order_id = NULL
        WHERE order_id = ? AND status = 'reserved'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(order.id, order.id),
      d1.prepare(`
        UPDATE orders SET status = 'cancelled', updated_at = ?
        WHERE id = ? AND status = 'pending' RETURNING id
      `).bind(nowEpoch, order.id),
    ]);
    if (!results[2]?.results[0]) return { success: false, message: "订单已被处理，请刷新后重试" };
    revalidatePath("/");
    revalidatePath("/order/my");
    revalidatePath(`/order/result?out_trade_no=${encodeURIComponent(order.orderNo)}`);
    revalidatePath("/admin/orders");
    return { success: true, message: "订单已取消，锁定库存已经释放" };
  } catch (error) {
    logger.error({ err: error, action: "cancelPendingOrder", orderNo: normalizedOrderNo }, "取消待支付订单失败");
    return { success: false, message: error instanceof Error ? error.message : "取消订单失败，请稍后重试" };
  }
}

/**
 * 获取当前登录用户的历史订单
 */
export async function getUserOrders() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; username?: string; provider?: string } | undefined;

    if (!user?.id || user.id === "admin") {
      return { success: false, message: "请先登录", data: [] };
    }

    const deliveryLocked = await isSecondFactorVerificationRequired(user.id);

    const userOrders = await db.query.orders.findMany({
      where: eq(orders.userId, user.id),
      with: {
        cards: {
          columns: {
            id: true,
            content: true,
            status: true,
          },
        },
      },
      orderBy: [desc(orders.createdAt)],
    });

    const ordersWithCards = userOrders.map((order) => {
      // 仅当订单已完成时才显示卡密
      const cardsToShow =
        order.status === "completed" || order.status === "paid"
          ? order.cards.filter((c) => c.status === "sold")
          : [];

      return {
        orderNo: order.orderNo,
        productName: order.productName,
        quantity: order.quantity,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        fulfillmentMode: order.fulfillmentMode,
        deliveryDueAt: order.deliveryDueAt,
        fulfilledAt: order.fulfilledAt,
        expiredAt: order.expiredAt,
        cards: deliveryLocked ? [] : cardsToShow.map((c) => c.content),
        deliveryLocked: deliveryLocked && cardsToShow.length > 0,
      };
    });

    return {
      success: true,
      data: ordersWithCards,
    };
  } catch (error) {
    console.error("获取用户订单失败:", error);
    return {
      success: false,
      message: "获取订单失败，请稍后重试",
      data: [],
    };
  }
}

/**
 * 根据订单号获取订单详情（需验证用户身份）
 */
export async function getOrderByNo(orderNo: string, accessToken?: string) {
  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "getOrderByNo", orderNo });

    function toCents(value: string): number | null {
      const amount = parseWalletAmount(value);
      if (amount === null) return null;
      return Math.round(amount * 100);
    }

    const fetchOrder = () =>
      db.query.orders.findFirst({
        where: eq(orders.orderNo, orderNo),
        with: {
          cards: {
            columns: {
              id: true,
              content: true,
              status: true,
            },
          },
        },
      });

    let order = await fetchOrder();

    if (!order) {
      return { success: false, message: "订单不存在" };
    }
    const access = await authorizeOrderAccess(order, accessToken);
    if (!access.authorized) return { success: false, message: "订单不存在或访问凭证无效" };
    const deliveryLocked = access.userId
      ? await isSecondFactorVerificationRequired(access.userId)
      : false;

    // notify 可能因为网络/平台重试失败而迟迟未到；这里做一次“按需补偿查询”。
    // 回调延迟时主动查单补偿，仍会校验订单号与金额后才允许发货。
    if (order.status === "pending" && order.paymentMethod === "gateway") {
      try {
        const gatewayOrder = await queryGatewayPayment(order.orderNo);
        if (
          gatewayOrder?.status === "paid" &&
          gatewayOrder.client_order_id === order.orderNo &&
          Math.round(gatewayOrder.amount_cny * 100) === Math.round(Number(order.totalAmount) * 100)
        ) {
          await handlePaymentSuccess(order.orderNo, gatewayOrder.payment_id);
          order = await db.query.orders.findFirst({
            where: eq(orders.orderNo, orderNo),
            with: { cards: true },
          }) ?? order;
        }
      } catch (error) {
        log.warn({ err: error }, "自有支付网关补偿查单失败");
      }
    } else if (order.status === "pending" && order.paymentMethod === "ldc") {
      try {
        const remote = await queryPaymentOrder({ outTradeNo: order.orderNo });
        if (remote && Number(remote.status) === 1) {
          const expectedCents = toCents(order.totalAmount);
          const receivedCents = toCents(remote.money);

          if (expectedCents === null || receivedCents === null || expectedCents !== receivedCents) {
            log.warn(
              {
                expected: order.totalAmount,
                received: remote.money,
                remoteTradeNo: remote.trade_no,
              },
              "支付结果补偿查询金额不匹配"
            );
          } else {
            const ok = await handlePaymentSuccess(order.orderNo, remote.trade_no);
            if (!ok) {
              log.warn(
                { remoteTradeNo: remote.trade_no },
                "支付结果补偿查询触发 handlePaymentSuccess 失败（可能已被并发处理）"
              );
            }
            // 无论 handlePaymentSuccess 返回值如何，都再读一次数据库确认最新状态（兼容并发 notify）。
            const refreshed = await fetchOrder();
            if (refreshed) {
              order = refreshed;
            }
          }
        }
      } catch (error) {
        // 兜底：查询失败不阻塞用户查单（仍可等待 notify 或稍后刷新）。
        log.warn({ err: error }, "支付结果补偿查询失败");
      }
    }

    // 仅当订单已完成时才显示卡密
    const cardsToShow =
      order.status === "completed" || order.status === "paid"
        ? order.cards.filter((c) => c.status === "sold")
        : [];

    return {
      success: true,
      data: {
        orderNo: order.orderNo,
        productName: order.productName,
        quantity: order.quantity,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        fulfillmentMode: order.fulfillmentMode,
        deliveryDueAt: order.deliveryDueAt,
        fulfilledAt: order.fulfilledAt,
        expiredAt: order.expiredAt,
        cards: deliveryLocked ? [] : cardsToShow.map((c) => c.content),
        deliveryLocked: deliveryLocked && cardsToShow.length > 0,
      },
    };
  } catch (error) {
    console.error("获取订单详情失败:", error);
    return {
      success: false,
      message: "获取订单失败，请稍后重试",
    };
  }
}

export interface OrderReceiptData {
  orderNo: string;
  productName: string;
  totalAmount: string;
  paidAt: Date | null;
  username: string | null;
}

/**
 * 获取订单“支付成功凭证”数据（用于分享/客服核验）
 *
 * 为什么这样做：
 * - 用户想分享给客服/对外时，只需要最小字段集合即可，避免误分享卡密等敏感信息
 * - 仅允许已支付/已完成订单生成凭证，减少“未支付却展示成功”的误导
 * - 分享链接会包含 orderNo，因此强制登录后才允许查看，降低被滥用的风险
 */
export async function getOrderReceiptByNo(
  orderNo: string
): Promise<{ success: boolean; message?: string; data?: OrderReceiptData }> {
  const requestId = await getRequestIdFromHeaders();
  const log = logger.child({ requestId, action: "getOrderReceiptByNo", orderNo });

  try {
    const session = await auth();
    const user = session?.user as { id?: string; provider?: string } | undefined;

    if (!user?.id || user.id === "admin") {
      log.warn("未登录用户尝试获取支付成功凭证");
      return { success: false, message: "请先登录" };
    }

    const normalizedOrderNo = orderNo?.trim();
    if (!normalizedOrderNo) {
      return { success: false, message: "订单号无效" };
    }

    // 为什么这样做：将“订单不存在/未支付/无权访问”等情况统一为同一类失败结果，避免泄露订单存在性细节。
    const order = await db.query.orders.findFirst({
      where: and(
        eq(orders.orderNo, normalizedOrderNo),
        eq(orders.userId, user.id),
        inArray(orders.status, ["paid", "completed"])
      ),
      columns: {
        orderNo: true,
        productName: true,
        totalAmount: true,
        paidAt: true,
        username: true,
      },
    });

    if (!order) {
      log.warn({ userId: user.id }, "订单不存在或未完成支付，无法生成支付成功凭证");
      return { success: false, message: "订单不存在或未完成支付" };
    }

    const username = order.username?.trim() ? order.username.trim() : null;

    return {
      success: true,
      message: "获取成功",
      data: {
        orderNo: order.orderNo,
        productName: order.productName,
        totalAmount: order.totalAmount,
        paidAt: order.paidAt,
        username,
      },
    };
  } catch (error) {
    log.error({ err: error }, "获取支付成功凭证失败");
    return { success: false, message: "获取凭证失败，请稍后重试" };
  }
}

/**
 * 用户申请退款
 * 仅已完成的订单可以申请退款
 * 需要配置 LDC_PROXY_URL 才能使用退款功能
 */
export async function requestRefund(
  orderNo: string,
  reason: string
): Promise<{ success: boolean; message: string; requiresSecondFactor?: boolean }> {
  const requestId = await getRequestIdFromHeaders();
  const log = logger.child({ requestId, action: "requestRefund", orderNo });

  // 检查退款功能是否启用
  if (!isRefundEnabled()) {
    return { success: false, message: "退款功能未启用" };
  }

  try {
    const session = await auth();
    const user = session?.user as { id?: string; provider?: string } | undefined;

    if (!user?.id || user.id === "admin") {
      log.warn("未登录用户尝试申请退款");
      return { success: false, message: "请先登录" };
    }

    try {
      await requireSecondFactor(user.id);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : SECOND_FACTOR_REQUIRED_MESSAGE, requiresSecondFactor: true };
    }

    if (!reason || reason.trim().length < 5) {
      log.warn({ userId: user.id }, "退款原因校验失败");
      return { success: false, message: "请填写退款原因（至少5个字符）" };
    }

    // 查找订单并验证所有权
    const order = await db.query.orders.findFirst({
      where: and(
        eq(orders.orderNo, orderNo),
        eq(orders.userId, user.id)
      ),
    });

    if (!order) {
      log.warn({ userId: user.id }, "申请退款订单不存在或无权访问");
      return { success: false, message: "订单不存在或无权访问" };
    }

    // 检查订单状态
    if (order.status !== "completed") {
      log.warn({ userId: user.id, status: order.status }, "订单状态不允许申请退款");
      return { success: false, message: "仅已完成的订单可以申请退款" };
    }

    // 更新订单状态为退款审核中
    await db
      .update(orders)
      .set({
        status: "refund_pending",
        refundReason: reason.trim(),
        refundRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    revalidatePath("/order/my");
    revalidatePath("/admin/orders");

    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: RefundRequestNotificationPayload = {
          orderNo: order.orderNo,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          username: order.username,
          tradeNo: order.tradeNo,
          refundReason: reason.trim(),
          refundRequestedAt: new Date(),
        };
        await sendRefundRequestNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 退款申请通知发送失败:", e);
      }
    });

    log.info({ userId: user.id, orderId: order.id }, "退款申请已提交");
    return { success: true, message: "退款申请已提交，请等待审核" };
  } catch (error) {
    log.error({ err: error }, "申请退款失败");
    return {
      success: false,
      message: error instanceof Error ? error.message : "申请退款失败，请稍后重试",
    };
  }
}

/**
 * 管理员审批退款 - 通过
 * 调用 LDC 退款接口完成退款
 * 需要配置 LDC_PROXY_URL 才能使用退款功能
 */
export async function approveRefund(
  orderId: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "approveRefund", orderId });

    // 获取订单信息
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      log.warn("审批退款：订单不存在");
      return { success: false, message: "订单不存在" };
    }

    if (order.status !== "refund_pending") {
      log.warn({ status: order.status, orderNo: order.orderNo }, "审批退款：订单状态不允许");
      return { success: false, message: "该订单不在退款审核中" };
    }

    if (order.paymentMethod === "balance") {
      if (!order.userId) return { success: false, message: "余额订单缺少用户信息" };
      const cashRefundCents = order.originalAmount === null
        ? Math.round(parseFloat(order.totalAmount) * 100)
        : order.cashSpentCents;
      const bonusRefundCents = order.bonusSpentCents;
      const pointsDelta = order.pointsRedeemed - order.pointsEarned;
      const nowEpoch = Math.floor(Date.now() / 1000);
      const idempotencyKey = `refund:${order.id}`;
      const d1 = getD1Binding();
      const results = await d1.batch<{ id: string }>([
        d1.prepare(`
          UPDATE orders
          SET status = 'refunded', admin_remark = ?, refunded_at = ?, updated_at = ?
          WHERE id = ? AND status = 'refund_pending' RETURNING id
        `).bind(
          adminRemark || "退款已原路退回账户余额",
          nowEpoch,
          nowEpoch,
          order.id
        ),
        d1.prepare(`
          UPDATE users SET balance_cents = balance_cents + ?, updated_at = ?
          WHERE id = ?
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunded')
            AND NOT EXISTS (
              SELECT 1 FROM wallet_transactions WHERE idempotency_key = ?
            )
        `).bind(cashRefundCents, nowEpoch, order.userId, order.id, idempotencyKey),
        d1.prepare(`
          UPDATE users SET bonus_balance_cents = bonus_balance_cents + ?, points_balance = points_balance + ?, updated_at = ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunded')
            AND NOT EXISTS (SELECT 1 FROM member_transactions WHERE idempotency_key = ?)
        `).bind(bonusRefundCents, pointsDelta, nowEpoch, order.userId, order.id, `benefits:refund:${order.id}`),
        d1.prepare(`
          INSERT INTO wallet_transactions (
            id, user_id, type, amount_cents, balance_after_cents,
            reference_type, reference_id, idempotency_key, description, created_at
          )
          SELECT ?, id, 'refund', ?, balance_cents, 'order', ?, ?, ?, ?
          FROM users WHERE id = ?
            AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunded')
          ON CONFLICT(idempotency_key) DO NOTHING
        `).bind(
          crypto.randomUUID(), cashRefundCents, order.id, idempotencyKey,
          `订单 ${order.orderNo} 退款`, nowEpoch, order.userId, order.id
        ),
        d1.prepare(`
          INSERT INTO member_transactions (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at)
          SELECT ?,id,'bonus','refund',?,bonus_balance_cents,'order',?,?,?,? FROM users WHERE id = ?
          ON CONFLICT(idempotency_key) DO NOTHING
        `).bind(crypto.randomUUID(), bonusRefundCents, order.id, `benefits:refund:${order.id}`, `订单 ${order.orderNo} 退回奖励金`, nowEpoch, order.userId),
        d1.prepare(`
          INSERT INTO member_transactions (id,user_id,asset,type,amount,balance_after,reference_type,reference_id,idempotency_key,description,created_at)
          SELECT ?,id,'points','refund',?,points_balance,'order',?,?,?,? FROM users WHERE id = ? AND ? <> 0
          ON CONFLICT(idempotency_key) DO NOTHING
        `).bind(crypto.randomUUID(), pointsDelta, order.id, `points:refund:${order.id}`, `订单 ${order.orderNo} 退款积分冲正`, nowEpoch, order.userId, pointsDelta),
        d1.prepare(`
          UPDATE cards SET status = 'refunded'
          WHERE order_id = ? AND EXISTS (
            SELECT 1 FROM orders WHERE id = ? AND status = 'refunded'
          )
        `).bind(order.id, order.id),
      ]);
      if (!results[0]?.results[0]) {
        return { success: false, message: "该退款已处理或订单状态已变化" };
      }
      revalidatePath("/admin/orders");
      revalidatePath("/order/my");
      revalidatePath("/account/wallet");
      log.info({ orderNo: order.orderNo }, "余额退款成功");
      return { success: true, message: "退款已退回用户余额" };
    }

    if (order.paymentMethod === "gateway") {
      return {
        success: false,
        message: "自有支付网关暂未提供自动退款接口，请先在支付平台后台完成原路退款，再处理该申请",
      };
    }

    // 外部支付退款才依赖 LDC 退款模式；余额退款始终可以在本地完成。
    if (!isRefundEnabled()) {
      return { success: false, message: "外部支付退款功能未启用" };
    }

    if (!order.tradeNo) {
      log.error({ orderNo: order.orderNo }, "审批退款：缺少 tradeNo");
      return { success: false, message: "订单缺少支付流水号，无法退款" };
    }

    // 调用 LDC 退款接口
    const refundResult = await refundOrder(order.tradeNo, order.totalAmount);

    if (refundResult.code !== 1) {
      log.error(
        { refundCode: refundResult.code, refundMsg: refundResult.msg, orderNo: order.orderNo },
        "LDC 退款接口返回错误"
      );
      return { 
        success: false, 
        message: `退款失败: ${refundResult.msg || "支付平台返回错误"}` 
      };
    }

    // 更新订单状态
    await db
      .update(orders)
      .set({
        status: "refunded",
        adminRemark: adminRemark || "退款已通过",
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    await reverseExternalOrderPoints(orderId);

    // 退款后将卡密标记为 refunded（保留 orderId、soldAt 用于溯源）
    // 仅管理员可通过"重新上架"清空关联并改为 available
    await db
      .update(cards)
      .set({
        status: "refunded",
      })
      .where(eq(cards.orderId, orderId));

    revalidatePath("/admin/orders");
    revalidatePath("/order/my");

    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: RefundApprovedNotificationPayload = {
          orderNo: order.orderNo,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          username: order.username,
          tradeNo: order.tradeNo,
          refundedAt: new Date(),
          adminRemark: adminRemark || null,
        };
        await sendRefundApprovedNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 退款成功通知发送失败:", e);
      }
    });

    log.info({ orderNo: order.orderNo, tradeNo: order.tradeNo }, "退款成功");
    return { success: true, message: "退款成功" };
  } catch (error) {
    logger.error({ err: error, action: "approveRefund", orderId }, "审批退款失败");
    return {
      success: false,
      message: error instanceof Error ? error.message : "退款操作失败",
    };
  }
}

/**
 * 管理员审批退款 - 拒绝
 */
export async function rejectRefund(
  orderId: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "rejectRefund", orderId });

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      log.warn("拒绝退款：订单不存在");
      return { success: false, message: "订单不存在" };
    }

    if (order.status !== "refund_pending") {
      log.warn({ status: order.status, orderNo: order.orderNo }, "拒绝退款：订单状态不允许");
      return { success: false, message: "该订单不在退款审核中" };
    }

    // 更新订单状态为已拒绝，并恢复为已完成状态
    await db
      .update(orders)
      .set({
        status: "refund_rejected",
        adminRemark: adminRemark || "退款申请已拒绝",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    revalidatePath("/admin/orders");
    revalidatePath("/order/my");

    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: RefundRejectedNotificationPayload = {
          orderNo: order.orderNo,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          username: order.username,
          refundReason: order.refundReason,
          adminRemark: adminRemark || null,
        };
        await sendRefundRejectedNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 退款拒绝通知发送失败:", e);
      }
    });

    log.info({ orderNo: order.orderNo }, "已拒绝退款申请");
    return { success: true, message: "已拒绝退款申请" };
  } catch (error) {
    logger.error({ err: error, action: "rejectRefund", orderId }, "拒绝退款失败");
    return {
      success: false,
      message: error instanceof Error ? error.message : "操作失败",
    };
  }
}

/**
 * 获取退款订单列表（管理员）
 */
export async function getRefundOrders() {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限", data: [] };
  }

  try {
    const refundOrders = await db.query.orders.findMany({
      where: eq(orders.status, "refund_pending"),
      orderBy: [desc(orders.refundRequestedAt)],
    });

    return {
      success: true,
      data: refundOrders,
    };
  } catch (error) {
    console.error("获取退款订单失败:", error);
    return {
      success: false,
      message: "获取退款订单失败",
      data: [],
    };
  }
}

/**
 * 获取退款功能是否启用
 * 前端根据此状态决定是否显示退款相关按钮
 */
export async function getRefundEnabled(): Promise<boolean> {
  return isRefundEnabled();
}

/**
 * 获取退款模式
 */
export async function getOrderRefundMode(): Promise<RefundMode> {
  return getRefundMode();
}

/**
 * 获取客户端退款所需的参数
 * 用于客户端模式下，前端直接调用 LDC API
 */
export async function getClientRefundData(
  orderId: string
): Promise<{ 
  success: boolean; 
  message: string; 
  data?: ClientRefundParams;
}> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const mode = getRefundMode();
  if (mode !== 'client') {
    return { success: false, message: "当前不是客户端退款模式" };
  }

  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "getClientRefundData", orderId });

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      log.warn("获取客户端退款参数：订单不存在");
      return { success: false, message: "订单不存在" };
    }

    if (order.status !== "refund_pending") {
      log.warn({ status: order.status, orderNo: order.orderNo }, "获取客户端退款参数：订单状态不允许");
      return { success: false, message: "该订单不在退款审核中" };
    }

    if (!order.tradeNo) {
      log.error({ orderNo: order.orderNo }, "获取客户端退款参数：缺少 tradeNo");
      return { success: false, message: "订单缺少支付流水号，无法退款" };
    }

    const params = getClientRefundParams(order.tradeNo, order.totalAmount);
    log.info({ orderNo: order.orderNo }, "获取客户端退款参数成功");
    return { success: true, message: "获取成功", data: params };
  } catch (error) {
    logger.error({ err: error, action: "getClientRefundData", orderId }, "获取客户端退款参数失败");
    return {
      success: false,
      message: error instanceof Error ? error.message : "获取退款参数失败",
    };
  }
}

/**
 * 客户端退款成功后标记订单已退款
 * 用于客户端模式下，前端调用 LDC API 成功后更新数据库
 */
export async function markOrderRefunded(
  orderId: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "markOrderRefunded", orderId });

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      log.warn("标记退款：订单不存在");
      return { success: false, message: "订单不存在" };
    }

    if (order.status !== "refund_pending") {
      log.warn({ status: order.status, orderNo: order.orderNo }, "标记退款：订单状态不允许");
      return { success: false, message: "该订单不在退款审核中" };
    }

    // 更新订单状态
    await db
      .update(orders)
      .set({
        status: "refunded",
        adminRemark: adminRemark || "退款已通过（客户端模式）",
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    await reverseExternalOrderPoints(orderId);

    // 退款后将卡密标记为 refunded（保留 orderId、soldAt 用于溯源）
    // 仅管理员可通过"重新上架"清空关联并改为 available
    await db
      .update(cards)
      .set({
        status: "refunded",
      })
      .where(eq(cards.orderId, orderId));

    revalidatePath("/admin/orders");
    revalidatePath("/order/my");

    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: RefundApprovedNotificationPayload = {
          orderNo: order.orderNo,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          username: order.username,
          tradeNo: order.tradeNo,
          refundedAt: new Date(),
          adminRemark: adminRemark || null,
        };
        await sendRefundApprovedNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 退款成功通知发送失败:", e);
      }
    });

    log.info({ orderNo: order.orderNo, tradeNo: order.tradeNo }, "订单已标记为已退款");
    return { success: true, message: "订单状态已更新为已退款" };
  } catch (error) {
    logger.error({ err: error, action: "markOrderRefunded", orderId }, "标记订单已退款失败");
    return {
      success: false,
      message: error instanceof Error ? error.message : "操作失败",
    };
  }
}
