import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ============================================
// Enums
// ============================================

const cardStatusValues = [
  "available", // 可用
  "locked",    // 已锁定（待支付）
  "sold",      // 已售出
  "refunded",  // 已退款
] as const;
export const cardStatusEnum = { enumValues: cardStatusValues };

const orderStatusValues = [
  "pending",          // 待支付
  "paid",             // 已支付
  "completed",        // 已完成（卡密已发放）
  "expired",          // 已过期
  "refund_pending",   // 退款审核中
  "refund_rejected",  // 退款已拒绝
  "refunded",         // 已退款
] as const;
export const orderStatusEnum = { enumValues: orderStatusValues };

const paymentMethodValues = [
  "gateway",   // Game3DTech 自有支付网关
  "ldc",       // Linux DO Credit
  "balance",   // 账户余额
  "alipay",    // 支付宝（预留）
  "wechat",    // 微信支付（预留）
  "usdt",      // USDT（预留）
  "voucher",   // 卡券全额兑换
] as const;
export const paymentMethodEnum = { enumValues: paymentMethodValues };

const userRoleValues = ["user", "admin"] as const;
const userStatusValues = ["active", "disabled"] as const;
const walletTransactionTypeValues = [
  "recharge",
  "purchase",
  "refund",
  "adjustment",
] as const;
const rechargeStatusValues = [
  "pending",
  "paid",
  "expired",
  "cancelled",
] as const;
const memberAssetValues = ["bonus", "points"] as const;
const memberTransactionTypeValues = [
  "recharge_bonus",
  "purchase",
  "purchase_reward",
  "refund",
  "adjustment",
] as const;
const supportConversationStatusValues = ["open", "closed"] as const;
const supportSenderValues = ["visitor", "admin", "system"] as const;
const voucherTypeValues = ["recharge", "product", "discount"] as const;
const voucherStatusValues = ["available", "claimed", "reserved", "redeemed", "disabled", "expired"] as const;
export const voucherTypeEnum = { enumValues: voucherTypeValues };
export const voucherStatusEnum = { enumValues: voucherStatusValues };

const id = (name: string) =>
  text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => integer(name, { mode: "timestamp" });
const createdAt = () => timestamp("created_at").$defaultFn(() => new Date()).notNull();
const updatedAt = () => timestamp("updated_at").$defaultFn(() => new Date()).notNull();

// ============================================
// Users & linked identities
// ============================================

export const users = sqliteTable("users", {
  id: id("id"),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  nameSource: text("name_source", { enum: ["oauth", "custom"] }).default("oauth").notNull(),
  avatarSource: text("avatar_source", { enum: ["oauth", "custom"] }).default("oauth").notNull(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: userRoleValues }).default("user").notNull(),
  status: text("status", { enum: userStatusValues }).default("active").notNull(),
  memberNo: text("member_no").unique(),
  balanceCents: integer("balance_cents").default(0).notNull(),
  bonusBalanceCents: integer("bonus_balance_cents").default(0).notNull(),
  pointsBalance: integer("points_balance").default(0).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabledAt: timestamp("two_factor_enabled_at"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_status_idx").on(table.status),
]);

export const oauthAccounts = sqliteTable("oauth_accounts", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  username: text("username"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("oauth_accounts_provider_account_idx").on(table.provider, table.providerAccountId),
  index("oauth_accounts_user_id_idx").on(table.userId),
]);

export const walletTransactions = sqliteTable("wallet_transactions", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  type: text("type", { enum: walletTransactionTypeValues }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
}, (table) => [
  index("wallet_transactions_user_created_idx").on(table.userId, table.createdAt),
  index("wallet_transactions_reference_idx").on(table.referenceType, table.referenceId),
]);

