"use server";

import { db, cards, products, productVariants, type CardStatus } from "@/lib/db";
import { eq, and, sql, inArray, desc, asc, isNull } from "drizzle-orm";
import {
  importCardsSchema,
  createCardSchema,
  updateCardSchema,
  type ImportCardsInput,
  type CreateCardInput,
  type UpdateCardInput,
} from "@/lib/validations/card";
import { requireAdmin } from "@/lib/auth-utils";
import { revalidateCardCache } from "@/lib/cache";

/**
 * 批量导入卡密
 */
export async function importCards(input: ImportCardsInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = importCardsSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  const { productId, variantId, content, delimiter, deduplicate } = validationResult.data;

  // 检查商品是否存在
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });

  if (!product) {
    return { success: false, message: "商品不存在" };
  }
  const variants = await db.query.productVariants.findMany({ where: and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)), columns: { id: true } });
  const variant = variantId ? variants.find((item) => item.id === variantId) : null;
  if (variants.length > 0 && !variant) return { success: false, message: "请先选择有效的商品规格" };
  if (variants.length === 0 && variantId) return { success: false, message: "该商品当前不支持规格库存" };
  const cardVariantCondition = variant ? eq(cards.variantId, variant.id) : isNull(cards.variantId);

  // 解析卡密内容
  const cardContents = content
    .split(delimiter === "newline" ? /\r?\n/ : ",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (cardContents.length === 0) {
    return { success: false, message: "未找到有效的卡密" };
  }

  const uniqueContents = [...new Set(cardContents)];
  const duplicateCount = cardContents.length - uniqueContents.length;

  try {
    if (deduplicate) {
      // 为什么这样做：默认强制去重，避免同一商品出现重复卡密导致“重复发货”风险。
      const existingCards = await db
        .select({ content: cards.content })
        .from(cards)
        .where(
          and(
            eq(cards.productId, productId),
            cardVariantCondition,
            inArray(cards.content, uniqueContents)
          )
        );

      const existingSet = new Set(existingCards.map((c) => c.content));
      const newContents = uniqueContents.filter((c) => !existingSet.has(c));

      if (newContents.length === 0) {
        return {
          success: false,
          message: "所有卡密都已存在",
          stats: {
            total: cardContents.length,
            duplicateInInput: duplicateCount,
            existingInDb: existingCards.length,
            imported: 0,
            skipped: cardContents.length,
            deduplicate: true,
          },
        };
      }

      await db.insert(cards).values(
        newContents.map((content) => ({
          productId,
          variantId: variant?.id ?? null,
          content,
          status: "available" as const,
        }))
      );

      await revalidateCardCache();

      return {
        success: true,
        message: `成功导入 ${newContents.length} 个卡密`,
        stats: {
          total: cardContents.length,
          duplicateInInput: duplicateCount,
          existingInDb: existingCards.length,
          imported: newContents.length,
          skipped: cardContents.length - newContents.length,
          deduplicate: true,
        },
      };
    }

    await db.insert(cards).values(
      cardContents.map((content) => ({
        productId,
        variantId: variant?.id ?? null,
        content,
        status: "available" as const,
      }))
    );

    await revalidateCardCache();

    return {
      success: true,
      message: `成功导入 ${cardContents.length} 个卡密（未去重）`,
      stats: {
        total: cardContents.length,
        duplicateInInput: duplicateCount,
        existingInDb: 0,
        imported: cardContents.length,
        skipped: 0,
        deduplicate: false,
      },
    };
  } catch (error) {
    console.error("导入卡密失败:", error);
    return { success: false, message: "导入卡密失败" };
  }
}

/**
 * 新增单条卡密
 */
