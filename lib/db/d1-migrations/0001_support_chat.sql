CREATE TABLE `support_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `visitor_key` text NOT NULL,
  `user_id` text,
  `visitor_name` text,
  `visitor_email` text,
  `status` text DEFAULT 'open' NOT NULL,
  `last_message` text,
  `unread_admin` integer DEFAULT 0 NOT NULL,
  `unread_visitor` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_conversations_visitor_status_idx` ON `support_conversations` (`visitor_key`,`status`);
--> statement-breakpoint
CREATE INDEX `support_conversations_status_updated_idx` ON `support_conversations` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `support_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `sender_type` text NOT NULL,
  `sender_id` text,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_messages_conversation_created_idx` ON `support_messages` (`conversation_id`,`created_at`);
