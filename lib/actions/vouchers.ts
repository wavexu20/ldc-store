"use server";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-utils";
import { db, cards, getD1Binding, products, productVariants, users, voucherBatches, vouchers } from "@/lib/db";
import { requireSecondFactor, SECOND_FACTOR_REQUIRED_MESSAGE } from "@/lib/security/two-factor-session";
import { createVoucherBatchSchema, type CreateVoucherBatchInput } from "@/lib/validations/voucher";
import { getFulfillmentDueAt, isManualFulfillment } from "@/lib/fulfillment";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateVoucherCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const body = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `G3D-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

function generateOrderNo() {
  return `LD${Date.now().toString(36).toUpperCase()}${nanoid(6).toUpperCase()}`;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s/g, "");
}

function voucherLabel(type: "recharge" | "product" | "discount") {
  return type === "recharge" ? "充值券" : type === "product" ? "商品兑换券" : "满减券";
}

export async function createVoucherBatch(input: CreateVoucherBatchInput) {
  const admin = await requireAdmin();
  const parsed = createVoucherBatchSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues[0]?.message || "卡券参数不正确" };
  const data = parsed.data;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  let product: { id: string; name: string } | null = null;
  let variant: { id: string; name: string } | null = null;
  if (data.type === "product") {
    product = await db.query.products.findFirst({ where: eq(products.id, data.productId!), columns: { id: true, name: true } }) || null;
    if (!product) return { success: false as const, message: "绑定的商品不存在" };
    const variants = await db.query.productVariants.findMany({ where: and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)), columns: { id: true, name: true } });
    variant = data.productVariantId ? variants.find((item) => item.id === data.productVariantId) || null : null;
    if (variants.length > 0 && !variant) return { success: false as const, message: "多规格商品的兑换券必须绑定一个规格" };
    if (variants.length === 0 && data.productVariantId) return { success: false as const, message: "所选商品不支持该规格" };
  }

  const batchId = crypto.randomUUID();
  const codes = Array.from({ length: data.quantity }, generateVoucherCode);
  const now = new Date();
  try {
    await db.batch([
      db.insert(voucherBatches).values({
        id: batchId,
        name: data.name,
        type: data.type,
        quantity: data.quantity,
        rechargeAmountCents: data.type === "recharge" ? data.rechargeAmountCents : 0,
        discountAmountCents: data.type === "discount" ? data.discountAmountCents : 0,
        minOrderCents: data.type === "discount" ? data.minOrderCents : 0,
        productId: product?.id || null,
        productName: product?.name || null,
        productVariantId: variant?.id || null,
        productVariantName: variant?.name || null,
        expiresAt,
        createdBy: admin.user.id,
        createdAt: now,
      }),
      db.insert(vouchers).values(codes.map((code) => ({
        batchId,
        code,
        type: data.type,
        rechargeAmountCents: data.type === "recharge" ? data.rechargeAmountCents : 0,
        discountAmountCents: data.type === "discount" ? data.discountAmountCents : 0,
        minOrderCents: data.type === "discount" ? data.minOrderCents : 0,
        productId: product?.id || null,
        productName: product?.name || null,
        productVariantId: variant?.id || null,
        productVariantName: variant?.name || null,
        expiresAt,
        createdAt: now,
      }))),
    ]);
    revalidatePath("/admin/vouchers");
    return { success: true as const, message: `已生成 ${codes.length} 张${voucherLabel(data.type)}`, codes, batchId };
  } catch {
    return { success: false as const, message: "卡券生成失败，请重试" };
  }
}

export async function getAdminVoucherBatches() {
  await requireAdmin();
  const [batches, stats] = await Promise.all([
    db.query.voucherBatches.findMany({ orderBy: [desc(voucherBatches.createdAt)], limit: 100 }),
    db.all(sql`
      SELECT batch_id,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS claimed,
        SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
        SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed
      FROM vouchers GROUP BY batch_id
    `),
  ]);
  const statMap = new Map((stats as Array<Record<string, unknown>>).map((row) => [String(row.batch_id), {
    total: Number(row.total || 0), available: Number(row.available || 0), claimed: Number(row.claimed || 0), reserved: Number(row.reserved || 0), redeemed: Number(row.redeemed || 0),
  }]));
  return batches.map((batch) => ({ ...batch, stats: statMap.get(batch.id) || { total: 0, available: 0, claimed: 0, reserved: 0, redeemed: 0 } }));
}

export async function getVoucherBatchCodes(batchId: string) {
  await requireAdmin();
  const batch = await db.query.voucherBatches.findFirst({ where: eq(voucherBatches.id, batchId), columns: { id: true, name: true } });
  if (!batch) return { success: false as const, message: "卡券批次不存在" };
  const items = await db.query.vouchers.findMany({ where: eq(vouchers.batchId, batchId), columns: { code: true }, orderBy: [vouchers.createdAt] });
  return { success: true as const, name: batch.name, codes: items.map((item) => item.code) };
}

export async function getVoucherOverview() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId === "admin") return { success: false as const, message: "请先登录" };
  const now = new Date();
  const items = await db.query.vouchers.findMany({
    where: and(eq(vouchers.ownerUserId, userId), or(eq(vouchers.status, "claimed"), eq(vouchers.status, "redeemed"), eq(vouchers.status, "reserved"))),
    orderBy: [desc(vouchers.createdAt)],
    limit: 100,
  });
  return {
    success: true as const,
    items: items.map((item) => ({ ...item, expired: Boolean(item.expiresAt && item.expiresAt <= now) })),
  };
}

export async function getAvailableDiscountVouchers(userId: string) {
  const now = new Date();
  return db.query.vouchers.findMany({
    where: and(eq(vouchers.ownerUserId, userId), eq(vouchers.type, "discount"), eq(vouchers.status, "claimed"), or(isNull(vouchers.expiresAt), sql`${vouchers.expiresAt} > ${now}`)),
    columns: { id: true, discountAmountCents: true, minOrderCents: true, expiresAt: true, code: true },
    orderBy: [desc(vouchers.createdAt)],
  });
}

export async function redeemVoucher(rawCode: string): Promise<{ success: boolean; message: string; type?: "recharge" | "product" | "discount"; orderNo?: string; requiresSecondFactor?: boolean }> {
  const session = await auth();
  const user = session?.user as { id?: string; username?: string; image?: string } | undefined;
  if (!user?.id || user.id === "admin") return { success: false, message: "请先登录" };
  try {
    await requireSecondFactor(user.id);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : SECOND_FACTOR_REQUIRED_MESSAGE, requiresSecondFactor: true };
  }
  const code = normalizeCode(rawCode);
  if (!/^G3D-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(code)) return { success: false, message: "请输入正确的卡券码" };
  const voucher = await db.query.vouchers.findFirst({ where: eq(vouchers.code, code) });
  if (!voucher || voucher.status !== "available") return { success: false, message: "卡券无效、已使用或已失效" };
  if (voucher.expiresAt && voucher.expiresAt <= new Date()) {
    await db.update(vouchers).set({ status: "expired" }).where(and(eq(vouchers.id, voucher.id), eq(vouchers.status, "available")));
    return { success: false, message: "该卡券已过期" };
  }
  const nowEpoch = Math.floor(Date.now() / 1000);
  const d1 = getD1Binding();

  if (voucher.type === "recharge") {
    const transactionKey = `voucher:recharge:${voucher.id}`;
    const results = await d1.batch<{ id: string }>([
      d1.prepare(`UPDATE vouchers SET status = 'redeemed', owner_user_id = ?, redeemed_at = ? WHERE id = ? AND status = 'available' RETURNING id`).bind(user.id, nowEpoch, voucher.id),
      d1.prepare(`UPDATE users SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM vouchers WHERE id = ? AND status = 'redeemed' AND owner_user_id = ?)`)
        .bind(voucher.rechargeAmountCents, nowEpoch, user.id, voucher.id, user.id),
      d1.prepare(`INSERT INTO wallet_transactions (id,user_id,type,amount_cents,balance_after_cents,reference_type,reference_id,idempotency_key,description,created_at) SELECT ?,id,'recharge',?,balance_cents,'voucher',?,?,?,? FROM users WHERE id = ? ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(crypto.randomUUID(), voucher.rechargeAmountCents, voucher.id, transactionKey, `兑换充值券 ${voucher.code}`, nowEpoch, user.id),
    ]);
    if (!results[0]?.results[0]) return { success: false, message: "卡券无效、已使用或已失效" };
    revalidatePath("/account/wallet");
    revalidatePath("/account/vouchers");
    return { success: true, message: `已充值 ¥${(voucher.rechargeAmountCents / 100).toFixed(2)}`, type: "recharge" };
  }

  if (voucher.type === "discount") {
    const results = await d1.batch<{ id: string }>([
      d1.prepare(`UPDATE vouchers SET status = 'claimed', owner_user_id = ? WHERE id = ? AND status = 'available' RETURNING id`).bind(user.id, voucher.id),
    ]);
    if (!results[0]?.results[0]) return { success: false, message: "卡券无效、已使用或已失效" };
    revalidatePath("/account/vouchers");
    return { success: true, message: "满减券已存入账号，可在结算时使用", type: "discount" };
  }

  if (!voucher.productId) return { success: false, message: "该商品兑换券配置不完整，请联系客服" };
  const product = await db.query.products.findFirst({ where: and(eq(products.id, voucher.productId), eq(products.isActive, true)) });
  if (!product) return { success: false, message: "兑换商品已下架，请联系客服" };
  const variant = voucher.productVariantId ? await db.query.productVariants.findFirst({ where: and(eq(productVariants.id, voucher.productVariantId), eq(productVariants.isActive, true)), columns: { id: true, name: true, price: true } }) : null;
  if (voucher.productVariantId && !variant) return { success: false, message: "兑换券绑定的商品规格已下架，请联系客服" };
  const cardVariantCondition = variant ? eq(cards.variantId, variant.id) : isNull(cards.variantId);
  const manualFulfillment = isManualFulfillment(product.fulfillmentMode);
  const [card] = manualFulfillment
    ? []
    : await db.select({ id: cards.id }).from(cards).where(and(eq(cards.productId, product.id), cardVariantCondition, eq(cards.status, "available"))).limit(1);
  if (!manualFulfillment && !card) return { success: false, message: "兑换商品暂时缺货，请联系客服" };
  const orderId = crypto.randomUUID();
  const orderNo = generateOrderNo();
  const dueAt = getFulfillmentDueAt(product.fulfillmentMode, new Date());
  const dueEpoch = dueAt ? Math.floor(dueAt.getTime() / 1000) : null;
  const results = await d1.batch<{ id: string }>([
    d1.prepare(`INSERT INTO orders (id,order_no,product_id,product_variant_id,product_variant_name,product_name,product_price,quantity,total_amount,original_amount,payment_method,status,fulfillment_mode,trade_no,user_id,username,user_image,paid_at,delivery_due_at,fulfilled_at,expired_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,'0.00',?,'voucher',?,?, ?,?,?, ?,?,?,?,?,?,?
      WHERE EXISTS (SELECT 1 FROM vouchers WHERE id = ? AND status = 'available')
        AND (? = 1 OR EXISTS (SELECT 1 FROM cards WHERE id = ? AND status = 'available')) RETURNING id`)
      .bind(orderId, orderNo, product.id, variant?.id || null, variant?.name || null, product.name, variant?.price || product.price, 1, variant?.price || product.price, manualFulfillment ? "paid" : "completed", product.fulfillmentMode, `VOUCHER-${voucher.id}`, user.id, user.username || null, user.image || null, nowEpoch, dueEpoch, manualFulfillment ? null : nowEpoch, nowEpoch, nowEpoch, nowEpoch, voucher.id, manualFulfillment ? 1 : 0, card?.id || ""),
    d1.prepare(`UPDATE cards SET status = 'sold', order_id = ?, sold_at = ? WHERE ? = 0 AND id = ? AND status = 'available' AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`)
      .bind(orderId, nowEpoch, manualFulfillment ? 1 : 0, card?.id || "", orderId),
    d1.prepare(`UPDATE vouchers SET status = 'redeemed', owner_user_id = ?, order_id = ?, redeemed_at = ? WHERE id = ? AND status = 'available' AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`)
      .bind(user.id, orderId, nowEpoch, voucher.id, orderId),
    d1.prepare(`UPDATE products SET sales_count = sales_count + 1, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ?)`)
      .bind(nowEpoch, product.id, orderId),
  ]);
  if (!results[0]?.results[0]) return { success: false, message: "卡券已使用或库存刚刚变化，请刷新后重试" };
  revalidatePath("/");
  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/order/my");
  revalidatePath("/account/vouchers");
  return {
    success: true,
    message: manualFulfillment ? "商品兑换成功，订单已进入人工发货队列" : "商品兑换成功，卡密已发放至我的订单",
    type: "product",
    orderNo,
  };
}
