import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  mediumtext,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = (name = "id") => int(name).autoincrement().primaryKey();
const createdAt = () => timestamp("createdAt").defaultNow().notNull();

export const users = mysqlTable("users", {
  id: id(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "player", "owner", "moderator", "super_admin"]).default("user").notNull(),
  accountType: mysqlEnum("accountType", ["player", "owner"]).default("player").notNull(),
  passwordHash: varchar("passwordHash", { length: 128 }),
  passwordSalt: varchar("passwordSalt", { length: 64 }),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  phone: varchar("phone", { length: 32 }),
  region: varchar("region", { length: 120 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  age: int("age"),
  position: varchar("position", { length: 32 }),
  skillLevel: varchar("skillLevel", { length: 32 }),
  bio: text("bio"),
  isDiscoverable: boolean("isDiscoverable").default(false).notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  ownerSubscriptionExpiresAt: timestamp("ownerSubscriptionExpiresAt"),
  isSuspended: boolean("isSuspended").default(false).notNull(),
  sessionVersion: int("sessionVersion").default(0).notNull(),
  moderatorPermissions: json("moderatorPermissions").$type<string[]>(),
  createdAt: createdAt(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, table => ({
  discoveryIdx: index("users_discovery_idx").on(table.accountType, table.role, table.isDiscoverable, table.position, table.lastSeenAt),
}));

export const authOtps = mysqlTable("auth_otps", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull(),
  purpose: mysqlEnum("purpose", ["register", "login", "password_reset"]).notNull(),
  codeHash: varchar("codeHash", { length: 128 }).notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastSentAt: timestamp("lastSentAt").defaultNow().notNull(),
  consumedAt: timestamp("consumedAt"),
  ...{ createdAt: createdAt() },
});

export const uploadedAssets = mysqlTable("uploaded_assets", {
  id: id(),
  ownerId: int("ownerId").notNull(),
  key: varchar("key", { length: 512 }).notNull().unique(),
  mimeType: varchar("mimeType", { length: 64 }).notNull(),
  ...{ createdAt: createdAt() },
});

export const pitches = mysqlTable("pitches", {
  id: id(),
  ownerId: int("ownerId").notNull(),
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
  bookingPaymentMode: mysqlEnum("bookingPaymentMode", ["arrival", "deposit"]).default("arrival").notNull(),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  subPitchCount: int("subPitchCount").default(1).notNull(),
  morningPrice: decimal("morningPrice", { precision: 12, scale: 2 }),
  eveningPrice: decimal("eveningPrice", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["draft", "pending", "published", "rejected", "suspended"]).default("draft").notNull(),
  amenities: json("amenities"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const pitchFields = mysqlTable("pitch_fields", {
  id: id(),
  pitchId: int("pitchId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  sport: varchar("sport", { length: 60 }).default("football").notNull(),
  capacity: int("capacity").default(10).notNull(),
  hourlyPrice: decimal("hourlyPrice", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const schedules = mysqlTable("schedules", {
  id: id(),
  pitchId: int("pitchId").notNull(),
  fieldId: int("fieldId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["draft", "published", "blocked", "booked"]).default("draft").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const bookings = mysqlTable("bookings", {
  id: id(),
  playerId: int("playerId").notNull(),
  pitchId: int("pitchId").notNull(),
  fieldId: int("fieldId").notNull(),
  scheduleId: int("scheduleId").notNull(),
  receiptUrl: varchar("receiptUrl", { length: 512 }),
  paymentMethod: mysqlEnum("paymentMethod", ["arrival", "deposit", "full"]).default("deposit").notNull(),
  paymentAmount: decimal("paymentAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  captainName: varchar("captainName", { length: 160 }),
  captainPhone: varchar("captainPhone", { length: 32 }),
  qrToken: varchar("qrToken", { length: 64 }).unique(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  reviewNote: text("reviewNote"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  reminderSentAt: timestamp("reminderSentAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  reminderStatusSentIdx: index("bookings_reminder_status_sent_idx").on(table.status, table.reminderSentAt),
}));

export const pitchCaptains = mysqlTable("pitch_captains", {
  id: id(),
  pitchId: int("pitchId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const ownerPlans = mysqlTable("owner_plans", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  durationDays: int("durationDays").default(30).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});


export const pointAccounts = mysqlTable("point_accounts", {
  id: id(),
  userId: int("userId").notNull(),
  balance: int("balance").default(0).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  userUnique: uniqueIndex("point_accounts_user_unique").on(table.userId),
}));

export const pointTransactions = mysqlTable("point_transactions", {
  id: id(),
  userId: int("userId").notNull(),
  amount: int("amount").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  kind: mysqlEnum("kind", ["earn", "redeem", "adjustment", "refund"]).notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  note: varchar("note", { length: 500 }),
  ...{ createdAt: createdAt() },
}, table => ({
  userCreatedIdx: index("point_transactions_user_created_idx").on(table.userId, table.createdAt),
}));

export const rewards = mysqlTable("rewards", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  imageUrl: varchar("imageUrl", { length: 512 }),
  rewardType: mysqlEnum("rewardType", ["free_booking", "product_delivery", "discount", "other"]).default("other").notNull(),
  costPoints: int("costPoints").notNull(),
  terms: text("terms"),
  expiresInDays: int("expiresInDays"),
  authorizedType: mysqlEnum("authorizedType", ["admin", "pitch_owner", "rewards_staff"]).default("admin").notNull(),
  authorizedPitchId: int("authorizedPitchId"),
  isActive: boolean("isActive").default(true).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  activeIdx: index("rewards_active_idx").on(table.isActive, table.rewardType),
}));

export const rewardRedemptions = mysqlTable("reward_redemptions", {
  id: id(),
  rewardId: int("rewardId").notNull(),
  userId: int("userId").notNull(),
  pointsCost: int("pointsCost").notNull(),
  rewardNameSnapshot: varchar("rewardNameSnapshot", { length: 180 }).notNull(),
  authorizedTypeSnapshot: mysqlEnum("authorizedTypeSnapshot", ["admin", "pitch_owner", "rewards_staff"]).notNull(),
  authorizedPitchIdSnapshot: int("authorizedPitchIdSnapshot"),
  verificationTokenHash: varchar("verificationTokenHash", { length: 64 }).notNull(),
  encryptedVerificationToken: text("encryptedVerificationToken").notNull(),
  backupCodeHash: varchar("backupCodeHash", { length: 64 }).notNull(),
  encryptedBackupCode: text("encryptedBackupCode").notNull(),
  status: mysqlEnum("status", ["valid", "used", "expired", "cancelled"]).default("valid").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  usedAt: timestamp("usedAt"),
  usedBy: int("usedBy"),
  useNote: varchar("useNote", { length: 500 }),
  cancelledAt: timestamp("cancelledAt"),
  cancelReason: varchar("cancelReason", { length: 500 }),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  tokenUnique: uniqueIndex("reward_redemptions_token_unique").on(table.verificationTokenHash),
  backupUnique: uniqueIndex("reward_redemptions_backup_unique").on(table.backupCodeHash),
  userStatusIdx: index("reward_redemptions_user_status_idx").on(table.userId, table.status),
  statusIssuedIdx: index("reward_redemptions_status_issued_idx").on(table.status, table.issuedAt),
}));

export const subscriptionRequests = mysqlTable("subscription_requests", {
  id: id(),
  ownerId: int("ownerId").notNull(),
  planId: int("planId").notNull(),
  vodafoneCashNumber: varchar("vodafoneCashNumber", { length: 32 }).notNull(),
  paymentReference: varchar("paymentReference", { length: 160 }).notNull(),
  receiptUrl: varchar("receiptUrl", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewNote: text("reviewNote"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const receiptVerifications = mysqlTable("receipt_verifications", {
  id: id(),
  kind: mysqlEnum("kind", ["booking", "subscription"]).notNull(),
  referenceId: int("referenceId").notNull(),
  decision: mysqlEnum("decision", ["approved", "rejected", "manual"]).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  extractedAmount: decimal("extractedAmount", { precision: 12, scale: 2 }),
  extractedWallet: varchar("extractedWallet", { length: 64 }),
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }).notNull(),
  expectedWallet: varchar("expectedWallet", { length: 64 }).notNull(),
  reason: text("reason"),
  model: varchar("model", { length: 80 }),
  createdAt: createdAt(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  referenceUnique: uniqueIndex("receipt_verifications_reference_unique").on(table.kind, table.referenceId),
}));

export const appointments = mysqlTable("appointments", {
  id: id(),
  userId: int("userId").notNull(),
  pitchId: int("pitchId"),
  title: varchar("title", { length: 180 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const matches = mysqlTable("matches", {
  id: id(),
  creatorId: int("creatorId").notNull(),
  pitchId: int("pitchId").notNull(),
  fieldId: int("fieldId").notNull(),
  scheduleId: int("scheduleId"),
  title: varchar("title", { length: 180 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  maxPlayers: int("maxPlayers").default(10).notNull(),
  status: mysqlEnum("status", ["open", "full", "started", "cancelled", "completed"]).default("open").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const matchParticipants = mysqlTable("match_participants", {
  id: id(),
  matchId: int("matchId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["joined", "left", "removed"]).default("joined").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  matchStatusIdx: index("match_participants_match_status_idx").on(table.matchId, table.status),
  userStatusIdx: index("match_participants_user_status_idx").on(table.userId, table.status),
}));

export const chatRooms = mysqlTable("chat_rooms", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  matchId: int("matchId"),
  createdBy: int("createdBy").notNull(),
  isModerated: boolean("isModerated").default(false).notNull(),
  roomType: mysqlEnum("roomType", ["direct", "match", "booking", "support", "moderated"]).default("direct").notNull(),
  bookingId: int("bookingId"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  typeUpdatedIdx: index("chat_rooms_type_updated_idx").on(table.roomType, table.updatedAt),
  matchUpdatedIdx: index("chat_rooms_match_updated_idx").on(table.matchId, table.updatedAt),
  bookingIdx: index("chat_rooms_booking_idx").on(table.bookingId),
}));

export const chatMembers = mysqlTable("chat_members", {
  id: id(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  memberRole: mysqlEnum("memberRole", ["member", "moderator", "owner"]).default("member").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomUserIdx: index("chat_members_room_user_idx").on(table.roomId, table.userId),
  userRoomIdx: index("chat_members_user_room_idx").on(table.userId, table.roomId),
}));

export const chatMessages = mysqlTable("chat_messages", {
  id: id(),
  roomId: int("roomId").notNull(),
  senderId: int("senderId").notNull(),
  body: text("body").notNull(),
  messageType: mysqlEnum("messageType", ["text", "voice", "image", "video", "file"]).default("text").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  mediaMimeType: varchar("mediaMimeType", { length: 64 }),
  durationSeconds: int("durationSeconds"),
  deletedAt: timestamp("deletedAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomCreatedIdx: index("chat_messages_room_created_idx").on(table.roomId, table.createdAt),
}));

export const chatCallSignals = mysqlTable("chat_call_signals", {
  id: id(),
  roomId: int("roomId").notNull(),
  callId: varchar("callId", { length: 96 }).notNull(),
  senderId: int("senderId").notNull(),
  recipientId: int("recipientId").notNull(),
  kind: mysqlEnum("kind", ["ring", "offer", "answer", "ice-candidate", "renegotiate", "bye"]).notNull(),
  payload: mediumtext("payload").notNull(),
  seq: int("seq").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  ...{ createdAt: createdAt() },
}, table => ({
  callSeqIdx: uniqueIndex("chat_call_signals_call_seq_idx").on(table.callId, table.seq),
  recipientIdx: index("chat_call_signals_recipient_idx").on(table.recipientId, table.createdAt),
  expiryIdx: index("chat_call_signals_expiry_idx").on(table.expiresAt),
}));

export const friendRequests = mysqlTable("friend_requests", {
  id: id(),
  requesterId: int("requesterId").notNull(),
  recipientId: int("recipientId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  pairIdx: uniqueIndex("friend_requests_pair_idx").on(table.requesterId, table.recipientId),
  recipientIdx: index("friend_requests_recipient_idx").on(table.recipientId, table.status),
  requesterIdx: index("friend_requests_requester_idx").on(table.requesterId, table.status),
}));

export const chatMessageReads = mysqlTable("chat_message_reads", {
  id: id(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
}, table => ({
  messageUserIdx: uniqueIndex("chat_message_reads_message_user_idx").on(table.messageId, table.userId),
  userIdx: index("chat_message_reads_user_idx").on(table.userId, table.messageId),
}));

export const chatMessageHidden = mysqlTable("chat_message_hidden", {
  id: id(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  hiddenAt: timestamp("hiddenAt").defaultNow().notNull(),
}, table => ({
  messageUserIdx: uniqueIndex("chat_message_hidden_message_user_idx").on(table.messageId, table.userId),
  userIdx: index("chat_message_hidden_user_idx").on(table.userId, table.messageId),
}));

export const chatMessageReactions = mysqlTable("chat_message_reactions", {
  id: id(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  messageUserEmojiIdx: uniqueIndex("chat_message_reactions_message_user_emoji_idx").on(table.messageId, table.userId, table.emoji),
  messageIdx: index("chat_message_reactions_message_idx").on(table.messageId),
}));

export const chatMessageReplyReferences = mysqlTable("chat_message_reply_references", {
  id: id(),
  messageId: int("messageId").notNull(),
  replyToMessageId: int("replyToMessageId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  messageUniqueIdx: uniqueIndex("chat_reply_message_unique_idx").on(table.messageId),
  replyTargetIdx: index("chat_reply_target_idx").on(table.replyToMessageId),
}));

export const blockedUsers = mysqlTable("blocked_users", {
  id: id(),
  blockerId: int("blockerId").notNull(),
  blockedId: int("blockedId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  blockerBlockedIdx: uniqueIndex("blocked_users_blocker_blocked_idx").on(table.blockerId, table.blockedId),
  blockerIdx: index("blocked_users_blocker_idx").on(table.blockerId),
  blockedIdx: index("blocked_users_blocked_idx").on(table.blockedId),
}));

export const notifications = mysqlTable("notifications", {
  id: id(),
  userId: int("userId").notNull(),
  chatMessageId: int("chatMessageId"),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  type: varchar("type", { length: 64 }).default("system").notNull(),
  readAt: timestamp("readAt"),
  ...{ createdAt: createdAt() },
}, table => ({ chatMessageIdx: index("notifications_chat_message_idx").on(table.chatMessageId) }));

export const reports = mysqlTable("reports", {
  id: id(),
  reporterId: int("reporterId").notNull(),
  targetType: varchar("targetType", { length: 40 }).notNull(),
  targetId: int("targetId").notNull(),
  reason: mysqlEnum("reason", ["spam", "harassment", "fraud", "unsafe", "other"]).notNull(),
  details: text("details"),
  status: mysqlEnum("status", ["open", "reviewing", "resolved", "dismissed"]).default("open").notNull(),
  reviewedBy: int("reviewedBy"),
  resolution: text("resolution"),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const pitchSuggestions = mysqlTable("pitch_suggestions", {
  id: id(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  address: varchar("address", { length: 320 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "reviewed", "accepted", "rejected"]).default("pending").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const walletAccounts = mysqlTable("wallet_accounts", {
  id: id(),
  userId: int("userId").notNull().unique(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const walletTransactions = mysqlTable("wallet_transactions", {
  id: id(),
  walletId: int("walletId").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["credit", "debit", "refund", "adjustment"]).notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  note: text("note"),
  ...{ createdAt: createdAt() },
});

export const platformSettings = mysqlTable("platform_settings", {
  id: id(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: text("value").notNull(),
  updatedBy: int("updatedBy"),
  ...{ updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const downloadDailyStats = mysqlTable("download_daily_stats", {
  id: id(),
  eventDate: date("eventDate", { mode: "string" }).notNull(),
  platform: mysqlEnum("platform", ["android", "windows"]).notNull(),
  deviceType: varchar("deviceType", { length: 16 }).notNull(),
  osName: varchar("osName", { length: 24 }).notNull(),
  browserName: varchar("browserName", { length: 24 }).notNull(),
  requestCount: int("requestCount").default(0).notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
}, table => ({
  dailyCategoryUnique: uniqueIndex("download_daily_category_unique").on(table.eventDate, table.platform, table.deviceType, table.osName, table.browserName),
  datePlatformIdx: index("download_daily_date_platform_idx").on(table.eventDate, table.platform),
}));

export const qrLogs = mysqlTable("qr_logs", {
  id: id(),
  userId: int("userId").notNull(),
  bookingId: int("bookingId"),
  action: mysqlEnum("action", ["generated", "scanned", "validated", "rejected"]).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
  metadata: json("metadata"),
  ...{ createdAt: createdAt() },
});

export const adminAuditLogs = mysqlTable("admin_audit_logs", {
  id: id(),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("targetType", { length: 80 }),
  targetId: int("targetId"),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  ...{ createdAt: createdAt() },
}, table => ({
  actorCreatedIdx: index("admin_audit_actor_created_idx").on(table.actorId, table.createdAt),
  createdIdx: index("admin_audit_created_idx").on(table.createdAt),
}));

export const customerActivityLogs = mysqlTable("customer_activity_logs", {
  id: id(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  path: varchar("path", { length: 255 }),
  details: json("details"),
  ...{ createdAt: createdAt() },
}, table => ({
  userCreatedIdx: index("customer_activity_user_created_idx").on(table.userId, table.createdAt),
  createdIdx: index("customer_activity_created_idx").on(table.createdAt),
}));

export const adminChatRooms = mysqlTable("admin_chat_rooms", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  isGroup: boolean("isGroup").default(false).notNull(),
  createdBy: int("createdBy").notNull(),
  ...{ createdAt: createdAt(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
});

export const adminChatMembers = mysqlTable("admin_chat_members", {
  id: id(),
  roomId: int("roomId").notNull(),
  userId: int("userId").notNull(),
  ...{ createdAt: createdAt() },
}, table => ({
  roomUserIdx: uniqueIndex("admin_chat_room_user_unique").on(table.roomId, table.userId),
}));

export const adminChatMessages = mysqlTable("admin_chat_messages", {
  id: id(),
  roomId: int("roomId").notNull(),
  senderId: int("senderId").notNull(),
  body: text("body").notNull(),
  messageType: mysqlEnum("messageType", ["text", "image", "file", "voice"]).default("text").notNull(),
  mediaUrl: varchar("mediaUrl", { length: 512 }),
  mediaMimeType: varchar("mediaMimeType", { length: 96 }),
  durationSeconds: int("durationSeconds"),
  ...{ createdAt: createdAt() },
}, table => ({
  roomCreatedIdx: index("admin_chat_room_created_idx").on(table.roomId, table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
