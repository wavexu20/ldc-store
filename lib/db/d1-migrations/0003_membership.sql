ALTER TABLE `users` ADD `member_no` text;
ALTER TABLE `users` ADD `bonus_balance_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `users` ADD `points_balance` integer DEFAULT 0 NOT NULL;
UPDATE `users`
SET `member_no` = 'G3D-' || upper(substr(replace(`id`, '-', ''), 1, 10))
WHERE `member_no` IS NULL;
CREATE UNIQUE INDEX `users_member_no_unique` ON `users` (`member_no`);

ALTER TABLE `recharge_orders` ADD `bonus_cents` integer DEFAULT 0 NOT NULL;

ALTER TABLE `orders` ADD `original_amount` text;
ALTER TABLE `orders` ADD `cash_spent_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `orders` ADD `bonus_spent_cents` integer DEFAULT 0 NOT NULL;
ALTER TABLE `orders` ADD `points_redeemed` integer DEFAULT 0 NOT NULL;
ALTER TABLE `orders` ADD `points_earned` integer DEFAULT 0 NOT NULL;

CREATE TABLE `member_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `asset` text NOT NULL,
  `type` text NOT NULL,
  `amount` integer NOT NULL,
  `balance_after` integer NOT NULL,
  `reference_type` text,
  `reference_id` text,
  `idempotency_key` text NOT NULL,
  `description` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE UNIQUE INDEX `member_transactions_idempotency_key_unique`
  ON `member_transactions` (`idempotency_key`);
CREATE INDEX `member_transactions_user_created_idx`
  ON `member_transactions` (`user_id`, `created_at`);
CREATE INDEX `member_transactions_reference_idx`
  ON `member_transactions` (`reference_type`, `reference_id`);
