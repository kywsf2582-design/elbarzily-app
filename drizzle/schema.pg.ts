// Staging-only PostgreSQL schema generated from schema.ts.
// Keep schema.ts as the production MySQL schema until application queries are migrated and tested.
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const id = (name = "id") => serial(name).primaryKey();
const createdAt = () => timestamp("createdAt").defaultNow().notNull();

export const ENUM_ROLE_1 = pgEnum("role_1", ["user", "admin", "player", "owner", "moderator", "super_admin"] as const);
export const ENUM_ACCOUNTTYPE_2 = pgEnum("accountType_2", ["player", "owner"] as const);
export const ENUM_PURPOSE_3 = pgEnum("purpose_3", ["register", "login", "password_reset"] as const);
export const ENUM_BOOKINGPAYMENTMODE_4 = pgEnum("bookingPaymentMode_4", ["arrival", "deposit"] as const);
export const ENUM_STATUS_5 = pgEnum("status_5", ["draft", "pending", "published", "rejected", "suspended"] as const);
export const ENUM_STATUS_6 = pgEnum("status_6", ["draft", "published", "blocked", "booked"] as const);
export const ENUM_PAYMENTMETHOD_7 = pgEnum("paymentMethod_7", ["arrival", "deposit", "full"] as const);
export const ENUM_STATUS_8 = pgEnum("status_8", ["pending", "approved", "rejected", "cancelled"] as const);
export const ENUM_KIND_9 = pgEnum("kind_9", ["earn", "redeem", "adjustment", "refund"] as const);
export const ENUM_REWARDTYPE_10 = pgEnum("rewardType_10", ["free_booking", "product_delivery", "discount", "other"] as const);
export const ENUM_AUTHORIZEDTYPE_11 = pgEnum("authorizedType_11", ["admin", "pitch_owner", "rewards_staff"] as const);
export const ENUM_AUTHORIZEDTYPESNAPSHOT_12 = pgEnum("authorizedTypeSnapshot_12", ["admin", "pitch_owner", "rewards_staff"] as const);
export const ENUM_STATUS_13 = pgEnum("status_13", ["valid", "used", "expired", "cancelled"] as const);
export const ENUM_STATUS_14 = pgEnum("status_14", ["pending", "approved", "rejected"] as const);
export const ENUM_KIND_15 = pgEnum("kind_15", ["booking", "subscription"] as const);
export const ENUM_DECISION_16 = pgEnum("decision_16", ["approved", "rejected", "manual"] as const);
export const ENUM_STATUS_17 = pgEnum("status_17", ["scheduled", "completed", "cancelled"] as const);
export const ENUM_STATUS_18 = pgEnum("status_18", ["open", "full", "started", "cancelled", "completed"] as const);
export const ENUM_STATUS_19 = pgEnum("status_19", ["joined", "left", "removed"] as const);
export const ENUM_STATUS_20 = pgEnum("status_20", ["draft", "submitted", "matched", "needs_review", "approved", "rejected"] as const);
export const ENUM_STATUS_21 = pgEnum("status_21", ["pending", "approved", "rejected", "appealed"] as const);
export const ENUM_STATUS_22 = pgEnum("status_22", ["open", "reviewing", "resolved", "rejected"] as const);
export const ENUM_ROOMTYPE_23 = pgEnum("roomType_23", ["direct", "match", "booking", "support", "moderated"] as const);
export const ENUM_MEMBERROLE_24 = pgEnum("memberRole_24", ["member", "moderator", "owner"] as const);
export const ENUM_MESSAGETYPE_25 = pgEnum("messageType_25", ["text", "voice", "image", "video", "file"] as const);
export const ENUM_KIND_26 = pgEnum("kind_26", ["ring", "offer", "answer", "ice-candidate", "renegotiate", "bye"] as const);
export const ENUM_STATUS_27 = pgEnum("status_27", ["pending", "accepted", "declined"] as const);
export const ENUM_REASON_28 = pgEnum("reason_28", ["spam", "harassment", "fraud", "unsafe", "other"] as const);
export const ENUM_STATUS_29 = pgEnum("status_29", ["open", "reviewing", "resolved", "dismissed"] as const);
export const ENUM_STATUS_30 = pgEnum("status_30", ["pending", "reviewed", "accepted", "rejected"] as const);
export const ENUM_TYPE_31 = pgEnum("type_31", ["credit", "debit", "refund", "adjustment"] as const);
export const ENUM_PLATFORM_32 = pgEnum("platform_32", ["android", "windows"] as const);
export const ENUM_ACTION_33 = pgEnum("action_33", ["generated", "scanned", "validated", "rejected"] as const);
export const ENUM_MESSAGETYPE_34 = pgEnum("messageType_34", ["text", "image", "file", "voice"] as const);

