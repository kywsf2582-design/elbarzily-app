CREATE TABLE `blocked_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_users_blocker_blocked_idx` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE TABLE `chat_message_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_message_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_message_reactions_message_user_emoji_idx` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
ALTER TABLE `chat_messages` MODIFY COLUMN `messageType` enum('text','voice','image','video','file') NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `users` ADD `skillLevel` varchar(32);--> statement-breakpoint
CREATE INDEX `blocked_users_blocker_idx` ON `blocked_users` (`blockerId`);--> statement-breakpoint
CREATE INDEX `blocked_users_blocked_idx` ON `blocked_users` (`blockedId`);--> statement-breakpoint
CREATE INDEX `chat_message_reactions_message_idx` ON `chat_message_reactions` (`messageId`);