export async function createCard(input: CreateCardInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = createCardSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  const { productId, variantId, content, deduplicate } = validationResult.data;

  // 检查商品是否存在
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true },
  });

  if (!product) {
    return { success: false, message: "商品不存在" };
  }
  const variants = await db.query.productVariants.findMany({ where: and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)), columns: { id: true } });
  const variant = variantId ? variants.find((item) => item.id === variantId) : null;
  if (variants.length > 0 && !variant) return { success: false, message: "请先选择有效的商品规格" };
  if (variants.length === 0 && variantId) return { success: false, message: "该商品当前不支持规格库存" };
  const cardVariantCondition = variant ? eq(cards.variantId, variant.id) : isNull(cards.variantId);

  try {
    if (deduplicate) {
      // 为什么这样做：默认强制去重，避免同一商品出现重复卡密导致“重复发货”风险。
      const duplicateCard = await db.query.cards.findFirst({
        where: and(eq(cards.productId, productId), cardVariantCondition, eq(cards.content, content)),
        columns: { id: true },
      });

      if (duplicateCard) {
        return { success: false, message: "该卡密内容已存在" };
      }
    }

    const [created] = await db
      .insert(cards)
      .values({
        productId,
        variantId: variant?.id ?? null,
        content,
        status: "available",
      })
      .returning({ id: cards.id });

    await revalidateCardCache();

    return {
      success: true,
      message: "新增卡密成功",
      cardId: created?.id,
    };
  } catch (error) {
    console.error("新增卡密失败:", error);
    return { success: false, message: "新增卡密失败" };
  }
}

/**
 * 编辑卡密内容
 */
export async function updateCard(input: UpdateCardInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = updateCardSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  const { cardId, content, variantId } = validationResult.data;

  try {
    // 查找卡密
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return { success: false, message: "卡密不存在" };
    }

    // 为什么这样做：locked/sold 卡密已经与订单强绑定，编辑会影响履约与审计；强制要求先“重置锁定”或去订单详情处理。
    if (card.status !== "available" || card.orderId) {
      return { success: false, message: "仅可编辑未锁定且未售出的可用卡密" };
    }

    const variants = await db.query.productVariants.findMany({
      where: and(
        eq(productVariants.productId, card.productId),
        eq(productVariants.isActive, true)
      ),
      columns: { id: true },
    });
    const requestedVariantId = variantId === undefined ? card.variantId : variantId;
    const targetVariant = requestedVariantId
      ? variants.find((variant) => variant.id === requestedVariantId)
      : null;
    if (variants.length > 0 && !targetVariant) {
      return { success: false, message: "多规格商品必须把卡密归属到一个有效规格" };
    }
    if (variants.length === 0 && requestedVariantId) {
      return { success: false, message: "单规格商品的卡密必须归属公共库存" };
    }
    const targetVariantCondition = targetVariant
      ? eq(cards.variantId, targetVariant.id)
      : isNull(cards.variantId);

    // 同一规格内强制唯一；不同规格允许使用相同的供应商卡密文本。
    const duplicateCard = await db.query.cards.findFirst({
      where: and(
        eq(cards.productId, card.productId),
        targetVariantCondition,
        eq(cards.content, content),
      ),
    });

    if (duplicateCard && duplicateCard.id !== cardId) {
      return { success: false, message: "该卡密内容已存在" };
    }

    // 更新卡密
    await db
      .update(cards)
      .set({ content, variantId: targetVariant?.id ?? null })
      .where(eq(cards.id, cardId));

    await revalidateCardCache();

    return { success: true, message: "卡密更新成功" };
  } catch (error) {
    console.error("更新卡密失败:", error);
    return { success: false, message: "更新卡密失败" };
  }
}

/**
 * 获取商品的卡密列表
 */
export async function getCardsByProduct(
  productId: string,
  options?: {
    status?: CardStatus;
    limit?: number;
    offset?: number;
  }
) {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const { status, limit = 100, offset = 0 } = options || {};

  const conditions = [eq(cards.productId, productId)];
  if (status) {
    conditions.push(eq(cards.status, status));
  }

  return db.query.cards.findMany({
    where: and(...conditions),
    orderBy: [asc(cards.status), desc(cards.createdAt)],
    limit,
    offset,
  });
}

/**
 * 获取商品库存统计
 */
export async function getCardStats(productId: string) {
  try {
    await requireAdmin();
  } catch {
    return { available: 0, locked: 0, sold: 0, total: 0 };
  }

  const stats = await db
    .select({
      status: cards.status,
      count: sql<number>`count(*)`,
    })
    .from(cards)
    .where(eq(cards.productId, productId))
    .groupBy(cards.status);

  return {
    available: stats.find((s) => s.status === "available")?.count || 0,
    locked: stats.find((s) => s.status === "locked")?.count || 0,
    sold: stats.find((s) => s.status === "sold")?.count || 0,
    total: stats.reduce((sum, s) => sum + s.count, 0),
  };
}

