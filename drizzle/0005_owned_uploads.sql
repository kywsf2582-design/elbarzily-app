CREATE TABLE `uploaded_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`key` varchar(512) NOT NULL,
	`mimeType` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploaded_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploaded_assets_key_unique` UNIQUE(`key`)
);
