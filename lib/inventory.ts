import { sql } from "drizzle-orm";
import { cards, productVariants } from "@/lib/db/schema";

/**
 * 只统计当前商品销售模式真正可下单的卡密：
 * - 没有启用规格时，只统计未绑定规格的公共卡密；
 * - 启用规格后，只统计绑定到启用规格的卡密。
 *
 * 这能避免切换销售模式后，旧模式遗留卡密造成“页面显示有库存，实际无法下单”。
 */
export const saleableCardInventoryCondition = sql<boolean>`(
  (
    ${cards.variantId} IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM ${productVariants} AS active_variant
      WHERE active_variant.product_id = ${cards.productId}
        AND active_variant.is_active = 1
    )
  )
  OR EXISTS (
    SELECT 1 FROM ${productVariants} AS active_variant
    WHERE active_variant.id = ${cards.variantId}
      AND active_variant.product_id = ${cards.productId}
      AND active_variant.is_active = 1
  )
)`;

export interface InventoryCountRow {
  variantId: string | null;
  count: number;
}

export function summarizeAvailableInventory(
  rows: InventoryCountRow[],
  activeVariantIds: string[]
) {
  const activeIds = new Set(activeVariantIds);
  const publicStock = rows
    .filter((row) => row.variantId === null)
    .reduce((sum, row) => sum + row.count, 0);
  const variantStock = Object.fromEntries(
    activeVariantIds.map((variantId) => [
      variantId,
      rows
        .filter((row) => row.variantId === variantId)
        .reduce((sum, row) => sum + row.count, 0),
    ])
  );
  const totalStock = rows.reduce((sum, row) => sum + row.count, 0);
  const saleableStock = activeVariantIds.length > 0
    ? rows
        .filter((row) => row.variantId !== null && activeIds.has(row.variantId))
        .reduce((sum, row) => sum + row.count, 0)
    : publicStock;

  return {
    saleableStock,
    publicStock,
    variantStock,
    inactiveStock: Math.max(0, totalStock - saleableStock),
  };
}
