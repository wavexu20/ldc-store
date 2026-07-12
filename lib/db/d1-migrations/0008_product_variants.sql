CREATE TABLE `product_variants` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `name` text NOT NULL,
  `price` text NOT NULL,
  `original_price` text,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `is_active` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_variants_product_sort_idx` ON `product_variants` (`product_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `product_variants_product_active_idx` ON `product_variants` (`product_id`,`is_active`);
--> statement-breakpoint
ALTER TABLE `cards` ADD `variant_id` text REFERENCES `product_variants`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `cards_variant_available_idx` ON `cards` (`variant_id`,`status`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `product_variant_id` text REFERENCES `product_variants`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `orders` ADD `product_variant_name` text;
--> statement-breakpoint
CREATE INDEX `orders_product_variant_idx` ON `orders` (`product_variant_id`);
--> statement-breakpoint
ALTER TABLE `voucher_batches` ADD `product_variant_id` text REFERENCES `product_variants`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `voucher_batches` ADD `product_variant_name` text;
--> statement-breakpoint
ALTER TABLE `vouchers` ADD `product_variant_id` text REFERENCES `product_variants`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `vouchers` ADD `product_variant_name` text;