export const users = pgTable("users", {
  id: id(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: ENUM_ROLE_1().default("user").notNull(),
  accountType: ENUM_ACCOUNTTYPE_2().default("player").notNull(),
  passwordHash: varchar("passwordHash", { length: 128 }),
  passwordSalt: varchar("passwordSalt", { length: 64 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  phone: varchar("phone", { length: 32 }),
  region: varchar("region", { length: 120 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  age: integer("age"),
  position: varchar("position", { length: 32 }),
  skillLevel: varchar("skillLevel", { length: 32 }),
  bio: text("bio"),
  isDiscoverable: boolean("isDiscoverable").default(false).notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  ownerSubscriptionExpiresAt: timestamp("ownerSubscriptionExpiresAt"),
  isSuspended: boolean("isSuspended").default(false).notNull(),
  sessionVersion: integer("sessionVersion").default(0).notNull(),
  moderatorPermissions: json("moderatorPermissions").$type<string[]>(),
  createdAt: createdAt(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => ({
  discoveryIdx: index("users_discovery_idx").on(table.accountType, table.role, table.isDiscoverable, table.position, table.lastSeenAt),
}));

export const authOtps = pgTable("auth_otps", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull(),
  purpose: ENUM_PURPOSE_3().notNull(),
  codeHash: varchar("codeHash", { length: 128 }).notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastSentAt: timestamp("lastSentAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
  ...{ createdAt: createdAt() },
});

export const uploadedAssets = pgTable("uploaded_assets", {
  id: id(),
  ownerId: integer("ownerId").notNull(),
  key: varchar("key", { length: 512 }).notNull().unique(),
  mimeType: varchar("mimeType", { length: 64 }).notNull(),
  ...{ createdAt: createdAt() },
});

export const pitches = pgTable("pitches", {
  id: id(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  address: varchar("address", { length: 320 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  imageUrl: varchar("imageUrl", { length: 512 }),
  mapUrl: varchar("mapUrl", { length: 512 }),
  captainName: varchar("captainName", { length: 160 }),
  captainPhone: varchar("captainPhone", { length: 32 }),
  vodafoneCashNumber: varchar("vodafoneCashNumber", { length: 32 }),
  bookingPaymentMode: ENUM_BOOKINGPAYMENTMODE_4().default("arrival").notNull(),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  subPitchCount: integer("subPitchCount").default(1).notNull(),
  morningPrice: decimal("morningPrice", { precision: 12, scale: 2 }),
  eveningPrice: decimal("eveningPrice", { precision: 12, scale: 2 }),
  status: ENUM_STATUS_5().default("draft").notNull(),
  amenities: json("amenities"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const pitchFields = pgTable("pitch_fields", {
  id: id(),
  pitchId: integer("pitchId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  sport: varchar("sport", { length: 60 }).default("football").notNull(),
  capacity: integer("capacity").default(10).notNull(),
  hourlyPrice: decimal("hourlyPrice", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const schedules = pgTable("schedules", {
  id: id(),
  pitchId: integer("pitchId").notNull(),
  fieldId: integer("fieldId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }),
  status: ENUM_STATUS_6().default("draft").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const bookings = pgTable("bookings", {
  id: id(),
  playerId: integer("playerId").notNull(),
  pitchId: integer("pitchId").notNull(),
  fieldId: integer("fieldId").notNull(),
  scheduleId: integer("scheduleId").notNull(),
  receiptUrl: varchar("receiptUrl", { length: 512 }),
  paymentMethod: ENUM_PAYMENTMETHOD_7().default("deposit").notNull(),
  paymentAmount: decimal("paymentAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  captainName: varchar("captainName", { length: 160 }),
  captainPhone: varchar("captainPhone", { length: 32 }),
  qrToken: varchar("qrToken", { length: 64 }).unique(),
  status: ENUM_STATUS_8().default("pending").notNull(),
  reviewNote: text("reviewNote"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reminderSentAt: timestamp("reminderSentAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  reminderStatusSentIdx: index("bookings_reminder_status_sent_idx").on(table.status, table.reminderSentAt),
}));

export const pitchCaptains = pgTable("pitch_captains", {
  id: id(),
  pitchId: integer("pitchId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const ownerPlans = pgTable("owner_plans", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  durationDays: integer("durationDays").default(30).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});


export const pointAccounts = pgTable("point_accounts", {
  id: id(),
  userId: integer("userId").notNull(),
  balance: integer("balance").default(0).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  userUnique: uniqueIndex("point_accounts_user_unique").on(table.userId),
}));

export const pointTransactions = pgTable("point_transactions", {
  id: id(),
  userId: integer("userId").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balanceAfter").notNull(),
  kind: ENUM_KIND_9().notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: integer("referenceId"),
  note: varchar("note", { length: 500 }),
  ...{ createdAt: createdAt() },
}, table => ({
  userCreatedIdx: index("point_transactions_user_created_idx").on(table.userId, table.createdAt),
}));

export const rewards = pgTable("rewards", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  rewardType: ENUM_REWARDTYPE_10().default("other").notNull(),
  costPoints: integer("costPoints").notNull(),
  terms: text("terms"),
  expiresInDays: integer("expiresInDays"),
  authorizedType: ENUM_AUTHORIZEDTYPE_11().default("admin").notNull(),
  authorizedPitchId: integer("authorizedPitchId"),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  activeIdx: index("rewards_active_idx").on(table.isActive, table.rewardType),
}));

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: id(),
  rewardId: integer("rewardId").notNull(),
  userId: integer("userId").notNull(),
  pointsCost: integer("pointsCost").notNull(),
  rewardNameSnapshot: varchar("rewardNameSnapshot", { length: 180 }).notNull(),
  authorizedTypeSnapshot: ENUM_AUTHORIZEDTYPESNAPSHOT_12().notNull(),
  authorizedPitchIdSnapshot: integer("authorizedPitchIdSnapshot"),
  verificationTokenHash: varchar("verificationTokenHash", { length: 64 }).notNull(),
  encryptedVerificationToken: text("encryptedVerificationToken").notNull(),
  backupCodeHash: varchar("backupCodeHash", { length: 64 }).notNull(),
  encryptedBackupCode: text("encryptedBackupCode").notNull(),
  status: ENUM_STATUS_13().default("valid").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  usedAt: timestamp("usedAt"),
  usedBy: integer("usedBy"),
  useNote: varchar("useNote", { length: 500 }),
  cancelledAt: timestamp("cancelledAt"),
  cancelReason: varchar("cancelReason", { length: 500 }),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  tokenUnique: uniqueIndex("reward_redemptions_token_unique").on(table.verificationTokenHash),
  backupUnique: uniqueIndex("reward_redemptions_backup_unique").on(table.backupCodeHash),
  userStatusIdx: index("reward_redemptions_user_status_idx").on(table.userId, table.status),
  statusIssuedIdx: index("reward_redemptions_status_issued_idx").on(table.status, table.issuedAt),
}));

export const subscriptionRequests = pgTable("subscription_requests", {
  id: id(),
  ownerId: integer("ownerId").notNull(),
  planId: integer("planId").notNull(),
  vodafoneCashNumber: varchar("vodafoneCashNumber", { length: 32 }).notNull(),
  paymentReference: varchar("paymentReference", { length: 160 }).notNull(),
  receiptUrl: varchar("receiptUrl", { length: 512 }).notNull(),
  status: ENUM_STATUS_14().default("pending").notNull(),
  reviewNote: text("reviewNote"),
  reviewedBy: integer("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const receiptVerifications = pgTable("receipt_verifications", {
  id: id(),
  kind: ENUM_KIND_15().notNull(),
  referenceId: integer("referenceId").notNull(),
  decision: ENUM_DECISION_16().notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  extractedAmount: decimal("extractedAmount", { precision: 12, scale: 2 }),
  extractedWallet: varchar("extractedWallet", { length: 64 }),
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }).notNull(),
  expectedWallet: varchar("expectedWallet", { length: 64 }).notNull(),
  reason: text("reason"),
  model: varchar("model", { length: 80 }),
  createdAt: createdAt(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => ({
  referenceUnique: uniqueIndex("receipt_verifications_reference_unique").on(table.kind, table.referenceId),
}));

export const appointments = pgTable("appointments", {
  id: id(),
  userId: integer("userId").notNull(),
  pitchId: integer("pitchId"),
  title: varchar("title", { length: 180 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  notes: text("notes"),
  status: ENUM_STATUS_17().default("scheduled").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const matches = pgTable("matches", {
  id: id(),
  creatorId: integer("creatorId").notNull(),
  pitchId: integer("pitchId").notNull(),
  fieldId: integer("fieldId").notNull(),
  scheduleId: integer("scheduleId"),
  title: varchar("title", { length: 180 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  maxPlayers: integer("maxPlayers").default(10).notNull(),
  status: ENUM_STATUS_18().default("open").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const matchParticipants = pgTable("match_participants", {
  id: id(),
  matchId: integer("matchId").notNull(),
  userId: integer("userId").notNull(),
  status: ENUM_STATUS_19().default("joined").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  matchStatusIdx: index("match_participants_match_status_idx").on(table.matchId, table.status),
  userStatusIdx: index("match_participants_user_status_idx").on(table.userId, table.status),
}));

export const matchReports = pgTable("match_reports", {
  id: id(),
  matchId: integer("matchId").notNull(),
  reporterId: integer("reporterId").notNull(),
  teamKey: varchar("teamKey", { length: 32 }).notNull(),
  homeScore: integer("homeScore").default(0).notNull(),
  awayScore: integer("awayScore").default(0).notNull(),
  status: ENUM_STATUS_20().default("submitted").notNull(),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  matchReporterIdx: uniqueIndex("match_reports_match_reporter_unique").on(table.matchId, table.reporterId),
  matchTeamIdx: uniqueIndex("match_reports_match_team_unique").on(table.matchId, table.teamKey),
  matchStatusIdx: index("match_reports_match_status_idx").on(table.matchId, table.status),
}));

export const matchReportPlayers = pgTable("match_report_players", {
  id: id(),
  reportId: integer("reportId").notNull(),
  playerId: integer("playerId").notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("0").notNull(),
  manOfMatch: boolean("manOfMatch").default(false).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  reportPlayerIdx: uniqueIndex("match_report_players_report_player_unique").on(table.reportId, table.playerId),
  playerIdx: index("match_report_players_player_idx").on(table.playerId, table.reportId),
}));

export const matchReportMedia = pgTable("match_report_media", {
  id: id(),
  reportId: integer("reportId").notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 80 }).notNull(),
  ...{ createdAt: createdAt() },
}, table => ({ reportUrlIdx: uniqueIndex("match_report_media_report_url_unique").on(table.reportId, table.url) }));

export const matchStatReviews = pgTable("match_stat_reviews", {
  id: id(),
  matchId: integer("matchId").notNull().unique(),
  firstReportId: integer("firstReportId"),
  secondReportId: integer("secondReportId"),
  status: ENUM_STATUS_21().default("pending").notNull(),
  differences: json("differences"),
  resolvedBy: integer("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({ statusIdx: index("match_stat_reviews_status_idx").on(table.status, table.updatedAt) }));

export const playerMatchStats = pgTable("player_match_stats", {
  id: id(),
  matchId: integer("matchId").notNull(),
  playerId: integer("playerId").notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("0").notNull(),
  won: boolean("won").default(false).notNull(),
  manOfMatch: boolean("manOfMatch").default(false).notNull(),
  sourceReviewId: integer("sourceReviewId").notNull(),
  approvedBy: integer("approvedBy").notNull(),
  approvedAt: timestamp("approvedAt").defaultNow().notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  matchPlayerIdx: uniqueIndex("player_match_stats_match_player_unique").on(table.matchId, table.playerId),
  playerApprovedIdx: index("player_match_stats_player_approved_idx").on(table.playerId, table.approvedAt),
}));

export const playerStatTotals = pgTable("player_stat_totals", {
  id: id(),
  userId: integer("userId").notNull().unique(),
  matches: integer("matches").default(0).notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  manOfMatch: integer("manOfMatch").default(0).notNull(),
  averageRating: decimal("averageRating", { precision: 4, scale: 2 }).default("0").notNull(),
  rankingScore: decimal("rankingScore", { precision: 12, scale: 2 }).default("0").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const statAppeals = pgTable("stat_appeals", {
  id: id(),
  matchId: integer("matchId").notNull(),
  appellantId: integer("appellantId").notNull(),
  reason: text("reason").notNull(),
  status: ENUM_STATUS_22().default("open").notNull(),
  resolution: text("resolution"),
  resolvedBy: integer("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({ matchStatusIdx: index("stat_appeals_match_status_idx").on(table.matchId, table.status) }));

export const chatRooms = pgTable("chat_rooms", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  matchId: integer("matchId"),
  createdBy: integer("createdBy").notNull(),
  isModerated: boolean("isModerated").default(false).notNull(),
  roomType: ENUM_ROOMTYPE_23().default("direct").notNull(),
  bookingId: integer("bookingId"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  typeUpdatedIdx: index("chat_rooms_type_updated_idx").on(table.roomType, table.updatedAt),
  matchUpdatedIdx: index("chat_rooms_match_updated_idx").on(table.matchId, table.updatedAt),
  bookingIdx: index("chat_rooms_booking_idx").on(table.bookingId),
}));

export const chatMembers = pgTable("chat_members", {
  id: id(),
  roomId: integer("roomId").notNull(),
  userId: integer("userId").notNull(),
  memberRole: ENUM_MEMBERROLE_24().default("member").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomUserIdx: index("chat_members_room_user_idx").on(table.roomId, table.userId),
  userRoomIdx: index("chat_members_user_room_idx").on(table.userId, table.roomId),
}));

export const chatMessages = pgTable("chat_messages", {
  id: id(),
  roomId: integer("roomId").notNull(),
  senderId: integer("senderId").notNull(),
  body: text("body").notNull(),
  messageType: ENUM_MESSAGETYPE_25().default("text").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  mediaMimeType: varchar("mediaMimeType", { length: 64 }),
  durationSeconds: integer("durationSeconds"),
  deletedAt: timestamp("deletedAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomCreatedIdx: index("chat_messages_room_created_idx").on(table.roomId, table.createdAt),
}));

export const chatCallSignals = pgTable("chat_call_signals", {
  id: id(),
  roomId: integer("roomId").notNull(),
  callId: varchar("callId", { length: 96 }).notNull(),
  senderId: integer("senderId").notNull(),
  recipientId: integer("recipientId").notNull(),
  kind: ENUM_KIND_26().notNull(),
  payload: text("payload").notNull(),
  seq: integer("seq").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  callSeqIdx: uniqueIndex("chat_call_signals_call_seq_idx").on(table.callId, table.seq),
  recipientIdx: index("chat_call_signals_recipient_idx").on(table.recipientId, table.createdAt),
  expiryIdx: index("chat_call_signals_expiry_idx").on(table.expiresAt),
}));

export const friendRequests = pgTable("friend_requests", {
  id: id(),
  requesterId: integer("requesterId").notNull(),
  recipientId: integer("recipientId").notNull(),
  status: ENUM_STATUS_27().default("pending").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  pairIdx: uniqueIndex("friend_requests_pair_idx").on(table.requesterId, table.recipientId),
  recipientIdx: index("friend_requests_recipient_idx").on(table.recipientId, table.status),
  requesterIdx: index("friend_requests_requester_idx").on(table.requesterId, table.status),
}));

export const chatMessageReads = pgTable("chat_message_reads", {
  id: id(),
  messageId: integer("messageId").notNull(),
  userId: integer("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
}, table => ({
  messageUserIdx: uniqueIndex("chat_message_reads_message_user_idx").on(table.messageId, table.userId),
  userIdx: index("chat_message_reads_user_idx").on(table.userId, table.messageId),
}));

export const chatMessageHidden = pgTable("chat_message_hidden", {
  id: id(),
  messageId: integer("messageId").notNull(),
  userId: integer("userId").notNull(),
  hiddenAt: timestamp("hiddenAt").defaultNow().notNull(),
}, table => ({
  messageUserIdx: uniqueIndex("chat_message_hidden_message_user_idx").on(table.messageId, table.userId),
  userIdx: index("chat_message_hidden_user_idx").on(table.userId, table.messageId),
}));

export const chatMessageReactions = pgTable("chat_message_reactions", {
  id: id(),
  messageId: integer("messageId").notNull(),
  userId: integer("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  messageUserEmojiIdx: uniqueIndex("chat_message_reactions_message_user_emoji_idx").on(table.messageId, table.userId, table.emoji),
  messageIdx: index("chat_message_reactions_message_idx").on(table.messageId),
}));

export const chatMessageReplyReferences = pgTable("chat_message_reply_references", {
  id: id(),
  messageId: integer("messageId").notNull(),
  replyToMessageId: integer("replyToMessageId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  messageUniqueIdx: uniqueIndex("chat_reply_message_unique_idx").on(table.messageId),
  replyTargetIdx: index("chat_reply_target_idx").on(table.replyToMessageId),
}));

export const blockedUsers = pgTable("blocked_users", {
  id: id(),
  blockerId: integer("blockerId").notNull(),
  blockedId: integer("blockedId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  blockerBlockedIdx: uniqueIndex("blocked_users_blocker_blocked_idx").on(table.blockerId, table.blockedId),
  blockerIdx: index("blocked_users_blocker_idx").on(table.blockerId),
  blockedIdx: index("blocked_users_blocked_idx").on(table.blockedId),
}));

export const notifications = pgTable("notifications", {
  id: id(),
  userId: integer("userId").notNull(),
  chatMessageId: integer("chatMessageId"),
  senderId: integer("senderId"),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 64 }).default("system").notNull(),
  url: varchar("url", { length: 512 }),
  iconUrl: varchar("iconUrl", { length: 512 }),
  dedupeKey: varchar("dedupeKey", { length: 180 }),
  readAt: timestamp("readAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  chatMessageIdx: index("notifications_chat_message_idx").on(table.chatMessageId),
  dedupeIdx: uniqueIndex("notifications_user_dedupe_idx").on(table.userId, table.dedupeKey),
}));

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: integer("userId").notNull(),
  endpoint: varchar("endpoint", { length: 2048 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 512 }).notNull(),
  auth: varchar("auth", { length: 256 }).notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  deviceName: varchar("deviceName", { length: 120 }),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  disabledAt: timestamp("disabledAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({ userIdx: index("push_subscriptions_user_idx").on(table.userId, table.disabledAt) }));

export const notificationPreferences = pgTable("notification_preferences", {
  id: id(),
  userId: integer("userId").notNull().unique(),
  chat: boolean("chat").default(true).notNull(),
  bookings: boolean("bookings").default(true).notNull(),
  matches: boolean("matches").default(true).notNull(),
  social: boolean("social").default(true).notNull(),
  calls: boolean("calls").default(true).notNull(),
  hideMessagePreview: boolean("hideMessagePreview").default(false).notNull(),
  mutedUntil: timestamp("mutedUntil"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const reports = pgTable("reports", {
  id: id(),
  reporterId: integer("reporterId").notNull(),
  targetType: varchar("targetType", { length: 40 }).notNull(),
  targetId: integer("targetId").notNull(),
  reason: ENUM_REASON_28().notNull(),
  details: text("details"),
  status: ENUM_STATUS_29().default("open").notNull(),
  reviewedBy: integer("reviewedBy"),
  resolution: text("resolution"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const pitchSuggestions = pgTable("pitch_suggestions", {
  id: id(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  address: varchar("address", { length: 320 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  notes: text("notes"),
  status: ENUM_STATUS_30().default("pending").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const walletAccounts = pgTable("wallet_accounts", {
  id: id(),
  userId: integer("userId").notNull().unique(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: id(),
  walletId: integer("walletId").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: ENUM_TYPE_31().notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: integer("referenceId"),
  note: text("note"),
  ...{ createdAt: createdAt() },
});

export const platformSettings = pgTable("platform_settings", {
  id: id(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: text("value").notNull(),
  updatedBy: integer("updatedBy"),
  ...{ updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const downloadDailyStats = pgTable("download_daily_stats", {
  id: id(),
  eventDate: date("eventDate", { mode: "string" }).notNull(),
  platform: ENUM_PLATFORM_32().notNull(),
  deviceType: varchar("deviceType", { length: 16 }).notNull(),
  osName: varchar("osName", { length: 24 }).notNull(),
  browserName: varchar("browserName", { length: 24 }).notNull(),
  requestCount: integer("requestCount").default(0).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
}, table => ({
  dailyCategoryUnique: uniqueIndex("download_daily_category_unique").on(table.eventDate, table.platform, table.deviceType, table.osName, table.browserName),
  datePlatformIdx: index("download_daily_date_platform_idx").on(table.eventDate, table.platform),
}));

export const qrLogs = pgTable("qr_logs", {
  id: id(),
  userId: integer("userId").notNull(),
  bookingId: integer("bookingId"),
  action: ENUM_ACTION_33().notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  metadata: json("metadata"),
  ...{ createdAt: createdAt() },
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: id(),
  actorId: integer("actorId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("targetType", { length: 80 }),
  targetId: integer("targetId"),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  ...{ createdAt: createdAt() },
}, table => ({
  actorCreatedIdx: index("admin_audit_actor_created_idx").on(table.actorId, table.createdAt),
  createdIdx: index("admin_audit_created_idx").on(table.createdAt),
}));

export const customerActivityLogs = pgTable("customer_activity_logs", {
  id: id(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  path: varchar("path", { length: 255 }),
  details: json("details"),
  ...{ createdAt: createdAt() },
}, table => ({
  userCreatedIdx: index("customer_activity_user_created_idx").on(table.userId, table.createdAt),
  createdIdx: index("customer_activity_created_idx").on(table.createdAt),
}));

export const adminChatRooms = pgTable("admin_chat_rooms", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  isGroup: boolean("isGroup").default(false).notNull(),
  createdBy: integer("createdBy").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().notNull() },
});

export const adminChatMembers = pgTable("admin_chat_members", {
  id: id(),
  roomId: integer("roomId").notNull(),
  userId: integer("userId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  roomUserIdx: uniqueIndex("admin_chat_room_user_unique").on(table.roomId, table.userId),
}));

export const adminChatMessages = pgTable("admin_chat_messages", {
  id: id(),
  roomId: integer("roomId").notNull(),
  senderId: integer("senderId").notNull(),
  body: text("body").notNull(),
  messageType: ENUM_MESSAGETYPE_34().default("text").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  mediaMimeType: varchar("mediaMimeType", { length: 96 }),
  durationSeconds: integer("durationSeconds"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomCreatedIdx: index("admin_chat_room_created_idx").on(table.roomId, table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
