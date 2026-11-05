ALTER TABLE `notifications`
  ADD COLUMN `senderId` int NULL AFTER `chatMessageId`,
  ADD COLUMN `url` varchar(512) NULL AFTER `type`,
  ADD COLUMN `iconUrl` varchar(512) NULL AFTER `type`,
  ADD COLUMN `dedupeKey` varchar(180) NULL AFTER `type`;

CREATE UNIQUE INDEX `notifications_user_dedupe_idx` ON `notifications` (`userId`, `dedupeKey`);

CREATE TABLE `push_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `endpoint` varchar(2048) NOT NULL,
  `p256dh` varchar(512) NOT NULL,
  `auth` varchar(256) NOT NULL,
  `userAgent` varchar(512) NULL,
  `deviceName` varchar(120) NULL,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `disabledAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `push_subscriptions_endpoint_unique` UNIQUE(`endpoint`)
);

CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`userId`, `disabledAt`);

CREATE TABLE `notification_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `chat` boolean NOT NULL DEFAULT true,
  `bookings` boolean NOT NULL DEFAULT true,
  `matches` boolean NOT NULL DEFAULT true,
  `social` boolean NOT NULL DEFAULT true,
  `calls` boolean NOT NULL DEFAULT true,
  `hideMessagePreview` boolean NOT NULL DEFAULT false,
  `mutedUntil` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
  CONSTRAINT `notification_preferences_user_unique` UNIQUE(`userId`)
);