/**
 * 删除卡密
 */
export async function deleteCards(cardIds: string[]) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  if (cardIds.length === 0) {
    return { success: false, message: "请选择要删除的卡密" };
  }

  try {
    // 只能删除未售出的卡密
    const result = await db
      .delete(cards)
      .where(
        and(
          inArray(cards.id, cardIds),
          eq(cards.status, "available"),
          isNull(cards.orderId)
        )
      )
      .returning({ id: cards.id });

    await revalidateCardCache();

    return {
      success: true,
      message: `成功删除 ${result.length} 个卡密`,
      deletedCount: result.length,
    };
  } catch (error) {
    console.error("删除卡密失败:", error);
    return { success: false, message: "删除卡密失败" };
  }
}

/**
 * 重置锁定的卡密（释放锁定状态）
 */
export async function resetLockedCards(cardIds: string[]) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  if (cardIds.length === 0) {
    return { success: false, message: "请选择要重置的卡密" };
  }

  try {
    const result = await db
      .update(cards)
      .set({
        status: "available",
        orderId: null,
        lockedAt: null,
      })
      .where(
        and(
          inArray(cards.id, cardIds),
          eq(cards.status, "locked")
        )
      )
      .returning({ id: cards.id });

    await revalidateCardCache();

    return {
      success: true,
      message: `成功重置 ${result.length} 个卡密`,
      resetCount: result.length,
    };
  } catch (error) {
    console.error("重置卡密失败:", error);
    return { success: false, message: "重置卡密失败" };
  }
}

/**
 * 导出卡密
 */
export async function exportCards(
  productId: string,
  status?: CardStatus
) {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const conditions = [eq(cards.productId, productId)];
  if (status) {
    conditions.push(eq(cards.status, status));
  }

  const cardList = await db.query.cards.findMany({
    where: and(...conditions),
    columns: {
      content: true,
      status: true,
      createdAt: true,
      soldAt: true,
    },
    orderBy: [desc(cards.createdAt)],
  });

  return cardList;
}

/**
 * 清理重复卡密
 * 保留最早创建的那个
 */
export async function cleanDuplicateCards(productId: string) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    // 找出重复的卡密
    const duplicates = await db.all(sql`
      WITH duplicates AS (
        SELECT id, content, 
               ROW_NUMBER() OVER (PARTITION BY content ORDER BY created_at ASC) as rn
        FROM cards 
        WHERE product_id = ${productId} AND status = 'available'
      )
      SELECT id FROM duplicates WHERE rn > 1
    `);

    const duplicateRows = duplicates as unknown as Array<{ id: string }>;
    if (!duplicateRows || duplicateRows.length === 0) {
      return { success: true, message: "没有发现重复卡密", deletedCount: 0 };
    }

    const duplicateIds = duplicateRows.map((row) => row.id);

    await db.delete(cards).where(inArray(cards.id, duplicateIds));

    await revalidateCardCache();

    return {
      success: true,
      message: `成功清理 ${duplicateIds.length} 个重复卡密`,
      deletedCount: duplicateIds.length,
    };
  } catch (error) {
    console.error("清理重复卡密失败:", error);
    return { success: false, message: "清理失败" };
  }
}

/**
 * 重新上架退款卡密（恢复为可售状态）
 */
export async function relistRefundedCards(cardIds: string[]) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  if (cardIds.length === 0) {
    return { success: false, message: "请选择要重新上架的卡密" };
  }

  try {
    const result = await db
      .update(cards)
      .set({
        status: "available",
        orderId: null,
        soldAt: null,
        lockedAt: null,
      })
      .where(
        and(
          inArray(cards.id, cardIds),
          eq(cards.status, "refunded")
        )
      )
      .returning({ id: cards.id });

    await revalidateCardCache();

    return {
      success: true,
      message: `成功重新上架 ${result.length} 个卡密`,
      relistCount: result.length,
    };
  } catch (error) {
    console.error("重新上架卡密失败:", error);
    return { success: false, message: "重新上架卡密失败" };
  }
}
