ALTER TABLE `products` ADD `fulfillment_mode` text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfillment_mode` text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_due_at` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD `fulfilled_at` integer;
--> statement-breakpoint
CREATE INDEX `orders_fulfillment_queue_idx` ON `orders` (`status`,`fulfillment_mode`,`delivery_due_at`);
