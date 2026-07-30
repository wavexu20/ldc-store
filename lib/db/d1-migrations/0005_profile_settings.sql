ALTER TABLE `users` ADD `name_source` text NOT NULL DEFAULT 'oauth';
ALTER TABLE `users` ADD `avatar_source` text NOT NULL DEFAULT 'oauth';

UPDATE `users` SET `name_source` = 'custom' WHERE `password_hash` IS NOT NULL;
