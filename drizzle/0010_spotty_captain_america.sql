ALTER TABLE `notifications` ADD `chatMessageId` int;--> statement-breakpoint
CREATE INDEX `notifications_chat_message_idx` ON `notifications` (`chatMessageId`);
