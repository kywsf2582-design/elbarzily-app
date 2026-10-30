UPDATE `chat_rooms` SET `roomType` = CASE WHEN `matchId` IS NOT NULL THEN 'match' WHEN `isModerated` = 1 AND `name` LIKE '%دعم%' THEN 'support' WHEN `isModerated` = 1 THEN 'moderated' ELSE 'direct' END;--> statement-breakpoint
CREATE INDEX `chat_members_room_user_idx` ON `chat_members` (`roomId`,`userId`);--> statement-breakpoint
CREATE INDEX `chat_members_user_room_idx` ON `chat_members` (`userId`,`roomId`);--> statement-breakpoint
CREATE INDEX `chat_rooms_type_updated_idx` ON `chat_rooms` (`roomType`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `chat_rooms_match_updated_idx` ON `chat_rooms` (`matchId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `chat_rooms_booking_idx` ON `chat_rooms` (`bookingId`);--> statement-breakpoint
CREATE INDEX `match_participants_match_status_idx` ON `match_participants` (`matchId`,`status`);--> statement-breakpoint
CREATE INDEX `match_participants_user_status_idx` ON `match_participants` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `users_discovery_idx` ON `users` (`accountType`,`role`,`isDiscoverable`,`position`,`lastSeenAt`);