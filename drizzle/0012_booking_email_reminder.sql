ALTER TABLE `bookings` ADD `reminderSentAt` timestamp;--> statement-breakpoint
CREATE INDEX `bookings_reminder_status_sent_idx` ON `bookings` (`status`,`reminderSentAt`);