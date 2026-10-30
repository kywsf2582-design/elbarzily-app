CREATE TABLE IF NOT EXISTS `auth_otps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `purpose` enum('register','login','password_reset') NOT NULL,
  `codeHash` varchar(128) NOT NULL,
  `salt` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lastSentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `auth_otps_pk` PRIMARY KEY(`id`)
);
