CREATE TABLE `chat_call_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`callId` varchar(96) NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`kind` enum('offer','answer','ice-candidate','renegotiate','bye') NOT NULL,
	`payload` text NOT NULL,
	`seq` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_call_signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_call_signals_call_seq_idx` UNIQUE(`callId`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `chat_message_reply_references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`replyToMessageId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_message_reply_references_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_reply_message_unique_idx` UNIQUE(`messageId`)
);
--> statement-breakpoint
CREATE INDEX `chat_call_signals_recipient_idx` ON `chat_call_signals` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `chat_call_signals_expiry_idx` ON `chat_call_signals` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `chat_reply_target_idx` ON `chat_message_reply_references` (`replyToMessageId`);