export const rechargeOrders = sqliteTable("recharge_orders", {
  id: id("id"),
  rechargeNo: text("recharge_no").notNull().unique(),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  bonusCents: integer("bonus_cents").default(0).notNull(),
  // 数据库默认值保留为 ldc 兼容历史库；新充值单显式写入 gateway。
  provider: text("provider").default("ldc").notNull(),
  status: text("status", { enum: rechargeStatusValues }).default("pending").notNull(),
  tradeNo: text("trade_no").unique(),
  expiredAt: timestamp("expired_at").notNull(),
  paidAt: timestamp("paid_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("recharge_orders_user_created_idx").on(table.userId, table.createdAt),
  index("recharge_orders_status_idx").on(table.status),
]);

export const memberTransactions = sqliteTable("member_transactions", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  asset: text("asset", { enum: memberAssetValues }).notNull(),
  type: text("type", { enum: memberTransactionTypeValues }).notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
}, (table) => [
  index("member_transactions_user_created_idx").on(table.userId, table.createdAt),
  index("member_transactions_reference_idx").on(table.referenceType, table.referenceId),
]);

export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: createdAt(),
}, (table) => [
  index("email_verification_tokens_user_created_idx").on(table.userId, table.createdAt),
  index("email_verification_tokens_expires_idx").on(table.expiresAt),
]);

// ============================================
// Categories Table (商品分类)
// ============================================

