CREATE TABLE `chat_message_hidden` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`hiddenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_message_hidden_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_message_hidden_message_user_idx` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `chat_message_reads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`readAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_message_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_message_reads_message_user_idx` UNIQUE(`messageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `friend_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `friend_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_requests_pair_idx` UNIQUE(`requesterId`,`recipientId`)
);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD `lastReadAt` timestamp;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `messageType` enum('text','voice') DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `mediaUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `mediaMimeType` varchar(64);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `durationSeconds` int;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `roomType` enum('direct','match','booking','support','moderated') DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `bookingId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `age` int;--> statement-breakpoint
ALTER TABLE `users` ADD `position` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isDiscoverable` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastSeenAt` timestamp;--> statement-breakpoint
CREATE INDEX `chat_message_hidden_user_idx` ON `chat_message_hidden` (`userId`,`messageId`);--> statement-breakpoint
CREATE INDEX `chat_message_reads_user_idx` ON `chat_message_reads` (`userId`,`messageId`);--> statement-breakpoint
CREATE INDEX `friend_requests_recipient_idx` ON `friend_requests` (`recipientId`,`status`);--> statement-breakpoint
CREATE INDEX `friend_requests_requester_idx` ON `friend_requests` (`requesterId`,`status`);--> statement-breakpoint
CREATE INDEX `chat_messages_room_created_idx` ON `chat_messages` (`roomId`,`createdAt`);