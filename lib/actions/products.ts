"use server";

import { db, products, productVariants, cards, categories, orders } from "@/lib/db";
import { eq, and, desc, asc, sql, like, or, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import {
  createProductSchema,
  productSchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductInput,
  type UpdateProductInput,
} from "@/lib/validations/product";
import { suggestCopySlug } from "@/lib/utils/slug";
import { requireAdmin } from "@/lib/auth-utils";
import { revalidateProductAndRelatedCache } from "@/lib/cache";
import {
  getRestockSummaryForProducts,
  type RestockSummary,
} from "@/lib/actions/restock-requests";
import { generateProductTranslations } from "@/lib/ai/product-translation";
import {
  saleableCardInventoryCondition,
  summarizeAvailableInventory,
} from "@/lib/inventory";
import { isManualFulfillment } from "@/lib/fulfillment";

async function syncProductVariants(productId: string, variants: NonNullable<ProductInput["variants"]>) {
  const now = new Date();
  const existing = await db.query.productVariants.findMany({ where: eq(productVariants.productId, productId), columns: { id: true } });
  const existingIds = new Set(existing.map((variant) => variant.id));
  const retainedIds = new Set(variants.flatMap((variant) => variant.id && existingIds.has(variant.id) ? [variant.id] : []));
  await Promise.all([
    ...variants.map((variant, index) => {
      const values = { name: variant.name, price: variant.price.toFixed(2), originalPrice: variant.originalPrice?.toFixed(2) ?? null, sortOrder: index, isActive: true, updatedAt: now };
      return variant.id && existingIds.has(variant.id)
        ? db.update(productVariants).set(values).where(eq(productVariants.id, variant.id))
        : db.insert(productVariants).values({ productId, ...values, createdAt: now });
    }),
    ...existing.filter((variant) => !retainedIds.has(variant.id)).map((variant) => db.update(productVariants).set({ isActive: false, updatedAt: now }).where(eq(productVariants.id, variant.id))),
  ]);
}

// 节流：最多每 60 秒检查一次过期订单
let lastExpireCheck = 0;
const EXPIRE_CHECK_INTERVAL = 60 * 1000; // 60 秒

/**
 * 懒加载释放过期订单（带节流）
 * 在商品查询时自动触发，确保库存显示准确
 */
async function lazyReleaseExpiredOrders() {
  const now = Date.now();
  if (now - lastExpireCheck < EXPIRE_CHECK_INTERVAL) {
    return; // 节流：跳过
  }
  lastExpireCheck = now;

  try {
    const expired = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, "pending"), lt(orders.expiredAt, new Date())));
    if (expired.length === 0) return;
    const orderIds = expired.map((order) => order.id);
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
  } catch (error) {
    console.error("[lazyReleaseExpiredOrders] 释放过期订单失败:", error);
  }
}

/**
 * 获取商品列表（前台）
 */
