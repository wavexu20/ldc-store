ALTER TABLE `users` ADD `two_factor_secret` text;
ALTER TABLE `users` ADD `two_factor_enabled_at` integer;

CREATE TABLE `password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);
CREATE INDEX `password_reset_tokens_user_created_idx` ON `password_reset_tokens` (`user_id`, `created_at`);
CREATE INDEX `password_reset_tokens_expires_idx` ON `password_reset_tokens` (`expires_at`);

CREATE TABLE `two_factor_recovery_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `code_hash` text NOT NULL,
  `used_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `two_factor_recovery_codes_code_hash_unique` ON `two_factor_recovery_codes` (`code_hash`);
CREATE INDEX `two_factor_recovery_codes_user_idx` ON `two_factor_recovery_codes` (`user_id`);
