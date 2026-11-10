import { and, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "../drizzle/schema.pg";
import { deletedIdentitySettingKey } from "./deletedIdentity";
import { getDb } from "./db";
import { storageDeleteMany } from "./storage";

const {
  adminAuditLogs,
  adminChatMembers,
  adminChatMessages,
  adminChatRooms,
  appointments,
  authOtps,
  blockedUsers,
  bookings,
  chatCallSignals,
  chatMembers,
  chatMessageHidden,
  chatMessageReads,
  chatMessageReactions,
  chatMessageReplyReferences,
  chatMessages,
  chatRooms,
  customerActivityLogs,
  friendRequests,
  matchParticipants,
  matchReportMedia,
  matchReportPlayers,
  matchReports,
  matchStatReviews,
  matches,
  notifications,
  notificationPreferences,
  pitchCaptains,
  pitchFields,
  pitches,
  pitchSuggestions,
  platformSettings,
  referralAttributions,
  referralCodes,
  referralEvents,
  referralRewardEvents,
  playerMatchStats,
  playerStatTotals,
  pointAccounts,
  pointTransactions,
  qrLogs,
  receiptVerifications,
  reports,
  rewardRedemptions,
  rewards,
  schedules,
  statAppeals,
  subscriptionRequests,
  uploadedAssets,
  users,
  walletAccounts,
  walletTransactions,
  pushSubscriptions,
} = schema;

const asOr = (...conditions: any[]) => {
  const present = conditions.filter(Boolean);
  return present.length === 1 ? present[0] : present.length ? or(...present) : undefined;
};

async function selectIds(tx: any, table: any, idColumn: any, condition: any): Promise<number[]> {
  if (!condition) return [];
  const rows = await tx.select({ id: idColumn }).from(table).where(condition);
  return rows.map((row: { id: number | string }) => Number(row.id));
}

export function mayDeleteAppAccount(target: { role: string; accountType: string }) {
  return ["player", "owner"].includes(target.accountType) && ["user", "player", "owner"].includes(target.role);
}

async function rebuildPlayerTotals(tx: any, playerId: number) {
  if (!playerId) return;
  const aggregate = (await tx.select({
    matches: sql<number>`COUNT(*)`,
    goals: sql<number>`COALESCE(SUM(${playerMatchStats.goals}), 0)`,
    assists: sql<number>`COALESCE(SUM(${playerMatchStats.assists}), 0)`,
    wins: sql<number>`COALESCE(SUM(CASE WHEN ${playerMatchStats.won} THEN 1 ELSE 0 END), 0)`,
    manOfMatch: sql<number>`COALESCE(SUM(CASE WHEN ${playerMatchStats.manOfMatch} THEN 1 ELSE 0 END), 0)`,
    averageRating: sql<number>`COALESCE(AVG(${playerMatchStats.rating}), 0)`,
  }).from(playerMatchStats).where(eq(playerMatchStats.playerId, playerId)))[0];
  const matchesPlayed = Number(aggregate?.matches || 0);
  if (!matchesPlayed) {
    await tx.delete(playerStatTotals).where(eq(playerStatTotals.userId, playerId));
    return;
  }
  const goals = Number(aggregate.goals || 0);
  const assists = Number(aggregate.assists || 0);
  const wins = Number(aggregate.wins || 0);
  const manOfMatch = Number(aggregate.manOfMatch || 0);
  const averageRating = Number(aggregate.averageRating || 0);
  const rankingScore = goals * 4 + assists * 3 + wins * 2 + manOfMatch * 5 + averageRating;
  await tx.insert(playerStatTotals).values({
    userId: playerId,
    matches: matchesPlayed,
    goals,
    assists,
    wins,
    manOfMatch,
    averageRating: averageRating.toFixed(2),
    rankingScore: rankingScore.toFixed(2),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: playerStatTotals.userId,
    set: {
      matches: matchesPlayed,
      goals,
      assists,
      wins,
      manOfMatch,
      averageRating: averageRating.toFixed(2),
      rankingScore: rankingScore.toFixed(2),
      updatedAt: new Date(),
    },
  });
}

/**
 * Permanently removes an app account and its account-owned records. A SHA-256
 * identity marker is retained in platform_settings so an old OAuth session
 * cannot silently recreate the deleted account. The email and profile row are
 * removed, so a fresh registration may reuse the same email address.
 */
export async function permanentlyDeleteAccount(userId: number, actorId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات مش متاحة دلوقتي." });

  const deletion = await db.transaction(async (tx: any) => {
    const target = (await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update"))[0];
    if (!target || !mayDeleteAppAccount(target)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الحساب مش موجود أو مش حساب لاعب/صاحب ملعب قابل للحذف." });
    }

    const pitchIds = await selectIds(tx, pitches, pitches.id, eq(pitches.ownerId, userId));
    const bookingIds = await selectIds(tx, bookings, bookings.id, asOr(
      eq(bookings.playerId, userId),
      pitchIds.length ? inArray(bookings.pitchId, pitchIds) : undefined,
    ));
    const matchIds = await selectIds(tx, matches, matches.id, asOr(
      eq(matches.creatorId, userId),
      pitchIds.length ? inArray(matches.pitchId, pitchIds) : undefined,
    ));
    const subscriptionIds = await selectIds(tx, subscriptionRequests, subscriptionRequests.id, eq(subscriptionRequests.ownerId, userId));

    const roomIdsFromMembership = await selectIds(tx, chatMembers, chatMembers.roomId, eq(chatMembers.userId, userId));
    const roomIds = await selectIds(tx, chatRooms, chatRooms.id, asOr(
      eq(chatRooms.createdBy, userId),
      roomIdsFromMembership.length ? inArray(chatRooms.id, roomIdsFromMembership) : undefined,
      matchIds.length ? inArray(chatRooms.matchId, matchIds) : undefined,
      bookingIds.length ? inArray(chatRooms.bookingId, bookingIds) : undefined,
    ));
    const adminRoomIdsFromMembership = await selectIds(tx, adminChatMembers, adminChatMembers.roomId, eq(adminChatMembers.userId, userId));
    const adminRoomIds = await selectIds(tx, adminChatRooms, adminChatRooms.id, asOr(
      eq(adminChatRooms.createdBy, userId),
      adminRoomIdsFromMembership.length ? inArray(adminChatRooms.id, adminRoomIdsFromMembership) : undefined,
    ));
    const messageIds = await selectIds(tx, chatMessages, chatMessages.id, asOr(
      eq(chatMessages.senderId, userId),
      roomIds.length ? inArray(chatMessages.roomId, roomIds) : undefined,
    ));
    const adminMessageIds = await selectIds(tx, adminChatMessages, adminChatMessages.id, asOr(
      eq(adminChatMessages.senderId, userId),
      adminRoomIds.length ? inArray(adminChatMessages.roomId, adminRoomIds) : undefined,
    ));
    const reportIds = await selectIds(tx, matchReports, matchReports.id, asOr(
      eq(matchReports.reporterId, userId),
      matchIds.length ? inArray(matchReports.matchId, matchIds) : undefined,
    ));
    const redemptionIds = await selectIds(tx, rewardRedemptions, rewardRedemptions.id, asOr(
      eq(rewardRedemptions.userId, userId),
      eq(rewardRedemptions.usedBy, userId),
    ));
    const referralCodeIds = await selectIds(tx, referralCodes, referralCodes.id, eq(referralCodes.userId, userId));
    const referralAttributionIds = await selectIds(tx, referralAttributions, referralAttributions.id, asOr(
      eq(referralAttributions.inviterId, userId),
      eq(referralAttributions.inviteeId, userId),
    ));
    const referralRewardEventIds = await selectIds(tx, referralRewardEvents, referralRewardEvents.id, asOr(
      eq(referralRewardEvents.recipientUserId, userId),
      referralAttributionIds.length ? inArray(referralRewardEvents.attributionId, referralAttributionIds) : undefined,
    ));
    const reviewIds = await selectIds(tx, matchStatReviews, matchStatReviews.id, asOr(
      matchIds.length ? inArray(matchStatReviews.matchId, matchIds) : undefined,
      reportIds.length ? inArray(matchStatReviews.firstReportId, reportIds) : undefined,
      reportIds.length ? inArray(matchStatReviews.secondReportId, reportIds) : undefined,
    ));
    const statWhere = asOr(
      eq(playerMatchStats.playerId, userId),
      eq(playerMatchStats.approvedBy, userId),
      matchIds.length ? inArray(playerMatchStats.matchId, matchIds) : undefined,
      reviewIds.length ? inArray(playerMatchStats.sourceReviewId, reviewIds) : undefined,
    );
    const affectedStats = statWhere
      ? await tx.select({ playerId: playerMatchStats.playerId }).from(playerMatchStats).where(statWhere)
      : [];
    const affectedPlayerIds = new Set<number>(affectedStats.map((row: { playerId: number }) => Number(row.playerId)));

    const assetRows = await tx.select({ key: uploadedAssets.key }).from(uploadedAssets).where(eq(uploadedAssets.ownerId, userId));
    const assetKeys = [...new Set(assetRows.map((row: { key: string }) => row.key).filter(Boolean))];
    const walletIds = await selectIds(tx, walletAccounts, walletAccounts.id, eq(walletAccounts.userId, userId));

    if (target.avatarUrl) {
      await tx.update(notifications).set({ iconUrl: null }).where(eq(notifications.iconUrl, target.avatarUrl));
    }

    const chatSignalWhere = asOr(
      eq(chatCallSignals.senderId, userId),
      eq(chatCallSignals.recipientId, userId),
      roomIds.length ? inArray(chatCallSignals.roomId, roomIds) : undefined,
    );
    if (chatSignalWhere) await tx.delete(chatCallSignals).where(chatSignalWhere);

    if (messageIds.length) {
      const messageIdsWhere = inArray(chatMessageReads.messageId, messageIds);
      await tx.delete(chatMessageReads).where(asOr(eq(chatMessageReads.userId, userId), messageIdsWhere));
      await tx.delete(chatMessageHidden).where(asOr(eq(chatMessageHidden.userId, userId), inArray(chatMessageHidden.messageId, messageIds)));
      await tx.delete(chatMessageReactions).where(asOr(eq(chatMessageReactions.userId, userId), inArray(chatMessageReactions.messageId, messageIds)));
      await tx.delete(chatMessageReplyReferences).where(asOr(
        inArray(chatMessageReplyReferences.messageId, messageIds),
        inArray(chatMessageReplyReferences.replyToMessageId, messageIds),
      ));
    } else {
      await tx.delete(chatMessageReads).where(eq(chatMessageReads.userId, userId));
      await tx.delete(chatMessageHidden).where(eq(chatMessageHidden.userId, userId));
      await tx.delete(chatMessageReactions).where(eq(chatMessageReactions.userId, userId));
    }
    if (messageIds.length) await tx.delete(chatMessages).where(inArray(chatMessages.id, messageIds));
    if (adminMessageIds.length) await tx.delete(adminChatMessages).where(inArray(adminChatMessages.id, adminMessageIds));
    await tx.delete(adminChatMembers).where(asOr(
      eq(adminChatMembers.userId, userId),
      adminRoomIds.length ? inArray(adminChatMembers.roomId, adminRoomIds) : undefined,
    ));
    if (adminRoomIds.length) await tx.delete(adminChatRooms).where(inArray(adminChatRooms.id, adminRoomIds));
    await tx.delete(chatMembers).where(asOr(
      eq(chatMembers.userId, userId),
      roomIds.length ? inArray(chatMembers.roomId, roomIds) : undefined,
    ));
    if (roomIds.length) await tx.delete(chatRooms).where(inArray(chatRooms.id, roomIds));

    if (reportIds.length) {
      await tx.delete(matchReportMedia).where(inArray(matchReportMedia.reportId, reportIds));
      await tx.delete(matchReportPlayers).where(inArray(matchReportPlayers.reportId, reportIds));
    }
    await tx.delete(matchReportPlayers).where(eq(matchReportPlayers.playerId, userId));
    if (reviewIds.length) await tx.delete(playerMatchStats).where(statWhere);
    else if (statWhere) await tx.delete(playerMatchStats).where(statWhere);
    if (reviewIds.length) await tx.delete(matchStatReviews).where(inArray(matchStatReviews.id, reviewIds));
    if (reportIds.length) await tx.delete(matchReports).where(inArray(matchReports.id, reportIds));
    const appealWhere = asOr(
      eq(statAppeals.appellantId, userId),
      matchIds.length ? inArray(statAppeals.matchId, matchIds) : undefined,
    );
    if (appealWhere) await tx.delete(statAppeals).where(appealWhere);
    await tx.update(matchStatReviews).set({ resolvedBy: null }).where(eq(matchStatReviews.resolvedBy, userId));
    await tx.update(statAppeals).set({ resolvedBy: null }).where(eq(statAppeals.resolvedBy, userId));
    if (matchIds.length) await tx.delete(matchParticipants).where(inArray(matchParticipants.matchId, matchIds));
    await tx.delete(matchParticipants).where(eq(matchParticipants.userId, userId));
    if (matchIds.length) await tx.delete(matches).where(inArray(matches.id, matchIds));

    if (bookingIds.length) {
      await tx.delete(qrLogs).where(asOr(eq(qrLogs.userId, userId), inArray(qrLogs.bookingId, bookingIds)));
      await tx.delete(receiptVerifications).where(and(eq(receiptVerifications.kind, "booking"), inArray(receiptVerifications.referenceId, bookingIds)));
      await tx.delete(bookings).where(inArray(bookings.id, bookingIds));
    } else {
      await tx.delete(qrLogs).where(eq(qrLogs.userId, userId));
    }
    await tx.delete(appointments).where(asOr(
      eq(appointments.userId, userId),
      pitchIds.length ? inArray(appointments.pitchId, pitchIds) : undefined,
    ));
    if (pitchIds.length) {
      await tx.delete(pitchCaptains).where(inArray(pitchCaptains.pitchId, pitchIds));
      await tx.delete(schedules).where(inArray(schedules.pitchId, pitchIds));
      await tx.delete(pitchFields).where(inArray(pitchFields.pitchId, pitchIds));
      await tx.update(rewards).set({ isActive: false, authorizedPitchId: null, updatedAt: new Date() }).where(inArray(rewards.authorizedPitchId, pitchIds));
      await tx.update(rewardRedemptions).set({ authorizedPitchIdSnapshot: null, updatedAt: new Date() }).where(inArray(rewardRedemptions.authorizedPitchIdSnapshot, pitchIds));
      await tx.delete(pitches).where(inArray(pitches.id, pitchIds));
    }

    if (subscriptionIds.length) {
      await tx.delete(receiptVerifications).where(and(eq(receiptVerifications.kind, "subscription"), inArray(receiptVerifications.referenceId, subscriptionIds)));
      await tx.delete(subscriptionRequests).where(inArray(subscriptionRequests.id, subscriptionIds));
    }
    await tx.update(subscriptionRequests).set({ reviewedBy: null }).where(eq(subscriptionRequests.reviewedBy, userId));

    await tx.delete(rewardRedemptions).where(eq(rewardRedemptions.userId, userId));
    await tx.update(rewardRedemptions).set({ usedBy: null, updatedAt: new Date() }).where(eq(rewardRedemptions.usedBy, userId));
    if (referralRewardEventIds.length) {
      await tx.update(pointTransactions).set({
        referenceType: "deleted_referral_reward",
        referenceId: null,
        note: "مكافأة إحالة (تم حذف بيانات الحساب)",
      }).where(and(
        eq(pointTransactions.referenceType, "referral_reward_event"),
        inArray(pointTransactions.referenceId, referralRewardEventIds),
        sql`${pointTransactions.userId} <> ${userId}`,
      ));
      await tx.delete(referralRewardEvents).where(inArray(referralRewardEvents.id, referralRewardEventIds));
    }
    if (referralAttributionIds.length) await tx.delete(referralAttributions).where(inArray(referralAttributions.id, referralAttributionIds));
    if (referralCodeIds.length) {
      await tx.delete(referralEvents).where(inArray(referralEvents.referralCodeId, referralCodeIds));
      await tx.delete(referralCodes).where(inArray(referralCodes.id, referralCodeIds));
    }
    await tx.delete(pointTransactions).where(eq(pointTransactions.userId, userId));
    await tx.delete(pointAccounts).where(eq(pointAccounts.userId, userId));
    if (walletIds.length) await tx.delete(walletTransactions).where(inArray(walletTransactions.walletId, walletIds));
    await tx.delete(walletAccounts).where(eq(walletAccounts.userId, userId));

    const reportWhere = asOr(
      eq(reports.reporterId, userId),
      and(eq(reports.targetType, "user"), eq(reports.targetId, userId)),
      pitchIds.length ? and(eq(reports.targetType, "pitch"), inArray(reports.targetId, pitchIds)) : undefined,
      matchIds.length ? and(eq(reports.targetType, "match"), inArray(reports.targetId, matchIds)) : undefined,
      bookingIds.length ? and(eq(reports.targetType, "booking"), inArray(reports.targetId, bookingIds)) : undefined,
      roomIds.length ? and(eq(reports.targetType, "support"), inArray(reports.targetId, roomIds)) : undefined,
    );
    if (reportWhere) await tx.delete(reports).where(reportWhere);
    await tx.update(reports).set({ reviewedBy: null }).where(eq(reports.reviewedBy, userId));

    await tx.delete(pitchSuggestions).where(eq(pitchSuggestions.userId, userId));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await tx.delete(friendRequests).where(asOr(eq(friendRequests.requesterId, userId), eq(friendRequests.recipientId, userId)));
    await tx.delete(blockedUsers).where(asOr(eq(blockedUsers.blockerId, userId), eq(blockedUsers.blockedId, userId)));
    const notificationWhere = asOr(
      eq(notifications.userId, userId),
      eq(notifications.senderId, userId),
      messageIds.length ? inArray(notifications.chatMessageId, messageIds) : undefined,
      ...bookingIds.map(id => eq(notifications.url, `/book?booking=${id}`)),
    );
    if (notificationWhere) await tx.delete(notifications).where(notificationWhere);
    await tx.delete(customerActivityLogs).where(eq(customerActivityLogs.userId, userId));

    await tx.update(bookings).set({ reviewedBy: null }).where(eq(bookings.reviewedBy, userId));
    await tx.update(platformSettings).set({ updatedBy: null }).where(eq(platformSettings.updatedBy, userId));

    const adminAuditWhere = asOr(
      eq(adminAuditLogs.actorId, userId),
      and(eq(adminAuditLogs.targetType, "user"), eq(adminAuditLogs.targetId, userId)),
      pitchIds.length ? and(eq(adminAuditLogs.targetType, "pitch"), inArray(adminAuditLogs.targetId, pitchIds)) : undefined,
      matchIds.length ? and(eq(adminAuditLogs.targetType, "match"), inArray(adminAuditLogs.targetId, matchIds)) : undefined,
      bookingIds.length ? and(eq(adminAuditLogs.targetType, "booking"), inArray(adminAuditLogs.targetId, bookingIds)) : undefined,
      roomIds.length ? and(eq(adminAuditLogs.targetType, "support_room"), inArray(adminAuditLogs.targetId, roomIds)) : undefined,
      reviewIds.length ? and(eq(adminAuditLogs.targetType, "match_stat_review"), inArray(adminAuditLogs.targetId, reviewIds)) : undefined,
      messageIds.length ? and(eq(adminAuditLogs.targetType, "chat_message"), inArray(adminAuditLogs.targetId, messageIds)) : undefined,
      redemptionIds.length ? and(eq(adminAuditLogs.targetType, "reward_redemption"), inArray(adminAuditLogs.targetId, redemptionIds)) : undefined,
      referralAttributionIds.length ? and(eq(adminAuditLogs.targetType, "referral_attribution"), inArray(adminAuditLogs.targetId, referralAttributionIds)) : undefined,
    );
    if (adminAuditWhere) await tx.delete(adminAuditLogs).where(adminAuditWhere);

    for (const playerId of affectedPlayerIds) {
      if (playerId !== userId) await rebuildPlayerTotals(tx, playerId);
    }
    await tx.delete(playerStatTotals).where(eq(playerStatTotals.userId, userId));
    if (target.email) await tx.delete(authOtps).where(eq(authOtps.email, target.email));

    const markerKey = deletedIdentitySettingKey(target.openId);
    await tx.insert(platformSettings).values({
      key: markerKey,
      value: new Date().toISOString(),
      updatedBy: actorId,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { value: new Date().toISOString(), updatedBy: actorId, updatedAt: new Date() } });

    await tx.delete(uploadedAssets).where(eq(uploadedAssets.ownerId, userId));
    await tx.delete(users).where(eq(users.id, userId));
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "account.deleted",
      targetType: "account_deletion",
      targetId: null,
      details: {
        accountType: target.accountType,
        ownedPitchCount: pitchIds.length,
        bookingCount: bookingIds.length,
        matchCount: matchIds.length,
        supportRoomCount: roomIds.length,
        uploadedAssetCount: assetKeys.length,
      },
    });

    return {
      accountType: target.accountType,
      ownedPitchCount: pitchIds.length,
      bookingCount: bookingIds.length,
      matchCount: matchIds.length,
      supportRoomCount: roomIds.length,
      assetKeys,
    };
  });

  let storageCleanupComplete = deletion.assetKeys.length === 0;
  if (deletion.assetKeys.length) {
    try {
      await storageDeleteMany(deletion.assetKeys as string[]);
      storageCleanupComplete = true;
    } catch (error) {
      console.error(`[AccountDeletion] Storage cleanup failed for ${deletion.assetKeys.length} files`);
      storageCleanupComplete = false;
    }
  }

  return {
    success: true as const,
    userId,
    accountType: deletion.accountType,
    ownedPitchCount: deletion.ownedPitchCount,
    bookingCount: deletion.bookingCount,
    matchCount: deletion.matchCount,
    supportRoomCount: deletion.supportRoomCount,
    uploadedAssetCount: deletion.assetKeys.length,
    storageCleanupComplete,
  };
}