export async function getActiveProducts(options?: {
  categoryId?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
  sort?: "default" | "sales_desc";
}) {
  const {
    categoryId,
    featured,
    limit = 20,
    offset = 0,
    search,
    sort = "default",
  } = options || {};

  const conditions = [eq(products.isActive, true)];

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (featured) {
    conditions.push(eq(products.isFeatured, true));
  }

  if (search) {
    conditions.push(
      or(
        like(products.name, `%${search}%`),
        like(products.description, `%${search}%`)
      )!
    );
  }

  // 优化：并行执行过期订单释放和商品查询
  // lazyReleaseExpiredOrders 只影响 locked 状态的卡密，不影响商品列表本身
  const [, productList] = await Promise.all([
    lazyReleaseExpiredOrders(),
    db.query.products.findMany({
      where: and(...conditions),
      // 为什么这样做：首页/分类页只需要展示用字段；避免把 content/images 等大字段从 DB 拉出来，降低首屏与预取成本。
      columns: {
        id: true,
        categoryId: true,
        name: true,
        slug: true,
        description: true,
        translations: true,
        price: true,
        originalPrice: true,
        coverImage: true,
        isFeatured: true,
        salesCount: true,
        fulfillmentMode: true,
        maxQuantity: true,
        sortOrder: true,
        createdAt: true,
      },
      with: {
        category: {
          columns: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy:
        sort === "sales_desc"
          ? [desc(products.salesCount), desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)]
          : [desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)],
      limit,
      offset,
    }),
  ]);

  // 如果没有商品，直接返回空数组
  if (productList.length === 0) {
    return [];
  }

  // 优化：并行获取库存数量和催补货信息
  const productIds = productList.map((p) => p.id);
  const [stockCounts, restockSummary] = await Promise.all([
    db
      .select({
        productId: cards.productId,
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .where(
        and(
          inArray(cards.productId, productIds),
          eq(cards.status, "available"),
          saleableCardInventoryCondition
        )
      )
      .groupBy(cards.productId),
    // 为什么这样做：催补货入口只在"已售罄"时展示；但为了并行化，这里先查询所有商品的催补货信息
    // 实际开销很小，因为大部分商品没有催补货记录
    getRestockSummaryForProducts({
      productIds,
      maxRequesters: 5,
    }),
  ]);

  const stockMap = new Map(stockCounts.map((s) => [s.productId, s.count]));

  return productList.map((product) => ({
    ...product,
    stock: isManualFulfillment(product.fulfillmentMode)
      ? product.maxQuantity
      : stockMap.get(product.id) || 0,
    restockRequestCount: restockSummary[product.id]?.count ?? 0,
    restockRequesters: restockSummary[product.id]?.requesters ?? [],
  }));
}

/**
 * 获取商品详情
 */
export async function getProductBySlug(slug: string) {
  const [, product] = await Promise.all([
    lazyReleaseExpiredOrders(),
    db.query.products.findFirst({
      where: and(eq(products.slug, slug), eq(products.isActive, true)),
      columns: {
        id: true,
        categoryId: true,
        name: true,
        slug: true,
        description: true,
        content: true,
        translations: true,
        price: true,
        originalPrice: true,
        coverImage: true,
        images: true,
        isFeatured: true,
        minQuantity: true,
        maxQuantity: true,
        fulfillmentMode: true,
        salesCount: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        category: true,
        variants: {
          where: eq(productVariants.isActive, true),
          orderBy: [asc(productVariants.sortOrder), asc(productVariants.createdAt)],
        },
      },
    }),
  ]);

  if (!product) {
    return null;
  }

  const [[stockCount], variantStockCounts, restockSummary] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .where(and(eq(cards.productId, product.id), eq(cards.status, "available"), saleableCardInventoryCondition)),
    db
      .select({ variantId: cards.variantId, count: sql<number>`count(*)` })
      .from(cards)
      .where(and(eq(cards.productId, product.id), eq(cards.status, "available")))
      .groupBy(cards.variantId),
    getRestockSummaryForProducts({
      productIds: [product.id],
      maxRequesters: 8,
    }),
  ]);

  const stock = isManualFulfillment(product.fulfillmentMode)
    ? product.maxQuantity
    : stockCount?.count || 0;
  const variantStockMap = new Map(variantStockCounts.filter((row) => row.variantId).map((row) => [row.variantId!, row.count]));

  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      stock: isManualFulfillment(product.fulfillmentMode)
        ? product.maxQuantity
        : variantStockMap.get(variant.id) || 0,
    })),
    stock,
    restockRequestCount: restockSummary[product.id]?.count ?? 0,
    restockRequesters: restockSummary[product.id]?.requesters ?? [],
  };
}

/**
 * 获取商品详情（通过 ID）
 */
export async function getProductById(id: string) {
  try {
    await requireAdmin();
  } catch {
    return null;
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      category: true,
      variants: {
        where: eq(productVariants.isActive, true),
        orderBy: [asc(productVariants.sortOrder), asc(productVariants.createdAt)],
      },
    },
  });

  if (!product) {
    return null;
  }

  // 同时保留公共库存、各规格库存和旧模式遗留库存，供编辑页明确展示库存归属。
  const stockRows = await db
    .select({
      variantId: cards.variantId,
      count: sql<number>`count(*)`,
    })
    .from(cards)
    .where(and(eq(cards.productId, product.id), eq(cards.status, "available")))
    .groupBy(cards.variantId);
  const inventory = summarizeAvailableInventory(
    stockRows,
    product.variants.map((variant) => variant.id)
  );

  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      stock: inventory.variantStock[variant.id] ?? 0,
    })),
    stock: isManualFulfillment(product.fulfillmentMode)
      ? product.maxQuantity
      : inventory.saleableStock,
    publicStock: inventory.publicStock,
    inactiveStock: inventory.inactiveStock,
  };
}

