-- Additive referral campaign schema for the PostgreSQL staging runtime.
-- The campaign is disabled and both reward values default to zero.
CREATE TABLE IF NOT EXISTS "referral_campaign_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "startsAt" timestamp,
  "endsAt" timestamp,
  "profilePoints" integer DEFAULT 0 NOT NULL,
  "firstQrBookingPoints" integer DEFAULT 0 NOT NULL,
  "dailyReferralLimit" integer DEFAULT 10 NOT NULL,
  "monthlyReferralLimit" integer DEFAULT 100 NOT NULL,
  "shareMessage" text DEFAULT 'أنا بلعب في البرازيلي، تعالى نلعب سوا!' NOT NULL,
  "updatedBy" integer,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "referral_campaign_settings_singleton" CHECK ("id" = 1),
  CONSTRAINT "referral_campaign_profile_points_nonnegative" CHECK ("profilePoints" >= 0),
  CONSTRAINT "referral_campaign_booking_points_nonnegative" CHECK ("firstQrBookingPoints" >= 0),
  CONSTRAINT "referral_campaign_daily_limit_positive" CHECK ("dailyReferralLimit" >= 1),
  CONSTRAINT "referral_campaign_monthly_limit_positive" CHECK ("monthlyReferralLimit" >= 1),
  CONSTRAINT "referral_campaign_settings_updated_by_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "code" varchar(16) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "referral_codes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_user_unique" ON "referral_codes" ("userId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_unique" ON "referral_codes" ("code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_attributions" (
  "id" serial PRIMARY KEY NOT NULL,
  "inviterId" integer NOT NULL,
  "inviteeId" integer NOT NULL,
  "referralCode" varchar(16) NOT NULL,
  "status" varchar(32) DEFAULT 'pending_profile' NOT NULL,
  "attributedAt" timestamp DEFAULT now() NOT NULL,
  "qualifiedAt" timestamp,
  "reviewNote" text,
  "reviewedBy" integer,
  "reviewedAt" timestamp,
  CONSTRAINT "referral_attributions_not_self" CHECK ("inviterId" <> "inviteeId"),
  CONSTRAINT "referral_attributions_inviterId_users_id_fk" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "referral_attributions_inviteeId_users_id_fk" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "referral_attributions_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_invitee_unique" ON "referral_attributions" ("inviteeId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_attributions_inviter_created_idx" ON "referral_attributions" ("inviterId", "attributedAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_attributions_status_created_idx" ON "referral_attributions" ("status", "attributedAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "referralCodeId" integer NOT NULL,
  "clientEventId" varchar(64) NOT NULL,
  "eventType" varchar(24) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "referral_events_type_check" CHECK ("eventType" IN ('visit', 'share_attempt')),
  CONSTRAINT "referral_events_referralCodeId_referral_codes_id_fk" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_events_client_event_unique" ON "referral_events" ("referralCodeId", "clientEventId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_events_code_type_created_idx" ON "referral_events" ("referralCodeId", "eventType", "createdAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_reward_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "attributionId" integer NOT NULL,
  "recipientUserId" integer NOT NULL,
  "milestone" varchar(32) NOT NULL,
  "points" integer NOT NULL,
  "bookingId" integer,
  "status" varchar(16) DEFAULT 'awarded' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "referral_reward_events_points_positive" CHECK ("points" > 0),
  CONSTRAINT "referral_reward_events_status_check" CHECK ("status" IN ('awarded', 'reversed')),
  CONSTRAINT "referral_reward_events_attributionId_referral_attributions_id_fk" FOREIGN KEY ("attributionId") REFERENCES "referral_attributions"("id") ON DELETE CASCADE,
  CONSTRAINT "referral_reward_events_recipientUserId_users_id_fk" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "referral_reward_events_bookingId_bookings_id_fk" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referral_reward_events_milestone_unique" ON "referral_reward_events" ("attributionId", "milestone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_reward_events_recipient_created_idx" ON "referral_reward_events" ("recipientUserId", "createdAt");
