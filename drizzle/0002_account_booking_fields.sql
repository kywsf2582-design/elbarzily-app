ALTER TABLE `bookings` ADD `qrToken` varchar(64);--> statement-breakpoint
ALTER TABLE `pitches` ADD `mapUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `pitches` ADD `captainName` varchar(160);--> statement-breakpoint
ALTER TABLE `pitches` ADD `captainPhone` varchar(32);--> statement-breakpoint
ALTER TABLE `pitches` ADD `subPitchCount` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `pitches` ADD `morningPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `pitches` ADD `eveningPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `users` ADD `accountType` enum('player','owner') DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `region` varchar(120);--> statement-breakpoint
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_qrToken_unique` UNIQUE(`qrToken`);