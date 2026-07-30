INSERT OR IGNORE INTO categories
  (id, name, slug, description, icon, sort_order, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000005', 'AI', 'ai', 'AI 工具、订阅与服务', '✨', 4, 1, unixepoch(), unixepoch());
--> statement-breakpoint
CREATE TABLE `product_previews` (
  `id` text PRIMARY KEY NOT NULL,
  `token` text NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_previews_token_unique` ON `product_previews` (`token`);
--> statement-breakpoint
CREATE INDEX `product_previews_expires_idx` ON `product_previews` (`expires_at`);
