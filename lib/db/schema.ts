import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  decimal,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================
// Enums
// ============================================

export const cardStatusEnum = pgEnum("card_status", [
  "available", // 可用
  "locked",    // 已锁定（待支付）
  "sold",      // 已售出
  "refunded",  // 已退款
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",          // 待支付
  "paid",             // 已支付
  "completed",        // 已完成（卡密已发放）
  "expired",          // 已过期
  "refund_pending",   // 退款审核中
  "refund_rejected",  // 退款已拒绝
  "refunded",         // 已退款
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "ldc",       // Linux DO Credit
  "balance",   // 账户余额
  "alipay",    // 支付宝（预留）
  "wechat",    // 微信支付（预留）
  "usdt",      // USDT（预留）
]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "recharge",
  "purchase",
  "refund",
  "adjustment",
]);
export const rechargeStatusEnum = pgEnum("recharge_status", [
  "pending",
  "paid",
  "expired",
  "cancelled",
]);

// ============================================
// Users & linked identities
// ============================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").default("user").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  balanceCents: integer("balance_cents").default(0).notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_status_idx").on(table.status),
]);

export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  username: text("username"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("oauth_accounts_provider_account_idx").on(table.provider, table.providerAccountId),
  index("oauth_accounts_user_id_idx").on(table.userId),
]);

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  type: walletTransactionTypeEnum("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("wallet_transactions_user_created_idx").on(table.userId, table.createdAt),
  index("wallet_transactions_reference_idx").on(table.referenceType, table.referenceId),
]);

export const rechargeOrders = pgTable("recharge_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  rechargeNo: text("recharge_no").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  provider: text("provider").default("ldc").notNull(),
  status: rechargeStatusEnum("status").default("pending").notNull(),
  tradeNo: text("trade_no").unique(),
  expiredAt: timestamp("expired_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("recharge_orders_user_created_idx").on(table.userId, table.createdAt),
  index("recharge_orders_status_idx").on(table.status),
]);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("email_verification_tokens_user_created_idx").on(table.userId, table.createdAt),
  index("email_verification_tokens_expires_idx").on(table.expiresAt),
]);

// ============================================
// Categories Table (商品分类)
// ============================================

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"), // Lucide icon name
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("categories_sort_order_idx").on(table.sortOrder),
  index("categories_is_active_idx").on(table.isActive),
]);

// ============================================
// Products Table (商品)
// ============================================

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"), // 简短描述
  content: text("content"), // 富文本/Markdown 详细描述
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }), // 原价（用于显示折扣）
  coverImage: text("cover_image"),
  images: text("images").array(), // 商品图片数组
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(), // 热门/推荐
  sortOrder: integer("sort_order").default(0).notNull(),
  minQuantity: integer("min_quantity").default(1).notNull(),
  maxQuantity: integer("max_quantity").default(10).notNull(),
  salesCount: integer("sales_count").default(0).notNull(), // 销量统计
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("products_category_id_idx").on(table.categoryId),
  index("products_is_active_idx").on(table.isActive),
  index("products_is_featured_idx").on(table.isFeatured),
  index("products_sort_order_idx").on(table.sortOrder),
]);

// ============================================
// Cards Table (卡密/库存)
// ============================================

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(), // 卡密内容
  status: cardStatusEnum("status").default("available").notNull(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at", { withTimezone: true }), // 锁定时间
  soldAt: timestamp("sold_at", { withTimezone: true }), // 售出时间
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("cards_product_id_idx").on(table.productId),
  index("cards_status_idx").on(table.status),
  index("cards_order_id_idx").on(table.orderId),
  // 用于快速查询可用库存
  index("cards_product_available_idx").on(table.productId, table.status),
]);

// ============================================
// Orders Table (订单)
// ============================================

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNo: text("order_no").notNull().unique(), // 订单号
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(), // 冗余存储商品名
  productPrice: decimal("product_price", { precision: 10, scale: 2 }).notNull(), // 冗余存储单价
  quantity: integer("quantity").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // 支付信息
  paymentMethod: paymentMethodEnum("payment_method").default("ldc").notNull(),
  status: orderStatusEnum("status").default("pending").notNull(),
  tradeNo: text("trade_no"), // 支付平台订单号
  
  // 用户信息（OSS登录用户）
  userId: text("user_id"), // Linux DO 用户ID
  username: text("username"), // Linux DO 用户名
  userImage: text("user_image"), // Linux DO 用户头像

  // 联系信息（游客下单时使用）
  email: text("email"), // 游客下单时必填
  queryPassword: text("query_password"), // 游客下单时必填（哈希）
  
  // 时间戳
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }), // 过期时间
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  
  // 备注
  remark: text("remark"),
  adminRemark: text("admin_remark"), // 管理员备注
  
  // 退款相关
  refundReason: text("refund_reason"), // 退款原因
  refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }), // 申请退款时间
  refundedAt: timestamp("refunded_at", { withTimezone: true }), // 退款完成时间
}, (table) => [
  uniqueIndex("orders_order_no_idx").on(table.orderNo),
  index("orders_status_idx").on(table.status),
  index("orders_email_idx").on(table.email),
  index("orders_product_id_idx").on(table.productId),
  index("orders_created_at_idx").on(table.createdAt),
  index("orders_trade_no_idx").on(table.tradeNo),
  index("orders_user_id_idx").on(table.userId),
  index("orders_refund_status_idx").on(table.status).where(sql`status IN ('refund_pending', 'refund_rejected', 'refunded')`),
]);

// ============================================
// System Settings Table (系统设置)
// ============================================

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Announcements Table (公告)
// ============================================

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// Restock Requests Table (催补货请求)
// ============================================

export const restockRequests = pgTable("restock_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  userImage: text("user_image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("restock_requests_product_id_idx").on(table.productId),
  index("restock_requests_user_id_idx").on(table.userId),
  index("restock_requests_created_at_idx").on(table.createdAt),
  // 关键：同一用户对同一商品只记录一次，避免计数被刷
  uniqueIndex("restock_requests_product_user_idx").on(table.productId, table.userId),
]);

// ============================================
// Login Rate Limits Table (登录限流)
// ============================================

export const loginRateLimits = pgTable("login_rate_limits", {
  identifier: text("identifier").primaryKey(),
  count: integer("count").default(0).notNull(),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});

// ============================================
// Relations
// ============================================

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  cards: many(cards),
  restockRequests: many(restockRequests),
}));

export const cardsRelations = relations(cards, ({ one }) => ({
  product: one(products, {
    fields: [cards.productId],
    references: [products.id],
  }),
  order: one(orders, {
    fields: [cards.orderId],
    references: [orders.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  cards: many(cards),
}));

export const restockRequestsRelations = relations(restockRequests, ({ one }) => ({
  product: one(products, {
    fields: [restockRequests.productId],
    references: [products.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  oauthAccounts: many(oauthAccounts),
  walletTransactions: many(walletTransactions),
  rechargeOrders: many(rechargeOrders),
  emailVerificationTokens: many(emailVerificationTokens),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  user: one(users, { fields: [walletTransactions.userId], references: [users.id] }),
}));

export const rechargeOrdersRelations = relations(rechargeOrders, ({ one }) => ({
  user: one(users, { fields: [rechargeOrders.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

// ============================================
// Type Exports
// ============================================

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;

export type RestockRequest = typeof restockRequests.$inferSelect;
export type NewRestockRequest = typeof restockRequests.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OauthAccount = typeof oauthAccounts.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type RechargeOrder = typeof rechargeOrders.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

export type CardStatus = (typeof cardStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