// ============================================
// 商品复制模板功能
// ============================================

export type GetProductTemplateByIdResult =
  | { success: true; data: ProductInput; templateName: string }
  | { success: false; message: string };

const productTemplateIdSchema = z.string().uuid("无效的模板商品ID");

function toDecimalNumber(value: unknown): number {
  if (typeof value === "string" && value.trim() === "") {
    throw new Error("invalid decimal");
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error("invalid decimal");
  }
  return n;
}

function mapDbProductToTemplateInput(row: {
  name: string;
  slug: string;
  categoryId: string | null;
  description: string | null;
  content: string | null;
  price: unknown;
  originalPrice: unknown;
  coverImage: string | null;
  images: string[] | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  minQuantity: number;
  maxQuantity: number;
  fulfillmentMode: ProductInput["fulfillmentMode"];
}): ProductInput {
  const price = toDecimalNumber(row.price);
  const originalPrice =
    row.originalPrice == null ? undefined : toDecimalNumber(row.originalPrice);

  return {
    name: row.name,
    slug: suggestCopySlug(row.slug),
    categoryId: row.categoryId ?? null,
    description: row.description ?? "",
    content: row.content ?? "",
    price,
    originalPrice,
    coverImage: row.coverImage ?? "",
    images: row.images ?? [],
    isActive: false,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    minQuantity: row.minQuantity,
    maxQuantity: row.maxQuantity,
    fulfillmentMode: row.fulfillmentMode,
  };
}

/**
 * 获取商品复制模板（管理后台）
 */
export async function getProductTemplateById(
  templateId: string
): Promise<GetProductTemplateByIdResult> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const parsedId = productTemplateIdSchema.safeParse(templateId);
  if (!parsedId.success) {
    return {
      success: false,
      message: parsedId.error.issues[0]?.message ?? "参数错误",
    };
  }

  const row = await db.query.products.findFirst({
    where: eq(products.id, parsedId.data),
    columns: {
      name: true,
      slug: true,
      categoryId: true,
      description: true,
      content: true,
      price: true,
      originalPrice: true,
      coverImage: true,
      images: true,
      isActive: true,
      isFeatured: true,
      sortOrder: true,
      minQuantity: true,
      maxQuantity: true,
      fulfillmentMode: true,
    },
  });

  if (!row) {
    return { success: false, message: "模板商品不存在" };
  }

  try {
    const template = mapDbProductToTemplateInput(row);
    const checked = productSchema.safeParse(template);
    if (!checked.success) {
      return { success: false, message: "模板数据异常，无法生成" };
    }

    return {
      success: true,
      data: checked.data,
      templateName: row.name,
    };
  } catch (error) {
    console.error("[getProductTemplateById] 生成模板失败:", error);
    return { success: false, message: "模板数据异常，无法生成" };
  }
}

/**
 * 获取所有商品（管理后台）
 */
export async function getAllProducts(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const { limit = 50, offset = 0, search } = options || {};

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(products.name, `%${search}%`),
        like(products.description, `%${search}%`)
      )!
    );
  }

  const productList = await db.query.products.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    // 为什么这样做：后台列表页只展示少量字段；避免把 content/images 等大字段从 DB 拉出来，减少序列化与 RSC 传输成本。
    columns: {
      id: true,
      categoryId: true,
      name: true,
      slug: true,
      price: true,
      originalPrice: true,
      coverImage: true,
      isActive: true,
      salesCount: true,
      sortOrder: true,
      createdAt: true,
    },
    with: {
      category: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [asc(products.sortOrder), desc(products.createdAt)],
    limit,
    offset,
  });

  // 如果没有商品，直接返回空数组
  if (productList.length === 0) {
    return [];
  }

  // 获取库存统计
  const productIds = productList.map((p) => p.id);
  const stockStats = await db
    .select({
      productId: cards.productId,
      status: cards.status,
      count: sql<number>`count(*)`,
    })
    .from(cards)
    .where(inArray(cards.productId, productIds))
    .groupBy(cards.productId, cards.status);

  const stockMap = new Map<string, { available: number; sold: number; locked: number }>();
  for (const stat of stockStats) {
    const existing = stockMap.get(stat.productId) || { available: 0, sold: 0, locked: 0 };
    existing[stat.status as keyof typeof existing] = stat.count;
    stockMap.set(stat.productId, existing);
  }

  return productList.map((product) => ({
    ...product,
    stockStats: stockMap.get(product.id) || { available: 0, sold: 0, locked: 0 },
  }));
}

