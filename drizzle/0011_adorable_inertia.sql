CREATE TABLE `download_daily_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventDate` date NOT NULL,
	`platform` enum('android','windows') NOT NULL,
	`deviceType` varchar(16) NOT NULL,
	`osName` varchar(24) NOT NULL,
	`browserName` varchar(24) NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `download_daily_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `download_daily_category_unique` UNIQUE(`eventDate`,`platform`,`deviceType`,`osName`,`browserName`)
);
--> statement-breakpoint
CREATE INDEX `download_daily_date_platform_idx` ON `download_daily_stats` (`eventDate`,`platform`);