export const categories = sqliteTable("categories", {
  id: id("id"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"), // Lucide icon name
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("categories_sort_order_idx").on(table.sortOrder),
  index("categories_is_active_idx").on(table.isActive),
]);

// ============================================
// Products Table (商品)
// ============================================

export type ProductTranslation = {
  name?: string;
  description?: string;
  content?: string;
};

export type ProductTranslations = Partial<
  Record<"en" | "ko" | "zh" | "ru" | "de" | "id" | "hi", ProductTranslation>
>;

export const products = sqliteTable("products", {
  id: id("id"),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"), // 简短描述
  content: text("content"), // 富文本/Markdown 详细描述
  translations: text("translations", { mode: "json" }).$type<ProductTranslations>(),
  price: text("price").notNull(),
  originalPrice: text("original_price"), // 原价（用于显示折扣）
  coverImage: text("cover_image"),
  images: text("images", { mode: "json" }).$type<string[]>(), // 商品图片数组
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  isFeatured: integer("is_featured", { mode: "boolean" }).default(false).notNull(), // 热门/推荐
  sortOrder: integer("sort_order").default(0).notNull(),
  minQuantity: integer("min_quantity").default(1).notNull(),
  maxQuantity: integer("max_quantity").default(10).notNull(),
  salesCount: integer("sales_count").default(0).notNull(), // 销量统计
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("products_category_id_idx").on(table.categoryId),
  index("products_is_active_idx").on(table.isActive),
  index("products_is_featured_idx").on(table.isFeatured),
  index("products_sort_order_idx").on(table.sortOrder),
]);

// ============================================
// Cards Table (卡密/库存)
// ============================================

export const cards = sqliteTable("cards", {
  id: id("id"),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(), // 卡密内容
  status: text("status", { enum: cardStatusValues }).default("available").notNull(),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  lockedAt: timestamp("locked_at"), // 锁定时间
  soldAt: timestamp("sold_at"), // 售出时间
  createdAt: createdAt(),
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

export const orders = sqliteTable("orders", {
  id: id("id"),
  orderNo: text("order_no").notNull().unique(), // 订单号
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(), // 冗余存储商品名
  productPrice: text("product_price").notNull(), // 冗余存储单价
  quantity: integer("quantity").notNull(),
  totalAmount: text("total_amount").notNull(),
  originalAmount: text("original_amount"),
  cashSpentCents: integer("cash_spent_cents").default(0).notNull(),
  bonusSpentCents: integer("bonus_spent_cents").default(0).notNull(),
  pointsRedeemed: integer("points_redeemed").default(0).notNull(),
  pointsEarned: integer("points_earned").default(0).notNull(),
  
  // 支付信息
  // 数据库默认值保留为 ldc 兼容历史库；新订单由业务层显式写入 gateway。
  paymentMethod: text("payment_method", { enum: paymentMethodValues }).default("ldc").notNull(),
  status: text("status", { enum: orderStatusValues }).default("pending").notNull(),
  tradeNo: text("trade_no"), // 支付平台订单号
  
  // 用户信息（OSS登录用户）
  userId: text("user_id"), // Linux DO 用户ID
  username: text("username"), // Linux DO 用户名
  userImage: text("user_image"), // Linux DO 用户头像

  // 联系信息（游客下单时使用）
  email: text("email"), // 游客下单时必填
  queryPassword: text("query_password"), // 游客下单时必填（哈希）
  
  // 时间戳
  paidAt: timestamp("paid_at"),
  expiredAt: timestamp("expired_at"), // 过期时间
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  
  // 备注
  remark: text("remark"),
  adminRemark: text("admin_remark"), // 管理员备注
  
  // 退款相关
  refundReason: text("refund_reason"), // 退款原因
  refundRequestedAt: timestamp("refund_requested_at"), // 申请退款时间
  refundedAt: timestamp("refunded_at"), // 退款完成时间
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
// Voucher batches & externally distributed vouchers
// ============================================

export const voucherBatches = sqliteTable("voucher_batches", {
  id: id("id"),
  name: text("name").notNull(),
  type: text("type", { enum: voucherTypeValues }).notNull(),
  rechargeAmountCents: integer("recharge_amount_cents").default(0).notNull(),
  discountAmountCents: integer("discount_amount_cents").default(0).notNull(),
  minOrderCents: integer("min_order_cents").default(0).notNull(),
  productId: text("product_id").references(() => products.id, { onDelete: "restrict" }),
  productName: text("product_name"),
  quantity: integer("quantity").notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (table) => [
  index("voucher_batches_created_at_idx").on(table.createdAt),
  index("voucher_batches_type_idx").on(table.type),
]);

export const vouchers = sqliteTable("vouchers", {
  id: id("id"),
  batchId: text("batch_id").references(() => voucherBatches.id, { onDelete: "cascade" }).notNull(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: voucherTypeValues }).notNull(),
  status: text("status", { enum: voucherStatusValues }).default("available").notNull(),
  rechargeAmountCents: integer("recharge_amount_cents").default(0).notNull(),
  discountAmountCents: integer("discount_amount_cents").default(0).notNull(),
  minOrderCents: integer("min_order_cents").default(0).notNull(),
  productId: text("product_id").references(() => products.id, { onDelete: "restrict" }),
  productName: text("product_name"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at"),
  redeemedAt: timestamp("redeemed_at"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("vouchers_code_unique").on(table.code),
  index("vouchers_batch_idx").on(table.batchId),
  index("vouchers_owner_status_idx").on(table.ownerUserId, table.status),
  index("vouchers_order_idx").on(table.orderId),
  index("vouchers_status_expires_idx").on(table.status, table.expiresAt),
]);

// ============================================
// System Settings Table (系统设置)
// ============================================

export const settings = sqliteTable("settings", {
  id: id("id"),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: updatedAt(),
});

// ============================================
// Announcements Table (公告)
// ============================================

export const announcements = sqliteTable("announcements", {
  id: id("id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ============================================
// Restock Requests Table (催补货请求)
// ============================================

export const restockRequests = sqliteTable("restock_requests", {
  id: id("id"),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  userImage: text("user_image"),
  createdAt: createdAt(),
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

export const loginRateLimits = sqliteTable("login_rate_limits", {
  identifier: text("identifier").primaryKey(),
  count: integer("count").default(0).notNull(),
  firstAttemptAt: timestamp("first_attempt_at").$defaultFn(() => new Date()).notNull(),
  lastAttemptAt: timestamp("last_attempt_at").$defaultFn(() => new Date()).notNull(),
  blockedUntil: timestamp("blocked_until"),
});

// ============================================
// Realtime customer support
// ============================================

export const supportConversations = sqliteTable("support_conversations", {
  id: id("id"),
  visitorKey: text("visitor_key").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  visitorName: text("visitor_name"),
  visitorEmail: text("visitor_email"),
  status: text("status", { enum: supportConversationStatusValues }).default("open").notNull(),
  lastMessage: text("last_message"),
  unreadAdmin: integer("unread_admin").default(0).notNull(),
  unreadVisitor: integer("unread_visitor").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("support_conversations_visitor_status_idx").on(table.visitorKey, table.status),
  index("support_conversations_status_updated_idx").on(table.status, table.updatedAt),
]);

export const supportMessages = sqliteTable("support_messages", {
  id: id("id"),
  conversationId: text("conversation_id").references(() => supportConversations.id, { onDelete: "cascade" }).notNull(),
  senderType: text("sender_type", { enum: supportSenderValues }).notNull(),
  senderId: text("sender_id"),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (table) => [
  index("support_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

// ============================================
// Relations
// ============================================

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: createdAt(),
}, (table) => [
  index("password_reset_tokens_user_created_idx").on(table.userId, table.createdAt),
  index("password_reset_tokens_expires_idx").on(table.expiresAt),
]);

export const twoFactorRecoveryCodes = sqliteTable("two_factor_recovery_codes", {
  id: id("id"),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  codeHash: text("code_hash").notNull().unique(),
  usedAt: timestamp("used_at"),
  createdAt: createdAt(),
}, (table) => [
  index("two_factor_recovery_codes_user_idx").on(table.userId),
]);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  cards: many(cards),
  restockRequests: many(restockRequests),
  voucherBatches: many(voucherBatches),
  vouchers: many(vouchers),
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
  vouchers: many(vouchers),
}));

export const voucherBatchesRelations = relations(voucherBatches, ({ one, many }) => ({
  product: one(products, { fields: [voucherBatches.productId], references: [products.id] }),
  creator: one(users, { fields: [voucherBatches.createdBy], references: [users.id] }),
  vouchers: many(vouchers),
}));

export const vouchersRelations = relations(vouchers, ({ one }) => ({
  batch: one(voucherBatches, { fields: [vouchers.batchId], references: [voucherBatches.id] }),
  product: one(products, { fields: [vouchers.productId], references: [products.id] }),
  owner: one(users, { fields: [vouchers.ownerUserId], references: [users.id] }),
  order: one(orders, { fields: [vouchers.orderId], references: [orders.id] }),
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
  passwordResetTokens: many(passwordResetTokens),
  twoFactorRecoveryCodes: many(twoFactorRecoveryCodes),
  memberTransactions: many(memberTransactions),
  voucherBatches: many(voucherBatches),
  vouchers: many(vouchers),
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

export const memberTransactionsRelations = relations(memberTransactions, ({ one }) => ({
  user: one(users, { fields: [memberTransactions.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const twoFactorRecoveryCodesRelations = relations(twoFactorRecoveryCodes, ({ one }) => ({
  user: one(users, { fields: [twoFactorRecoveryCodes.userId], references: [users.id] }),
}));

export const supportConversationsRelations = relations(supportConversations, ({ one, many }) => ({
  user: one(users, { fields: [supportConversations.userId], references: [users.id] }),
  messages: many(supportMessages),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  conversation: one(supportConversations, {
    fields: [supportMessages.conversationId],
    references: [supportConversations.id],
  }),
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
export type MemberTransaction = typeof memberTransactions.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type TwoFactorRecoveryCode = typeof twoFactorRecoveryCodes.$inferSelect;
export type SupportConversation = typeof supportConversations.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type VoucherBatch = typeof voucherBatches.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;

export type CardStatus = (typeof cardStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type VoucherType = (typeof voucherTypeEnum.enumValues)[number];
export type VoucherStatus = (typeof voucherStatusEnum.enumValues)[number];