/**
 * 搜索商品（前台）
 * - 默认使用 SQLite LIKE 模糊匹配（name/description/content）
 * - 为避免慢查询放大，建议在 UI 层限制最小关键词长度与分页大小
 */
export async function searchProducts(
  keyword: string,
  options?: {
    categoryId?: string;
    sort?: "relevance" | "price_asc" | "price_desc" | "sales_desc" | "newest";
    limit?: number;
    offset?: number;
  }
) {
  const query = keyword.trim();
  const { categoryId, sort = "relevance", limit = 12, offset = 0 } = options || {};

  if (query.length < 2) {
    return { items: [], total: 0 };
  }

  const pattern = `%${query}%`;
  const matchCondition = or(
    like(products.name, pattern),
    like(products.description, pattern),
    like(products.content, pattern),
    like(products.translations, pattern)
  )!;

  const conditions = [eq(products.isActive, true), matchCondition];
  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  const whereClause = and(...conditions);

  const [, [{ count }]] = await Promise.all([
    lazyReleaseExpiredOrders(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(whereClause),
  ]);

  if (!count) {
    return { items: [], total: 0 };
  }

  const relevanceScore = sql<number>`
    (CASE WHEN ${products.name} LIKE ${pattern} THEN 3 ELSE 0 END) +
    (CASE WHEN ${products.description} LIKE ${pattern} THEN 2 ELSE 0 END) +
    (CASE WHEN ${products.content} LIKE ${pattern} THEN 1 ELSE 0 END) +
    (CASE WHEN ${products.translations} LIKE ${pattern} THEN 2 ELSE 0 END)
  `;

  const orderBy = (() => {
    switch (sort) {
      case "price_asc":
        return [sql`CAST(${products.price} AS REAL) ASC`, desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)];
      case "price_desc":
        return [sql`CAST(${products.price} AS REAL) DESC`, desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)];
      case "sales_desc":
        return [desc(products.salesCount), desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)];
      case "newest":
        return [desc(products.createdAt)];
      case "relevance":
      default:
        return [desc(relevanceScore), desc(products.isFeatured), asc(products.sortOrder), desc(products.createdAt)];
    }
  })();

  const productList = await db.query.products.findMany({
    where: whereClause,
    with: {
      category: {
        columns: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy,
    limit,
    offset,
  });

  if (productList.length === 0) {
    return { items: [], total: count ?? 0 };
  }

  const productIds = productList.map((p) => p.id);
  const [stockCounts, restockSummary] = await Promise.all([
    db
      .select({
        productId: cards.productId,
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .where(and(inArray(cards.productId, productIds), eq(cards.status, "available"), saleableCardInventoryCondition))
      .groupBy(cards.productId),
    getRestockSummaryForProducts({
      productIds,
      maxRequesters: 5,
    }),
  ]);

  const stockMap = new Map(stockCounts.map((s) => [s.productId, s.count]));

  return {
    items: productList.map((product) => ({
      ...product,
      stock: isManualFulfillment(product.fulfillmentMode)
        ? product.maxQuantity
        : stockMap.get(product.id) || 0,
      restockRequestCount: restockSummary[product.id]?.count ?? 0,
      restockRequesters: restockSummary[product.id]?.requesters ?? [],
    })),
    total: count ?? 0,
  };
}

/**
 * 创建商品
 */
export async function createProduct(input: CreateProductInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = createProductSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  try {
    const { autoTranslate, translationSourceLocale, variants, ...productData } =
      validationResult.data;
    const displayPrice = variants.length > 0 ? Math.min(...variants.map((variant) => variant.price)) : productData.price;
    const [product] = await db
      .insert(products)
      .values({
        ...productData,
        price: displayPrice.toFixed(2),
        originalPrice: variants.length > 0 ? null : productData.originalPrice?.toFixed(2),
        coverImage: productData.coverImage || null,
      })
      .returning();

    if (variants.length > 0) await syncProductVariants(product.id, variants);

    let savedProduct = product;
    let translationWarning: string | undefined;
    if (autoTranslate) {
      try {
        const generated = await generateProductTranslations(
          product,
          translationSourceLocale
        );
        [savedProduct] = await db
          .update(products)
          .set({
            translations: { ...product.translations, ...generated.translations },
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id))
          .returning();
        if (generated.failedLocales.length > 0) {
          translationWarning = `商品已创建；${generated.failedLocales.join(", ")} 翻译失败，可在编辑页重试`;
        }
      } catch (error) {
        console.error("[createProduct] 自动翻译失败:", error);
        translationWarning = "商品已创建，但自动翻译暂时失败，可在编辑页重新生成";
      }
    }

    // 获取分类 slug 用于清理分类页缓存
    let categorySlug: string | undefined;
    if (product.categoryId) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, product.categoryId),
        columns: { slug: true },
      });
      categorySlug = category?.slug;
    }

    await revalidateProductAndRelatedCache(product.slug, categorySlug);

    return {
      success: true,
      data: savedProduct,
      message: translationWarning ?? (autoTranslate ? "商品已创建并生成多语言描述" : undefined),
    };
  } catch (error) {
    console.error("创建商品失败:", error);
    // 检查是否是唯一约束冲突
    if (error instanceof Error && error.message.includes("unique")) {
      return { success: false, message: "商品URL标识已存在" };
    }
    return { success: false, message: "创建商品失败" };
  }
}

