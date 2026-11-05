CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pitchId` int,
	`title` varchar(180) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`notes` text,
	`status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_otps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`purpose` enum('register','login','password_reset') NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`salt` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`lastSentAt` timestamp NOT NULL DEFAULT (now()),
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`pitchId` int NOT NULL,
	`fieldId` int NOT NULL,
	`scheduleId` int NOT NULL,
	`receiptUrl` varchar(512) NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`reviewNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`memberRole` enum('member','moderator','owner') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`matchId` int,
	`createdBy` int NOT NULL,
	`isModerated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('joined','left','removed') NOT NULL DEFAULT 'joined',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `match_participants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`pitchId` int NOT NULL,
	`fieldId` int NOT NULL,
	`scheduleId` int,
	`title` varchar(180) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`maxPlayers` int NOT NULL DEFAULT 10,
	`status` enum('open','full','started','cancelled','completed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`type` varchar(64) NOT NULL DEFAULT 'system',
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `owner_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`price` decimal(12,2) NOT NULL,
	`durationDays` int NOT NULL DEFAULT 30,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `owner_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pitch_fields` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pitchId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`sport` varchar(60) NOT NULL DEFAULT 'football',
	`capacity` int NOT NULL DEFAULT 10,
	`hourlyPrice` decimal(12,2) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pitch_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pitch_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`address` varchar(320) NOT NULL,
	`city` varchar(120) NOT NULL,
	`notes` text,
	`status` enum('pending','reviewed','accepted','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pitch_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pitches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`address` varchar(320) NOT NULL,
	`city` varchar(120) NOT NULL,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`imageUrl` varchar(512),
	`status` enum('draft','pending','published','rejected','suspended') NOT NULL DEFAULT 'draft',
	`amenities` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pitches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(120) NOT NULL,
	`value` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `qr_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bookingId` int,
	`action` enum('generated','scanned','validated','rejected') NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qr_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`targetType` varchar(40) NOT NULL,
	`targetId` int NOT NULL,
	`reason` enum('spam','harassment','fraud','unsafe','other') NOT NULL,
	`details` text,
	`status` enum('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
	`reviewedBy` int,
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pitchId` int NOT NULL,
	`fieldId` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`status` enum('draft','published','blocked','booked') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`planId` int NOT NULL,
	`vodafoneCashNumber` varchar(32) NOT NULL,
	`paymentReference` varchar(160) NOT NULL,
	`receiptUrl` varchar(512) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscription_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` decimal(12,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallet_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallet_accounts_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`type` enum('credit','debit','refund','adjustment') NOT NULL,
	`referenceType` varchar(64),
	`referenceId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','player','owner','moderator','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordSalt` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `users` ADD `isSuspended` boolean DEFAULT false NOT NULL;