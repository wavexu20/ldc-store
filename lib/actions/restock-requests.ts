"use server";

import { auth } from "@/lib/auth";
import { revalidateAllStoreCache } from "@/lib/cache";
import { db, restockRequests, products, cards } from "@/lib/db";
import { desc, inArray, lte, sql, eq, and } from "drizzle-orm";
import { getTelegramConfig } from "@/lib/actions/system-settings";
import { sendRestockNotification } from "@/lib/notifications/telegram";

export interface RestockRequester {
  userId: string;
  username: string;
  userImage?: string | null;
}

export interface RestockSummary {
  count: number;
  requesters: RestockRequester[];
}

const DEFAULT_MAX_REQUESTERS = 5;

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

/**
 * 获取商品的「催补货」聚合信息（计数 + 最近 N 个头像）
 * - 仅返回与用户无关的数据，确保可用于 ISR 页面而不会导致缓存穿透/泄露
 */
export async function getRestockSummaryForProducts(input: {
  productIds: string[];
  maxRequesters?: number;
}): Promise<Record<string, RestockSummary>> {
  const productIds = normalizeIds(input.productIds);
  const maxRequesters = Math.max(1, input.maxRequesters ?? DEFAULT_MAX_REQUESTERS);

  if (productIds.length === 0) {
    return {};
  }

  try {
    const ranked = db
      .select({
        productId: restockRequests.productId,
        userId: restockRequests.userId,
        username: restockRequests.username,
        userImage: restockRequests.userImage,
        createdAt: restockRequests.createdAt,
        rn: sql<number>`
          row_number() over (
            partition by ${restockRequests.productId}
            order by ${restockRequests.createdAt} desc
          )
        `.as("rn"),
      })
      .from(restockRequests)
      .where(inArray(restockRequests.productId, productIds))
      .as("ranked_restock_requests");

    const [counts, requesterRows] = await Promise.all([
      db
        .select({
          productId: restockRequests.productId,
          count: sql<number>`count(*)`,
        })
        .from(restockRequests)
        .where(inArray(restockRequests.productId, productIds))
        .groupBy(restockRequests.productId),
      db
        .select({
          productId: ranked.productId,
          userId: ranked.userId,
          username: ranked.username,
          userImage: ranked.userImage,
          createdAt: ranked.createdAt,
        })
        .from(ranked)
        .where(lte(ranked.rn, maxRequesters))
        .orderBy(ranked.productId, desc(ranked.createdAt)),
    ]);

    const countMap = new Map(counts.map((row) => [row.productId, row.count]));

    const requesterMap = new Map<string, RestockRequester[]>();
    for (const row of requesterRows) {
      const list = requesterMap.get(row.productId) ?? [];
      list.push({
        userId: row.userId,
        username: row.username,
        userImage: row.userImage ?? null,
      });
      requesterMap.set(row.productId, list);
    }

    const result: Record<string, RestockSummary> = {};
    for (const productId of productIds) {
      result[productId] = {
        count: countMap.get(productId) ?? 0,
        requesters: requesterMap.get(productId) ?? [],
      };
    }

    return result;
  } catch (error) {
    console.error("[getRestockSummaryForProducts] 查询催补货统计失败:", error);
    return {};
  }
}

export interface RequestRestockResult {
  success: boolean;
  message: string;
  summary?: RestockSummary;
}

/**
 * 记录一次「催补货」请求（按 userId 去重）
 */
export async function requestRestock(productId: string): Promise<RequestRestockResult> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; username?: string; name?: string; image?: string; provider?: string }
    | undefined;

  // 关键：只允许 Linux DO 登录用户参与，避免游客刷量 + 方便展示头像 group
  if (!user?.id || user.id === "admin") {
    return { success: false, message: "请先使用 Linux DO 登录后再催补货" };
  }

  const safeProductId = productId.trim();
  if (!safeProductId) {
    return { success: false, message: "商品信息无效" };
  }

  const username = (user.username || user.name || "用户").trim() || "用户";
  const userImage = user.image ?? null;

  try {
    const [inserted] = await db
      .insert(restockRequests)
      .values({
        productId: safeProductId,
        userId: user.id,
        username,
        userImage,
      })
      .onConflictDoNothing({
        target: [restockRequests.productId, restockRequests.userId],
      })
      .returning({ id: restockRequests.id });
    const isFirstInsert = Boolean(inserted);
    if (!isFirstInsert) {
      await db
        .update(restockRequests)
        .set({ username, userImage })
        .where(
          and(
            eq(restockRequests.productId, safeProductId),
            eq(restockRequests.userId, user.id)
          )
        );
    }

    // 仅首次插入时触发 Telegram 通知（fire-and-forget，不阻塞响应）
    if (isFirstInsert) {
      triggerTelegramNotification(safeProductId, username).catch(() => {
        // 静默忽略通知失败，不影响主流程
      });
    }

    // 刷新商店前台缓存：让其他用户尽快看到计数变化（同时仍保持 ISR 性能）
    await revalidateAllStoreCache();

    const summaryMap = await getRestockSummaryForProducts({ productIds: [safeProductId] });
    return {
      success: true,
      message: "已为你登记催补货",
      summary: summaryMap[safeProductId],
    };
  } catch (error) {
    // 记录详细错误日志，但对外返回统一文案，避免泄露内部细节
    console.error("[requestRestock] 记录催补货失败:", error);
    return {
      success: false,
      message: "催补货失败，请稍后重试",
    };
  }
}

/**
 * 触发 Telegram 催补货通知（异步执行，不阻塞主流程）
 */
async function triggerTelegramNotification(
  productId: string,
  username: string
): Promise<void> {
  try {
    // 获取 Telegram 配置
    const telegramConfig = await getTelegramConfig();
    if (!telegramConfig.enabled) {
      return;
    }

    // 查询商品信息和库存
    const [productInfo] = await db
      .select({
        name: products.name,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!productInfo) {
      console.warn(`[triggerTelegramNotification] 商品不存在: ${productId}`);
      return;
    }

    // 查询可用库存数量
    const [stockInfo] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .where(and(eq(cards.productId, productId), eq(cards.status, "available")));

    const availableStock = stockInfo?.count ?? 0;

    // 发送通知
    await sendRestockNotification(
      {
        enabled: telegramConfig.enabled,
        botToken: telegramConfig.botToken,
        chatId: telegramConfig.chatId,
      },
      {
        productId,
        productName: productInfo.name,
        availableStock,
        username,
        timestamp: new Date(),
      }
    );
  } catch (error) {
    // 通知失败仅记录日志，不影响主流程
    console.error("[triggerTelegramNotification] 发送通知失败:", error);
  }
}
