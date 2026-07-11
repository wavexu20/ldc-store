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

import { db, getD1Binding, orders, cards, products } from "@/lib/db";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
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
import { createGatewayPayment, queryGatewayPayment } from "@/lib/payment/gateway";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { getExpireTime } from "@/lib/time";
import { getSystemSettings, getTelegramConfigWithToggles } from "@/lib/actions/system-settings";
import { logger, getRequestIdFromHeaders } from "@/lib/logger";
import { parseWalletAmount } from "@/lib/money";
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
}

/**
 * 创建订单
 * 1. 验证登录状态
 * 2. 验证输入
 * 3. 检查库存
 * 4. 创建订单并锁定卡密（使用事务）
 * 5. 调用支付接口获取支付链接
 * 
 * 仅登录用户可下单
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const requestId = await getRequestIdFromHeaders();
  const log = logger.child({ requestId, action: "createOrder" });

  // 1. 验证登录状态
  const session = await auth();
  const user = session?.user as { id?: string; username?: string; image?: string; provider?: string } | undefined;

  if (!user?.id || user.id === "admin") {
    log.warn("未登录用户尝试创建订单");
    return {
      success: false,
      message: "请先登录后再下单",
    };
  }
  const userId = user.id;

  // 2. 验证输入
  const validationResult = createOrderSchema.safeParse(input);
  if (!validationResult.success) {
    log.warn({ issues: validationResult.error.issues }, "创建订单参数校验失败");
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  const { productId, quantity, paymentMethod } = validationResult.data;

  try {
    log.info({ userId: user.id, productId, quantity, paymentMethod }, "开始创建订单");

    // 2.1 释放过期订单，确保库存准确（懒加载策略）
    await releaseExpiredOrders();
    
    // 2.2 获取商品信息
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.isActive, true)),
    });

    if (!product) {
      return { success: false, message: "商品不存在或已下架" };
    }

    // 验证购买数量限制
    if (quantity < product.minQuantity || quantity > product.maxQuantity) {
      return {
        success: false,
        message: `购买数量需在 ${product.minQuantity} - ${product.maxQuantity} 之间`,
      };
    }

    const { orderExpireMinutes } = await getSystemSettings();

    const availableCards = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.productId, productId), eq(cards.status, "available")))
      .limit(quantity);
    if (availableCards.length < quantity) {
      throw new Error(`库存不足，当前仅剩 ${availableCards.length} 件`);
    }

    const cardIds = availableCards.map((card) => card.id);
    const orderId = crypto.randomUUID();
    const walletTransactionId = crypto.randomUUID();
    const orderNo = generateOrderNo();
    const totalAmount = parseFloat(product.price) * quantity;
    const totalCents = Math.round(totalAmount * 100);
    const createdAt = new Date();
    const expiredAt = getExpireTime(orderExpireMinutes);
    const createdEpoch = Math.floor(createdAt.getTime() / 1000);
    const expiredEpoch = Math.floor(expiredAt.getTime() / 1000);
    const placeholders = cardIds.map(() => "?").join(", ");
    const isBalance = paymentMethod === "balance";
    const d1 = getD1Binding();

    const statements = [
      d1.prepare(`
        INSERT INTO orders (
          id, order_no, product_id, product_name, product_price, quantity,
          total_amount, payment_method, status, trade_no, user_id, username,
          user_image, paid_at, expired_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM cards
          WHERE product_id = ? AND status = 'available' AND id IN (${placeholders})
        ) = ?
        AND (? <> 'balance' OR EXISTS (
          SELECT 1 FROM users WHERE id = ? AND balance_cents >= ?
        ))
        RETURNING id, order_no
      `).bind(
        orderId, orderNo, productId, product.name, product.price, quantity,
        totalAmount.toFixed(2), paymentMethod,
        isBalance ? "completed" : "pending",
        isBalance ? `BALANCE-${orderNo}` : null,
        userId, user.username ?? null, user.image ?? null,
        isBalance ? createdEpoch : null, expiredEpoch, createdEpoch, createdEpoch,
        productId, ...cardIds, quantity, paymentMethod, userId, totalCents
      ),
      d1.prepare(`
        UPDATE cards SET status = ?, order_id = ?, locked_at = ?, sold_at = ?
        WHERE product_id = ? AND status = 'available'
          AND id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(
        isBalance ? "sold" : "locked", orderId,
        isBalance ? null : createdEpoch, isBalance ? createdEpoch : null,
        productId, ...cardIds, orderId
      ),
      d1.prepare(`
        UPDATE users
        SET balance_cents = balance_cents - ?, updated_at = ?
        WHERE id = ? AND ? = 'balance'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(totalCents, createdEpoch, userId, paymentMethod, orderId),
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
        walletTransactionId, -totalCents, orderId, `purchase:${orderId}`,
        `购买 ${product.name}`, createdEpoch, userId, paymentMethod, orderId
      ),
      d1.prepare(`
        UPDATE products SET sales_count = sales_count + ?, updated_at = ?
        WHERE id = ? AND ? = 'balance'
          AND EXISTS (SELECT 1 FROM orders WHERE id = ?)
      `).bind(quantity, createdEpoch, productId, paymentMethod, orderId),
    ];
    const [insertResult] = await d1.batch<{ id: string; order_no: string }>(statements);
    if (!insertResult.results[0]) {
      throw new Error("库存或余额已发生变化，请刷新后重试");
    }
    const result = {
      order: { orderNo, createdAt, expiredAt },
      totalAmount,
    };

    // 4. 刷新页面缓存，确保库存显示准确
    revalidatePath("/");
    revalidatePath(`/product/${product.slug}`);

    // 5. 为外部支付创建托管收银台链接。
    let paymentForm: PaymentLaunchData | undefined;
    if (paymentMethod === "gateway" || paymentMethod === "ldc") {
      try {
        const siteUrl = await getSiteUrl();
        paymentForm = paymentMethod === "gateway"
          ? await createGatewayPayment({
              orderId: result.order.orderNo,
              amount: result.totalAmount,
              productName: product.name,
              productDescription: product.description || undefined,
              siteUrl,
              successPath: `/order/result?out_trade_no=${encodeURIComponent(result.order.orderNo)}`,
              cancelPath: `/order/result?out_trade_no=${encodeURIComponent(result.order.orderNo)}&cancelled=1`,
            })
          : createPayment(result.order.orderNo, result.totalAmount, product.name, siteUrl);
      } catch (error) {
        // 支付接口调用失败，但订单已创建
        log.error(
          { err: error, orderNo: result.order.orderNo, userId: user.id },
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
        userId: user.id,
        productId,
        quantity,
        totalAmount: result.totalAmount,
        paymentMethod,
      },
      "订单创建成功"
    );

    // 触发新订单通知
    after(async () => {
      try {
        const config = await getTelegramConfigWithToggles();
        const payload: NewOrderNotificationPayload = {
          orderNo: result.order.orderNo,
          productName: product.name,
          quantity,
          totalAmount: result.totalAmount.toFixed(2),
          paymentMethod,
          username: user.username || null,
          createdAt: result.order.createdAt,
          expiredAt: result.order.expiredAt!,
        };
        await sendNewOrderNotification(config, payload);
      } catch (e) {
        console.error("[Telegram] 新订单通知发送失败:", e);
      }
    });

    return {
      success: true,
      message: "订单创建成功",
      orderNo: result.order.orderNo,
      paymentForm,
    };
  } catch (error) {
    log.error(
      { err: error, userId: user.id, productId, quantity, paymentMethod },
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
    const d1 = getD1Binding();
    const statements = [
      d1.prepare(`
        UPDATE cards SET status = 'sold', sold_at = ?
        WHERE order_id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(nowEpoch, pendingOrder.id, pendingOrder.id),
      d1.prepare(`
        UPDATE products SET sales_count = sales_count + ?, updated_at = ?
        WHERE id = ?
          AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')
      `).bind(pendingOrder.quantity, nowEpoch, pendingOrder.productId, pendingOrder.id),
      d1.prepare(`
        UPDATE orders SET status = 'completed', trade_no = ?, paid_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
        RETURNING id
      `).bind(tradeNo, nowEpoch, nowEpoch, pendingOrder.id),
    ];
    const batchResult = await d1.batch<{ id: string }>(statements);
    if (!batchResult[2]?.results[0]) throw new Error("订单不存在或已处理");
    const result = { ...pendingOrder, status: "completed" as const, tradeNo, paidAt: new Date() };
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
        UPDATE orders SET status = 'completed', paid_at = ?, admin_remark = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'paid') RETURNING id
      `).bind(nowEpoch, adminRemark ?? null, nowEpoch, orderId),
    ]);
    if (!results[2]?.results[0]) throw new Error("订单状态不允许手动完成");
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
 * 获取当前登录用户的历史订单
 */
