CREATE TABLE `match_reports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `matchId` int NOT NULL,
  `reporterId` int NOT NULL,
  `teamKey` varchar(32) NOT NULL,
  `homeScore` int NOT NULL DEFAULT 0,
  `awayScore` int NOT NULL DEFAULT 0,
  `status` enum('draft','submitted','matched','needs_review','approved','rejected') NOT NULL DEFAULT 'submitted',
  `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `match_reports_id` PRIMARY KEY(`id`),
  CONSTRAINT `match_reports_match_reporter_unique` UNIQUE(`matchId`,`reporterId`),
  CONSTRAINT `match_reports_match_team_unique` UNIQUE(`matchId`,`teamKey`)
);
CREATE INDEX `match_reports_match_status_idx` ON `match_reports` (`matchId`,`status`);

CREATE TABLE `match_report_players` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `playerId` int NOT NULL,
  `goals` int NOT NULL DEFAULT 0,
  `assists` int NOT NULL DEFAULT 0,
  `rating` decimal(3,1) NOT NULL DEFAULT 0,
  `manOfMatch` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `match_report_players_id` PRIMARY KEY(`id`),
  CONSTRAINT `match_report_players_report_player_unique` UNIQUE(`reportId`,`playerId`)
);
CREATE INDEX `match_report_players_player_idx` ON `match_report_players` (`playerId`,`reportId`);

CREATE TABLE `match_report_media` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `url` varchar(512) NOT NULL,
  `mimeType` varchar(80) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `match_report_media_id` PRIMARY KEY(`id`),
  CONSTRAINT `match_report_media_report_url_unique` UNIQUE(`reportId`,`url`)
);

CREATE TABLE `match_stat_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `matchId` int NOT NULL,
  `firstReportId` int NULL,
  `secondReportId` int NULL,
  `status` enum('pending','approved','rejected','appealed') NOT NULL DEFAULT 'pending',
  `differences` json NULL,
  `resolvedBy` int NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `match_stat_reviews_id` PRIMARY KEY(`id`),
  CONSTRAINT `match_stat_reviews_match_unique` UNIQUE(`matchId`)
);
CREATE INDEX `match_stat_reviews_status_idx` ON `match_stat_reviews` (`status`,`updatedAt`);

CREATE TABLE `player_match_stats` (
  `id` int AUTO_INCREMENT NOT NULL,
  `matchId` int NOT NULL,
  `playerId` int NOT NULL,
  `goals` int NOT NULL DEFAULT 0,
  `assists` int NOT NULL DEFAULT 0,
  `rating` decimal(3,1) NOT NULL DEFAULT 0,
  `won` boolean NOT NULL DEFAULT false,
  `manOfMatch` boolean NOT NULL DEFAULT false,
  `sourceReviewId` int NOT NULL,
  `approvedBy` int NOT NULL,
  `approvedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `player_match_stats_id` PRIMARY KEY(`id`),
  CONSTRAINT `player_match_stats_match_player_unique` UNIQUE(`matchId`,`playerId`)
);
CREATE INDEX `player_match_stats_player_approved_idx` ON `player_match_stats` (`playerId`,`approvedAt`);

CREATE TABLE `player_stat_totals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `matches` int NOT NULL DEFAULT 0,
  `goals` int NOT NULL DEFAULT 0,
  `assists` int NOT NULL DEFAULT 0,
  `wins` int NOT NULL DEFAULT 0,
  `manOfMatch` int NOT NULL DEFAULT 0,
  `averageRating` decimal(4,2) NOT NULL DEFAULT 0,
  `rankingScore` decimal(12,2) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `player_stat_totals_id` PRIMARY KEY(`id`),
  CONSTRAINT `player_stat_totals_user_unique` UNIQUE(`userId`)
);

CREATE TABLE `stat_appeals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `matchId` int NOT NULL,
  `appellantId` int NOT NULL,
  `reason` text NOT NULL,
  `status` enum('open','reviewing','resolved','rejected') NOT NULL DEFAULT 'open',
  `resolution` text NULL,
  `resolvedBy` int NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `stat_appeals_id` PRIMARY KEY(`id`)
);
CREATE INDEX `stat_appeals_match_status_idx` ON `stat_appeals` (`matchId`,`status`);
