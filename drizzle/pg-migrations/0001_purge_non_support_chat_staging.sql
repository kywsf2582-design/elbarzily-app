-- Staging-only data cleanup, executed by the existing PostgreSQL migration runner.
-- Preserve every support room/message and any asset referenced by support.
CREATE INDEX IF NOT EXISTS "bookings_created_at_idx" ON "bookings" ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_requests_created_at_idx" ON "subscription_requests" ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_player_created_idx" ON "bookings" ("playerId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_pitch_created_idx" ON "bookings" ("pitchId", "createdAt");
--> statement-breakpoint
DELETE FROM "notifications" AS n
USING "chat_messages" AS m
JOIN "chat_rooms" AS r ON r."id" = m."roomId"
WHERE n."chatMessageId" = m."id"
  AND r."roomType" IS DISTINCT FROM 'support';
--> statement-breakpoint
DELETE FROM "notifications" AS n
WHERE n."type" = 'call'
   OR (n."type" = 'chat' AND NOT EXISTS (
     SELECT 1
     FROM "chat_messages" AS m
     JOIN "chat_rooms" AS r ON r."id" = m."roomId"
     WHERE m."id" = n."chatMessageId"
       AND r."roomType" = 'support'
   ));
--> statement-breakpoint
DELETE FROM "chat_message_reply_references" AS ref
WHERE ref."messageId" IN (
  SELECT m."id" FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" IS DISTINCT FROM 'support'
) OR ref."replyToMessageId" IN (
  SELECT m."id" FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" IS DISTINCT FROM 'support'
);
--> statement-breakpoint
DELETE FROM "chat_message_reads" AS read_row
WHERE read_row."messageId" IN (
  SELECT m."id" FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" IS DISTINCT FROM 'support'
);
--> statement-breakpoint
DELETE FROM "chat_message_hidden" AS hidden_row
WHERE hidden_row."messageId" IN (
  SELECT m."id" FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" IS DISTINCT FROM 'support'
);
--> statement-breakpoint
DELETE FROM "chat_message_reactions" AS reaction
WHERE reaction."messageId" IN (
  SELECT m."id" FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" IS DISTINCT FROM 'support'
);
--> statement-breakpoint
DELETE FROM "uploaded_assets" AS asset
WHERE (
  asset."key" LIKE 'chat-media/%'
  OR asset."key" LIKE 'chat-voice/%'
  OR asset."key" IN (
    SELECT regexp_replace(m."mediaUrl", '^/manus-storage/', '')
    FROM "chat_messages" AS m
    JOIN "chat_rooms" AS r ON r."id" = m."roomId"
    WHERE r."roomType" IS DISTINCT FROM 'support' AND m."mediaUrl" IS NOT NULL
    UNION
    SELECT regexp_replace(m."mediaUrl", '^/manus-storage/', '')
    FROM "admin_chat_messages" AS m
    WHERE m."mediaUrl" IS NOT NULL
  )
)
AND NOT EXISTS (
  SELECT 1 FROM "chat_messages" AS m
  JOIN "chat_rooms" AS r ON r."id" = m."roomId"
  WHERE r."roomType" = 'support'
    AND regexp_replace(coalesce(m."mediaUrl", ''), '^/manus-storage/', '') = asset."key"
);
--> statement-breakpoint
DELETE FROM "chat_messages" AS m
USING "chat_rooms" AS r
WHERE m."roomId" = r."id"
  AND r."roomType" IS DISTINCT FROM 'support';
--> statement-breakpoint
DELETE FROM "chat_members" AS member
USING "chat_rooms" AS r
WHERE member."roomId" = r."id"
  AND r."roomType" IS DISTINCT FROM 'support';
--> statement-breakpoint
DELETE FROM "chat_rooms" WHERE "roomType" IS DISTINCT FROM 'support';
--> statement-breakpoint
DELETE FROM "chat_call_signals";
--> statement-breakpoint
DELETE FROM "admin_chat_messages";
--> statement-breakpoint
DELETE FROM "admin_chat_members";
--> statement-breakpoint
DELETE FROM "admin_chat_rooms";
