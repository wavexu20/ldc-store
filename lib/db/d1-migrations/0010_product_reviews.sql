CREATE TABLE `product_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `order_id` text NOT NULL,
  `user_id` text NOT NULL,
  `rating` integer NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
  `content` text NOT NULL CHECK (length(`content`) BETWEEN 5 AND 1000),
  `status` text DEFAULT 'published' NOT NULL CHECK (`status` IN ('published', 'hidden', 'deleted')),
  `admin_reply` text,
  `admin_replied_by` text,
  `admin_replied_at` integer,
  `deleted_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE UNIQUE INDEX `product_reviews_order_unique` ON `product_reviews` (`order_id`);
CREATE INDEX `product_reviews_product_status_created_idx` ON `product_reviews` (`product_id`, `status`, `created_at`);
CREATE INDEX `product_reviews_user_created_idx` ON `product_reviews` (`user_id`, `created_at`);
CREATE INDEX `product_reviews_status_created_idx` ON `product_reviews` (`status`, `created_at`);