/**
 * 更新商品
 */
export async function updateProduct(id: string, input: UpdateProductInput) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = updateProductSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  try {
    const {
      autoTranslate = false,
      translationSourceLocale = "zh",
      variants,
      ...productFields
    } = validationResult.data;
    const updateData: Record<string, unknown> = {
      ...productFields,
      updatedAt: new Date(),
    };

    if (productFields.price !== undefined) {
      updateData.price = productFields.price.toFixed(2);
    }
    if (productFields.originalPrice !== undefined) {
      updateData.originalPrice = productFields.originalPrice?.toFixed(2);
    }
    if (productFields.coverImage !== undefined) {
      updateData.coverImage = productFields.coverImage || null;
    }
    if (variants && variants.length > 0) {
      updateData.price = Math.min(...variants.map((variant) => variant.price)).toFixed(2);
      updateData.originalPrice = null;
    }

    const [product] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    if (!product) {
      return { success: false, message: "商品不存在" };
    }

    if (variants !== undefined) await syncProductVariants(product.id, variants);

    let savedProduct = product;
    let translationWarning: string | undefined;
    if (autoTranslate) {
      try {
        const generated = await generateProductTranslations(
          product,
          translationSourceLocale
        );
        [savedProduct] = await db
          .update(products)
          .set({
            translations: { ...product.translations, ...generated.translations },
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id))
          .returning();
        if (generated.failedLocales.length > 0) {
          translationWarning = `商品已保存；${generated.failedLocales.join(", ")} 翻译失败，请稍后重试`;
        }
      } catch (error) {
        console.error("[updateProduct] 自动翻译失败:", error);
        translationWarning = "商品已保存，但自动翻译暂时失败，请稍后重试";
      }
    }

    // 获取分类 slug 用于清理分类页缓存
    let categorySlug: string | undefined;
    if (product.categoryId) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, product.categoryId),
        columns: { slug: true },
      });
      categorySlug = category?.slug;
    }

    await revalidateProductAndRelatedCache(product.slug, categorySlug);

    return {
      success: true,
      data: savedProduct,
      message: translationWarning ?? (autoTranslate ? "商品已保存并重新生成多语言描述" : undefined),
    };
  } catch (error) {
    console.error("更新商品失败:", error);
    if (error instanceof Error && error.message.includes("unique")) {
      return { success: false, message: "商品URL标识已存在" };
    }
    return { success: false, message: "更新商品失败" };
  }
}

/**
 * 删除商品
 */
