CREATE TABLE `point_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `point_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `point_accounts_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `point_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`kind` enum('earn','redeem','adjustment','refund') NOT NULL,
	`referenceType` varchar(64),
	`referenceId` int,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rewardId` int NOT NULL,
	`userId` int NOT NULL,
	`pointsCost` int NOT NULL,
	`rewardNameSnapshot` varchar(180) NOT NULL,
	`authorizedTypeSnapshot` enum('admin','pitch_owner','rewards_staff') NOT NULL,
	`authorizedPitchIdSnapshot` int,
	`verificationTokenHash` varchar(64) NOT NULL,
	`encryptedVerificationToken` text NOT NULL,
	`backupCodeHash` varchar(64) NOT NULL,
	`encryptedBackupCode` text NOT NULL,
	`status` enum('valid','used','expired','cancelled') NOT NULL DEFAULT 'valid',
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`usedAt` timestamp,
	`usedBy` int,
	`useNote` varchar(500),
	`cancelledAt` timestamp,
	`cancelReason` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `reward_redemptions_token_unique` UNIQUE(`verificationTokenHash`),
	CONSTRAINT `reward_redemptions_backup_unique` UNIQUE(`backupCodeHash`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`imageUrl` varchar(512),
	`rewardType` enum('free_booking','product_delivery','discount','other') NOT NULL DEFAULT 'other',
	`costPoints` int NOT NULL,
	`terms` text,
	`expiresInDays` int,
	`authorizedType` enum('admin','pitch_owner','rewards_staff') NOT NULL DEFAULT 'admin',
	`authorizedPitchId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `point_transactions_user_created_idx` ON `point_transactions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_user_status_idx` ON `reward_redemptions` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_status_issued_idx` ON `reward_redemptions` (`status`,`issuedAt`);--> statement-breakpoint
CREATE INDEX `rewards_active_idx` ON `rewards` (`isActive`,`rewardType`);