export async function getUserOrders() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; username?: string; provider?: string } | undefined;

    if (!user?.id || user.id === "admin") {
      return { success: false, message: "请先登录", data: [] };
    }

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
        cards: cardsToShow.map((c) => c.content),
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
export async function getOrderByNo(orderNo: string) {
  try {
    const requestId = await getRequestIdFromHeaders();
    const log = logger.child({ requestId, action: "getOrderByNo", orderNo });

    const session = await auth();
    const user = session?.user as { id?: string; provider?: string } | undefined;

    if (!user?.id || user.id === "admin") {
      return { success: false, message: "请先登录" };
    }

    const userId = user.id;

    function toCents(value: string): number | null {
      const amount = parseWalletAmount(value);
      if (amount === null) return null;
      return Math.round(amount * 100);
    }

    const fetchOrder = () =>
      db.query.orders.findFirst({
        where: and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)),
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
      return { success: false, message: "订单不存在或无权访问" };
    }

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
        cards: cardsToShow.map((c) => c.content),
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
): Promise<{ success: boolean; message: string }> {
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
      const refundCents = Math.round(parseFloat(order.totalAmount) * 100);
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
        `).bind(refundCents, nowEpoch, order.userId, order.id, idempotencyKey),
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
          crypto.randomUUID(), refundCents, order.id, idempotencyKey,
          `订单 ${order.orderNo} 退款`, nowEpoch, order.userId, order.id
        ),
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