export async function deleteProduct(id: string) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    // 检查是否有未完成的订单
    const hasActiveOrders = await db.query.orders.findFirst({
      where: and(
        eq(orders.productId, id),
        or(
          eq(orders.status, "pending"),
          eq(orders.status, "paid")
        )
      ),
    });

    if (hasActiveOrders) {
      return { success: false, message: "该商品有未完成的订单，无法删除" };
    }

    // 获取商品信息用于清理缓存
    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
      columns: { slug: true, categoryId: true },
    });

    let categorySlug: string | undefined;
    if (product?.categoryId) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, product.categoryId),
        columns: { slug: true },
      });
      categorySlug = category?.slug;
    }

    await db.delete(products).where(eq(products.id, id));

    await revalidateProductAndRelatedCache(product?.slug, categorySlug);

    return { success: true, message: "商品已删除" };
  } catch (error) {
    console.error("删除商品失败:", error);
    return { success: false, message: "删除商品失败" };
  }
}

// ============================================
// 商品管理后台分页查询与批量操作
// ============================================

export type AdminProductStatusFilter = "active" | "inactive" | "out_of_stock";

export interface AdminProductsFilters {
  query?: string;
  categoryId?: string;
  status?: AdminProductStatusFilter;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  coverImage: string | null;
  price: string;
  originalPrice: string | null;
  categoryId: string | null;
  categoryName: string | null;
  stock: number;
  salesCount: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface AdminProductsPageResult {
  items: AdminProductListItem[];
  total: number;
  stats: {
    total: number;
    active: number;
    outOfStock: number;
  };
}

/**
 * 获取商品分页列表（管理后台）
 * 支持搜索、分类筛选、状态筛选
 */
export async function getAdminProductsPage(params: {
  page: number;
  pageSize: number;
  filters: AdminProductsFilters;
}): Promise<AdminProductsPageResult> {
  try {
    await requireAdmin();
  } catch {
    return { items: [], total: 0, stats: { total: 0, active: 0, outOfStock: 0 } };
  }

  const { page, pageSize, filters } = params;
  const offset = (page - 1) * pageSize;

  // 构建基础查询条件
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        like(products.name, pattern),
        like(products.slug, pattern),
        like(products.description, pattern)
      )!
    );
  }

  if (filters.categoryId) {
    conditions.push(eq(products.categoryId, filters.categoryId));
  }

  if (filters.status === "active") {
    conditions.push(eq(products.isActive, true));
  } else if (filters.status === "inactive") {
    conditions.push(eq(products.isActive, false));
  }
  // out_of_stock 需要在查询后过滤

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 并行查询：商品列表、总数、统计
  const [productList, totalResult, statsResult] = await Promise.all([
    // 商品列表
    db.query.products.findMany({
      where: whereClause,
      columns: {
        id: true,
        categoryId: true,
        name: true,
        slug: true,
        price: true,
        originalPrice: true,
        coverImage: true,
        isActive: true,
        isFeatured: true,
        salesCount: true,
        sortOrder: true,
        createdAt: true,
      },
      with: {
        category: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [asc(products.sortOrder), desc(products.createdAt)],
      // 如果是 out_of_stock 筛选，需要获取更多数据后过滤
      limit: filters.status === "out_of_stock" ? undefined : pageSize,
      offset: filters.status === "out_of_stock" ? undefined : offset,
    }),
    // 总数
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(whereClause),
    // 统计
    db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${products.isActive} = 1)`,
      })
      .from(products),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const stats = {
    total: statsResult[0]?.total ?? 0,
    active: statsResult[0]?.active ?? 0,
    outOfStock: 0, // 稍后计算
  };

  if (productList.length === 0) {
    return { items: [], total: 0, stats };
  }

  // 获取库存统计
  const productIds = productList.map((p) => p.id);
  const stockCounts = await db
    .select({
      productId: cards.productId,
      count: sql<number>`count(*)`,
    })
    .from(cards)
    .where(
      and(inArray(cards.productId, productIds), eq(cards.status, "available"), saleableCardInventoryCondition)
    )
    .groupBy(cards.productId);

  const stockMap = new Map(stockCounts.map((s) => [s.productId, s.count]));

  // 计算缺货商品数
  const allProductIds = await db
    .select({ id: products.id })
    .from(products);

  if (allProductIds.length > 0) {
    const allStockCounts = await db
      .select({
        productId: cards.productId,
        count: sql<number>`count(*)`,
      })
      .from(cards)
      .where(
        and(
          inArray(cards.productId, allProductIds.map((p) => p.id)),
          eq(cards.status, "available"),
          saleableCardInventoryCondition
        )
      )
      .groupBy(cards.productId);

    const allStockMap = new Map(allStockCounts.map((s) => [s.productId, s.count]));
    stats.outOfStock = allProductIds.filter(
      (p) => (allStockMap.get(p.id) ?? 0) === 0
    ).length;
  }

  // 映射结果
  let items: AdminProductListItem[] = productList.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    coverImage: product.coverImage,
    price: product.price,
    originalPrice: product.originalPrice,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    stock: stockMap.get(product.id) ?? 0,
    salesCount: product.salesCount,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt,
  }));

  // 如果是 out_of_stock 筛选，需要过滤并分页
  if (filters.status === "out_of_stock") {
    items = items.filter((item) => item.stock === 0);
    const filteredTotal = items.length;
    items = items.slice(offset, offset + pageSize);
    return { items, total: filteredTotal, stats };
  }

  return { items, total, stats };
}

/**
 * 批量更新商品状态（上架/下架）
 */
export async function bulkUpdateProductStatus(
  ids: string[],
  action: "activate" | "deactivate"
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  if (!ids || ids.length === 0) {
    return { success: false, message: "请选择要操作的商品" };
  }

  if (ids.length > 100) {
    return { success: false, message: "单次最多操作100个商品" };
  }

  try {
    const newStatus = action === "activate";
    const result = await db
      .update(products)
      .set({
        isActive: newStatus,
        updatedAt: new Date(),
      })
      .where(inArray(products.id, ids))
      .returning({ id: products.id });

    const count = result.length;
    const actionText = action === "activate" ? "上架" : "下架";

    // 清理缓存
    await revalidateProductAndRelatedCache();

    return {
      success: true,
      message: `成功${actionText} ${count} 个商品`,
      count,
    };
  } catch (error) {
    console.error("批量更新商品状态失败:", error);
    return { success: false, message: "操作失败，请重试" };
  }
}

/**
 * 批量删除商品
 */
export async function bulkDeleteProducts(
  ids: string[]
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  if (!ids || ids.length === 0) {
    return { success: false, message: "请选择要删除的商品" };
  }

  if (ids.length > 50) {
    return { success: false, message: "单次最多删除50个商品" };
  }

  try {
    // 检查是否有未完成的订单
    const activeOrders = await db.query.orders.findMany({
      where: and(
        inArray(orders.productId, ids),
        or(eq(orders.status, "pending"), eq(orders.status, "paid"))
      ),
      columns: { productId: true },
    });

    if (activeOrders.length > 0) {
      const affectedCount = new Set(activeOrders.map((o) => o.productId)).size;
      return {
        success: false,
        message: `有 ${affectedCount} 个商品存在未完成的订单，无法删除`,
      };
    }

    // 执行删除
    const result = await db
      .delete(products)
      .where(inArray(products.id, ids))
      .returning({ id: products.id });

    const count = result.length;

    // 清理缓存
    await revalidateProductAndRelatedCache();

    return {
      success: true,
      message: `成功删除 ${count} 个商品`,
      count,
    };
  } catch (error) {
    console.error("批量删除商品失败:", error);
    return { success: false, message: "删除失败，请重试" };
  }
}

/**
 * 切换商品上架状态
 */
export async function toggleProductActive(id: string) {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  try {
    const product = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (!product) {
      return { success: false, message: "商品不存在" };
    }

    await db
      .update(products)
      .set({
        isActive: !product.isActive,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    // 获取分类 slug 用于清理分类页缓存
    let categorySlug: string | undefined;
    if (product.categoryId) {
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, product.categoryId),
        columns: { slug: true },
      });
      categorySlug = category?.slug;
    }

    await revalidateProductAndRelatedCache(product.slug, categorySlug);

    return {
      success: true,
      message: product.isActive ? "商品已下架" : "商品已上架",
    };
  } catch (error) {
    console.error("切换商品状态失败:", error);
    return { success: false, message: "操作失败" };
  }
}
