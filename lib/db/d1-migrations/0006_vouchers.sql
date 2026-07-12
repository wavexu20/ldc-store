CREATE TABLE `voucher_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `recharge_amount_cents` integer NOT NULL DEFAULT 0,
  `discount_amount_cents` integer NOT NULL DEFAULT 0,
  `min_order_cents` integer NOT NULL DEFAULT 0,
  `product_id` text,
  `product_name` text,
  `quantity` integer NOT NULL,
  `expires_at` integer,
  `created_by` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `voucher_batches_created_at_idx` ON `voucher_batches` (`created_at`);
--> statement-breakpoint
CREATE INDEX `voucher_batches_type_idx` ON `voucher_batches` (`type`);
--> statement-breakpoint
CREATE TABLE `vouchers` (
  `id` text PRIMARY KEY NOT NULL,
  `batch_id` text NOT NULL,
  `code` text NOT NULL,
  `type` text NOT NULL,
  `status` text NOT NULL DEFAULT 'available',
  `recharge_amount_cents` integer NOT NULL DEFAULT 0,
  `discount_amount_cents` integer NOT NULL DEFAULT 0,
  `min_order_cents` integer NOT NULL DEFAULT 0,
  `product_id` text,
  `product_name` text,
  `owner_user_id` text,
  `order_id` text,
  `expires_at` integer,
  `redeemed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`batch_id`) REFERENCES `voucher_batches`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vouchers_code_unique` ON `vouchers` (`code`);
--> statement-breakpoint
CREATE INDEX `vouchers_batch_idx` ON `vouchers` (`batch_id`);
--> statement-breakpoint
CREATE INDEX `vouchers_owner_status_idx` ON `vouchers` (`owner_user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `vouchers_order_idx` ON `vouchers` (`order_id`);
--> statement-breakpoint
CREATE INDEX `vouchers_status_expires_idx` ON `vouchers` (`status`,`expires_at`);
