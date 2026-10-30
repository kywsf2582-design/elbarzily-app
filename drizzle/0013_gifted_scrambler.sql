CREATE TABLE `receipt_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('booking','subscription') NOT NULL,
	`referenceId` int NOT NULL,
	`decision` enum('approved','rejected','manual') NOT NULL,
	`confidence` decimal(5,4),
	`extractedAmount` decimal(12,2),
	`extractedWallet` varchar(64),
	`expectedAmount` decimal(12,2) NOT NULL,
	`expectedWallet` varchar(64) NOT NULL,
	`reason` text,
	`model` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receipt_verifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `receipt_verifications_reference_unique` UNIQUE(`kind`,`referenceId`)
);
