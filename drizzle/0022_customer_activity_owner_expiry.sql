ALTER TABLE `users` ADD COLUMN `ownerSubscriptionExpiresAt` timestamp NULL AFTER `lastSeenAt`;
--> statement-breakpoint
CREATE TABLE `customer_activity_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `action` varchar(64) NOT NULL,
  `path` varchar(255),
  `details` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `customer_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `customer_activity_user_created_idx` ON `customer_activity_logs` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `customer_activity_created_idx` ON `customer_activity_logs` (`createdAt`);
