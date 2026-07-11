CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`order_id` text,
	`locked_at` integer,
	`sold_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cards_product_id_idx` ON `cards` (`product_id`);--> statement-breakpoint
CREATE INDEX `cards_status_idx` ON `cards` (`status`);--> statement-breakpoint
CREATE INDEX `cards_order_id_idx` ON `cards` (`order_id`);--> statement-breakpoint
CREATE INDEX `cards_product_available_idx` ON `cards` (`product_id`,`status`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_sort_order_idx` ON `categories` (`sort_order`);--> statement-breakpoint
CREATE INDEX `categories_is_active_idx` ON `categories` (`is_active`);--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_tokens_token_hash_unique` ON `email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_user_created_idx` ON `email_verification_tokens` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_expires_idx` ON `email_verification_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_rate_limits` (
	`identifier` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer NOT NULL,
	`last_attempt_at` integer NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`username` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_accounts_provider_account_idx` ON `oauth_accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `oauth_accounts_user_id_idx` ON `oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_no` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`product_price` text NOT NULL,
	`quantity` integer NOT NULL,
	`total_amount` text NOT NULL,
	`payment_method` text DEFAULT 'ldc' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`trade_no` text,
	`user_id` text,
	`username` text,
	`user_image` text,
	`email` text,
	`query_password` text,
	`paid_at` integer,
	`expired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`remark` text,
	`admin_remark` text,
	`refund_reason` text,
	`refund_requested_at` integer,
	`refunded_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_no_unique` ON `orders` (`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_no_idx` ON `orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_email_idx` ON `orders` (`email`);--> statement-breakpoint
CREATE INDEX `orders_product_id_idx` ON `orders` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_trade_no_idx` ON `orders` (`trade_no`);--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_refund_status_idx` ON `orders` (`status`) WHERE status IN ('refund_pending', 'refund_rejected', 'refunded');--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`content` text,
	`price` text NOT NULL,
	`original_price` text,
	`cover_image` text,
	`images` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`min_quantity` integer DEFAULT 1 NOT NULL,
	`max_quantity` integer DEFAULT 10 NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_is_active_idx` ON `products` (`is_active`);--> statement-breakpoint
CREATE INDEX `products_is_featured_idx` ON `products` (`is_featured`);--> statement-breakpoint
CREATE INDEX `products_sort_order_idx` ON `products` (`sort_order`);--> statement-breakpoint
CREATE TABLE `recharge_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`recharge_no` text NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`provider` text DEFAULT 'ldc' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`trade_no` text,
	`expired_at` integer NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recharge_orders_recharge_no_unique` ON `recharge_orders` (`recharge_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `recharge_orders_trade_no_unique` ON `recharge_orders` (`trade_no`);--> statement-breakpoint
CREATE INDEX `recharge_orders_user_created_idx` ON `recharge_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recharge_orders_status_idx` ON `recharge_orders` (`status`);--> statement-breakpoint
CREATE TABLE `restock_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`user_image` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `restock_requests_product_id_idx` ON `restock_requests` (`product_id`);--> statement-breakpoint
CREATE INDEX `restock_requests_user_id_idx` ON `restock_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `restock_requests_created_at_idx` ON `restock_requests` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `restock_requests_product_user_idx` ON `restock_requests` (`product_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`description` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`image` text,
	`password_hash` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`email_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`balance_after_cents` integer NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`idempotency_key` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_transactions_idempotency_key_unique` ON `wallet_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_user_created_idx` ON `wallet_transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_reference_idx` ON `wallet_transactions` (`reference_type`,`reference_id`);