CREATE TABLE `chat_message_reply_references` (
  `id` int NOT NULL AUTO_INCREMENT,
  `messageId` int NOT NULL,
  `replyToMessageId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chat_message_reply_references_id` PRIMARY KEY(`id`),
  CONSTRAINT `chat_reply_message_unique_idx` UNIQUE(`messageId`),
  INDEX `chat_reply_target_idx` (`replyToMessageId`)
);
