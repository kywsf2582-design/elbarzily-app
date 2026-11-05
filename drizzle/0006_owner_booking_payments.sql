CREATE TABLE `pitch_captains` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pitchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pitch_captains_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bookings` MODIFY COLUMN `receiptUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `bookings` ADD `paymentMethod` enum('arrival','deposit','full') DEFAULT 'deposit' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `paymentAmount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `captainName` varchar(160);--> statement-breakpoint
ALTER TABLE `bookings` ADD `captainPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `pitches` ADD `vodafoneCashNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `pitches` ADD `bookingPaymentMode` enum('arrival','deposit') DEFAULT 'arrival' NOT NULL;--> statement-breakpoint
ALTER TABLE `pitches` ADD `depositAmount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
INSERT INTO `pitch_captains` (`pitchId`, `name`, `phone`, `isActive`)
SELECT `id`, TRIM(`captainName`), TRIM(`captainPhone`), true
FROM `pitches`
WHERE `captainName` IS NOT NULL AND TRIM(`captainName`) <> ''
  AND `captainPhone` IS NOT NULL AND TRIM(`captainPhone`) <> '';
