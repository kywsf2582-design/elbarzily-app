CREATE TYPE "public"."accountType_2" AS ENUM('player', 'owner');--> statement-breakpoint
CREATE TYPE "public"."action_33" AS ENUM('generated', 'scanned', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."authorizedTypeSnapshot_12" AS ENUM('admin', 'pitch_owner', 'rewards_staff');--> statement-breakpoint
CREATE TYPE "public"."authorizedType_11" AS ENUM('admin', 'pitch_owner', 'rewards_staff');--> statement-breakpoint
CREATE TYPE "public"."bookingPaymentMode_4" AS ENUM('arrival', 'deposit');--> statement-breakpoint
CREATE TYPE "public"."decision_16" AS ENUM('approved', 'rejected', 'manual');--> statement-breakpoint
CREATE TYPE "public"."kind_15" AS ENUM('booking', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."kind_26" AS ENUM('ring', 'offer', 'answer', 'ice-candidate', 'renegotiate', 'bye');--> statement-breakpoint
CREATE TYPE "public"."kind_9" AS ENUM('earn', 'redeem', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."memberRole_24" AS ENUM('member', 'moderator', 'owner');--> statement-breakpoint
CREATE TYPE "public"."messageType_25" AS ENUM('text', 'voice', 'image', 'video', 'file');--> statement-breakpoint
CREATE TYPE "public"."messageType_34" AS ENUM('text', 'image', 'file', 'voice');--> statement-breakpoint
CREATE TYPE "public"."paymentMethod_7" AS ENUM('arrival', 'deposit', 'full');--> statement-breakpoint
CREATE TYPE "public"."platform_32" AS ENUM('android', 'windows');--> statement-breakpoint
CREATE TYPE "public"."purpose_3" AS ENUM('register', 'login', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."reason_28" AS ENUM('spam', 'harassment', 'fraud', 'unsafe', 'other');--> statement-breakpoint
CREATE TYPE "public"."rewardType_10" AS ENUM('free_booking', 'product_delivery', 'discount', 'other');--> statement-breakpoint
CREATE TYPE "public"."role_1" AS ENUM('user', 'admin', 'player', 'owner', 'moderator', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."roomType_23" AS ENUM('direct', 'match', 'booking', 'support', 'moderated');--> statement-breakpoint
CREATE TYPE "public"."status_13" AS ENUM('valid', 'used', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."status_14" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."status_17" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."status_18" AS ENUM('open', 'full', 'started', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."status_19" AS ENUM('joined', 'left', 'removed');--> statement-breakpoint
CREATE TYPE "public"."status_20" AS ENUM('draft', 'submitted', 'matched', 'needs_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."status_21" AS ENUM('pending', 'approved', 'rejected', 'appealed');--> statement-breakpoint
CREATE TYPE "public"."status_22" AS ENUM('open', 'reviewing', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."status_27" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."status_29" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."status_30" AS ENUM('pending', 'reviewed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."status_5" AS ENUM('draft', 'pending', 'published', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."status_6" AS ENUM('draft', 'published', 'blocked', 'booked');--> statement-breakpoint
CREATE TYPE "public"."status_8" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."type_31" AS ENUM('credit', 'debit', 'refund', 'adjustment');--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer NOT NULL,
	"action" varchar(120) NOT NULL,
	"targetType" varchar(80),
	"targetId" integer,
	"details" json,
	"ipAddress" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_chat_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"senderId" integer NOT NULL,
	"body" text NOT NULL,
	"messageType" "messageType_34" DEFAULT 'text' NOT NULL,
	"mediaUrl" varchar(512),
	"mediaMimeType" varchar(96),
	"durationSeconds" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_chat_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"isGroup" boolean DEFAULT false NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"pitchId" integer,
	"title" varchar(180) NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"notes" text,
	"status" "status_17" DEFAULT 'scheduled' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"purpose" "purpose_3" NOT NULL,
	"codeHash" varchar(128) NOT NULL,
	"salt" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastSentAt" timestamp DEFAULT now() NOT NULL,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"blockerId" integer NOT NULL,
	"blockedId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"playerId" integer NOT NULL,
	"pitchId" integer NOT NULL,
	"fieldId" integer NOT NULL,
	"scheduleId" integer NOT NULL,
	"receiptUrl" varchar(512),
	"paymentMethod" "paymentMethod_7" DEFAULT 'deposit' NOT NULL,
	"paymentAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"captainName" varchar(160),
	"captainPhone" varchar(32),
	"qrToken" varchar(64),
	"status" "status_8" DEFAULT 'pending' NOT NULL,
	"reviewNote" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"reminderSentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_qrToken_unique" UNIQUE("qrToken")
);
--> statement-breakpoint
CREATE TABLE "chat_call_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"callId" varchar(96) NOT NULL,
	"senderId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"kind" "kind_26" NOT NULL,
	"payload" text NOT NULL,
	"seq" integer NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"userId" integer NOT NULL,
	"memberRole" "memberRole_24" DEFAULT 'member' NOT NULL,
	"lastReadAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_hidden" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"userId" integer NOT NULL,
	"hiddenAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"userId" integer NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"userId" integer NOT NULL,
	"readAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_reply_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"replyToMessageId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"senderId" integer NOT NULL,
	"body" text NOT NULL,
	"messageType" "messageType_25" DEFAULT 'text' NOT NULL,
	"mediaUrl" varchar(512),
	"mediaMimeType" varchar(64),
	"durationSeconds" integer,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"matchId" integer,
	"createdBy" integer NOT NULL,
	"isModerated" boolean DEFAULT false NOT NULL,
	"roomType" "roomType_23" DEFAULT 'direct' NOT NULL,
	"bookingId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"path" varchar(255),
	"details" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_daily_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventDate" date NOT NULL,
	"platform" "platform_32" NOT NULL,
	"deviceType" varchar(16) NOT NULL,
	"osName" varchar(24) NOT NULL,
	"browserName" varchar(24) NOT NULL,
	"requestCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requesterId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"status" "status_27" DEFAULT 'pending' NOT NULL,
	"acceptedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"userId" integer NOT NULL,
	"status" "status_19" DEFAULT 'joined' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_report_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" integer NOT NULL,
	"url" varchar(512) NOT NULL,
	"mimeType" varchar(80) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_report_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" integer NOT NULL,
	"playerId" integer NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3, 1) DEFAULT '0' NOT NULL,
	"manOfMatch" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"reporterId" integer NOT NULL,
	"teamKey" varchar(32) NOT NULL,
	"homeScore" integer DEFAULT 0 NOT NULL,
	"awayScore" integer DEFAULT 0 NOT NULL,
	"status" "status_20" DEFAULT 'submitted' NOT NULL,
	"submittedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_stat_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"firstReportId" integer,
	"secondReportId" integer,
	"status" "status_21" DEFAULT 'pending' NOT NULL,
	"differences" json,
	"resolvedBy" integer,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_stat_reviews_matchId_unique" UNIQUE("matchId")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"creatorId" integer NOT NULL,
	"pitchId" integer NOT NULL,
	"fieldId" integer NOT NULL,
	"scheduleId" integer,
	"title" varchar(180) NOT NULL,
	"startsAt" timestamp NOT NULL,
	"maxPlayers" integer DEFAULT 10 NOT NULL,
	"status" "status_18" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"chat" boolean DEFAULT true NOT NULL,
	"bookings" boolean DEFAULT true NOT NULL,
	"matches" boolean DEFAULT true NOT NULL,
	"social" boolean DEFAULT true NOT NULL,
	"calls" boolean DEFAULT true NOT NULL,
	"hideMessagePreview" boolean DEFAULT false NOT NULL,
	"mutedUntil" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"chatMessageId" integer,
	"senderId" integer,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"type" varchar(64) DEFAULT 'system' NOT NULL,
	"url" varchar(512),
	"iconUrl" varchar(512),
	"dedupeKey" varchar(180),
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"imageUrl" varchar(512),
	"price" numeric(12, 2) NOT NULL,
	"durationDays" integer DEFAULT 30 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_captains" (
	"id" serial PRIMARY KEY NOT NULL,
	"pitchId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"pitchId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"sport" varchar(60) DEFAULT 'football' NOT NULL,
	"capacity" integer DEFAULT 10 NOT NULL,
	"hourlyPrice" numeric(12, 2) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"address" varchar(320) NOT NULL,
	"city" varchar(120) NOT NULL,
	"notes" text,
	"status" "status_30" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"address" varchar(320) NOT NULL,
	"city" varchar(120) NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"imageUrl" varchar(512),
	"mapUrl" varchar(512),
	"captainName" varchar(160),
	"captainPhone" varchar(32),
	"vodafoneCashNumber" varchar(32),
	"bookingPaymentMode" "bookingPaymentMode_4" DEFAULT 'arrival' NOT NULL,
	"depositAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"subPitchCount" integer DEFAULT 1 NOT NULL,
	"morningPrice" numeric(12, 2),
	"eveningPrice" numeric(12, 2),
	"status" "status_5" DEFAULT 'draft' NOT NULL,
	"amenities" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" text NOT NULL,
	"updatedBy" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "player_match_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"playerId" integer NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3, 1) DEFAULT '0' NOT NULL,
	"won" boolean DEFAULT false NOT NULL,
	"manOfMatch" boolean DEFAULT false NOT NULL,
	"sourceReviewId" integer NOT NULL,
	"approvedBy" integer NOT NULL,
	"approvedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_stat_totals" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"manOfMatch" integer DEFAULT 0 NOT NULL,
	"averageRating" numeric(4, 2) DEFAULT '0' NOT NULL,
	"rankingScore" numeric(12, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_stat_totals_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "point_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"amount" integer NOT NULL,
	"balanceAfter" integer NOT NULL,
	"kind" "kind_9" NOT NULL,
	"referenceType" varchar(64),
	"referenceId" integer,
	"note" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"p256dh" varchar(512) NOT NULL,
	"auth" varchar(256) NOT NULL,
	"userAgent" varchar(512),
	"deviceName" varchar(120),
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"disabledAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "qr_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"bookingId" integer,
	"action" "action_33" NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "kind_15" NOT NULL,
	"referenceId" integer NOT NULL,
	"decision" "decision_16" NOT NULL,
	"confidence" numeric(5, 4),
	"extractedAmount" numeric(12, 2),
	"extractedWallet" varchar(64),
	"expectedAmount" numeric(12, 2) NOT NULL,
	"expectedWallet" varchar(64) NOT NULL,
	"reason" text,
	"model" varchar(80),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporterId" integer NOT NULL,
	"targetType" varchar(40) NOT NULL,
	"targetId" integer NOT NULL,
	"reason" "reason_28" NOT NULL,
	"details" text,
	"status" "status_29" DEFAULT 'open' NOT NULL,
	"reviewedBy" integer,
	"resolution" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rewardId" integer NOT NULL,
	"userId" integer NOT NULL,
	"pointsCost" integer NOT NULL,
	"rewardNameSnapshot" varchar(180) NOT NULL,
	"authorizedTypeSnapshot" "authorizedTypeSnapshot_12" NOT NULL,
	"authorizedPitchIdSnapshot" integer,
	"verificationTokenHash" varchar(64) NOT NULL,
	"encryptedVerificationToken" text NOT NULL,
	"backupCodeHash" varchar(64) NOT NULL,
	"encryptedBackupCode" text NOT NULL,
	"status" "status_13" DEFAULT 'valid' NOT NULL,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	"usedAt" timestamp,
	"usedBy" integer,
	"useNote" varchar(500),
	"cancelledAt" timestamp,
	"cancelReason" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"imageUrl" varchar(512),
	"rewardType" "rewardType_10" DEFAULT 'other' NOT NULL,
	"costPoints" integer NOT NULL,
	"terms" text,
	"expiresInDays" integer,
	"authorizedType" "authorizedType_11" DEFAULT 'admin' NOT NULL,
	"authorizedPitchId" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"pitchId" integer NOT NULL,
	"fieldId" integer NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"depositAmount" numeric(12, 2),
	"status" "status_6" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stat_appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"appellantId" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "status_22" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolvedBy" integer,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"planId" integer NOT NULL,
	"vodafoneCashNumber" varchar(32) NOT NULL,
	"paymentReference" varchar(160) NOT NULL,
	"receiptUrl" varchar(512) NOT NULL,
	"status" "status_14" DEFAULT 'pending' NOT NULL,
	"reviewNote" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"key" varchar(512) NOT NULL,
	"mimeType" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role_1" DEFAULT 'user' NOT NULL,
	"accountType" "accountType_2" DEFAULT 'player' NOT NULL,
	"passwordHash" varchar(128),
	"passwordSalt" varchar(64),
	"emailVerifiedAt" timestamp,
	"phone" varchar(32),
	"region" varchar(120),
	"avatarUrl" varchar(512),
	"age" integer,
	"position" varchar(32),
	"skillLevel" varchar(32),
	"bio" text,
	"isDiscoverable" boolean DEFAULT false NOT NULL,
	"lastSeenAt" timestamp,
	"ownerSubscriptionExpiresAt" timestamp,
	"isSuspended" boolean DEFAULT false NOT NULL,
	"sessionVersion" integer DEFAULT 0 NOT NULL,
	"moderatorPermissions" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_accounts_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" "type_31" NOT NULL,
	"referenceType" varchar(64),
	"referenceId" integer,
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_actor_created_idx" ON "admin_audit_logs" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_chat_room_user_unique" ON "admin_chat_members" USING btree ("roomId","userId");--> statement-breakpoint
CREATE INDEX "admin_chat_room_created_idx" ON "admin_chat_messages" USING btree ("roomId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_users_blocker_blocked_idx" ON "blocked_users" USING btree ("blockerId","blockedId");--> statement-breakpoint
CREATE INDEX "blocked_users_blocker_idx" ON "blocked_users" USING btree ("blockerId");--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_idx" ON "blocked_users" USING btree ("blockedId");--> statement-breakpoint
CREATE INDEX "bookings_reminder_status_sent_idx" ON "bookings" USING btree ("status","reminderSentAt");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_call_signals_call_seq_idx" ON "chat_call_signals" USING btree ("callId","seq");--> statement-breakpoint
CREATE INDEX "chat_call_signals_recipient_idx" ON "chat_call_signals" USING btree ("recipientId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_call_signals_expiry_idx" ON "chat_call_signals" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "chat_members_room_user_idx" ON "chat_members" USING btree ("roomId","userId");--> statement-breakpoint
CREATE INDEX "chat_members_user_room_idx" ON "chat_members" USING btree ("userId","roomId");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_hidden_message_user_idx" ON "chat_message_hidden" USING btree ("messageId","userId");--> statement-breakpoint
CREATE INDEX "chat_message_hidden_user_idx" ON "chat_message_hidden" USING btree ("userId","messageId");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reactions_message_user_emoji_idx" ON "chat_message_reactions" USING btree ("messageId","userId","emoji");--> statement-breakpoint
CREATE INDEX "chat_message_reactions_message_idx" ON "chat_message_reactions" USING btree ("messageId");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_reads_message_user_idx" ON "chat_message_reads" USING btree ("messageId","userId");--> statement-breakpoint
CREATE INDEX "chat_message_reads_user_idx" ON "chat_message_reads" USING btree ("userId","messageId");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reply_message_unique_idx" ON "chat_message_reply_references" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "chat_reply_target_idx" ON "chat_message_reply_references" USING btree ("replyToMessageId");--> statement-breakpoint
CREATE INDEX "chat_messages_room_created_idx" ON "chat_messages" USING btree ("roomId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_rooms_type_updated_idx" ON "chat_rooms" USING btree ("roomType","updatedAt");--> statement-breakpoint
CREATE INDEX "chat_rooms_match_updated_idx" ON "chat_rooms" USING btree ("matchId","updatedAt");--> statement-breakpoint
CREATE INDEX "chat_rooms_booking_idx" ON "chat_rooms" USING btree ("bookingId");--> statement-breakpoint
CREATE INDEX "customer_activity_user_created_idx" ON "customer_activity_logs" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "customer_activity_created_idx" ON "customer_activity_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "download_daily_category_unique" ON "download_daily_stats" USING btree ("eventDate","platform","deviceType","osName","browserName");--> statement-breakpoint
CREATE INDEX "download_daily_date_platform_idx" ON "download_daily_stats" USING btree ("eventDate","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pair_idx" ON "friend_requests" USING btree ("requesterId","recipientId");--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_idx" ON "friend_requests" USING btree ("recipientId","status");--> statement-breakpoint
CREATE INDEX "friend_requests_requester_idx" ON "friend_requests" USING btree ("requesterId","status");--> statement-breakpoint
CREATE INDEX "match_participants_match_status_idx" ON "match_participants" USING btree ("matchId","status");--> statement-breakpoint
CREATE INDEX "match_participants_user_status_idx" ON "match_participants" USING btree ("userId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_report_media_report_url_unique" ON "match_report_media" USING btree ("reportId","url");--> statement-breakpoint
CREATE UNIQUE INDEX "match_report_players_report_player_unique" ON "match_report_players" USING btree ("reportId","playerId");--> statement-breakpoint
CREATE INDEX "match_report_players_player_idx" ON "match_report_players" USING btree ("playerId","reportId");--> statement-breakpoint
CREATE UNIQUE INDEX "match_reports_match_reporter_unique" ON "match_reports" USING btree ("matchId","reporterId");--> statement-breakpoint
CREATE UNIQUE INDEX "match_reports_match_team_unique" ON "match_reports" USING btree ("matchId","teamKey");--> statement-breakpoint
CREATE INDEX "match_reports_match_status_idx" ON "match_reports" USING btree ("matchId","status");--> statement-breakpoint
CREATE INDEX "match_stat_reviews_status_idx" ON "match_stat_reviews" USING btree ("status","updatedAt");--> statement-breakpoint
CREATE INDEX "notifications_chat_message_idx" ON "notifications" USING btree ("chatMessageId");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_idx" ON "notifications" USING btree ("userId","dedupeKey");--> statement-breakpoint
CREATE UNIQUE INDEX "player_match_stats_match_player_unique" ON "player_match_stats" USING btree ("matchId","playerId");--> statement-breakpoint
CREATE INDEX "player_match_stats_player_approved_idx" ON "player_match_stats" USING btree ("playerId","approvedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "point_accounts_user_unique" ON "point_accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "point_transactions_user_created_idx" ON "point_transactions" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("userId","disabledAt");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_verifications_reference_unique" ON "receipt_verifications" USING btree ("kind","referenceId");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_redemptions_token_unique" ON "reward_redemptions" USING btree ("verificationTokenHash");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_redemptions_backup_unique" ON "reward_redemptions" USING btree ("backupCodeHash");--> statement-breakpoint
CREATE INDEX "reward_redemptions_user_status_idx" ON "reward_redemptions" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "reward_redemptions_status_issued_idx" ON "reward_redemptions" USING btree ("status","issuedAt");--> statement-breakpoint
CREATE INDEX "rewards_active_idx" ON "rewards" USING btree ("isActive","rewardType");--> statement-breakpoint
CREATE INDEX "stat_appeals_match_status_idx" ON "stat_appeals" USING btree ("matchId","status");--> statement-breakpoint
CREATE INDEX "users_discovery_idx" ON "users" USING btree ("accountType","role","isDiscoverable","position","lastSeenAt");