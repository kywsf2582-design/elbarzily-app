import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as schema from "../drizzle/schema.pg";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const {
  adminAuditLogs,
  bookings,
  pointAccounts,
  pointTransactions,
  referralAttributions,
  referralCampaignSettings,
  referralCodes,
  referralEvents,
  referralRewardEvents,
  users,
} = schema;

const dbOrThrow = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات مش متاحة دلوقتي. جرّب تاني بعد شوية." });
  return db;
};

export const DEFAULT_REFERRAL_CAMPAIGN = {
  id: 1,
  enabled: false,
  startsAt: null,
  endsAt: null,
  profilePoints: 0,
  firstQrBookingPoints: 0,
  dailyReferralLimit: 10,
  monthlyReferralLimit: 100,
  shareMessage: "أنا بلعب في البرازيلي، تعالى نلعب سوا!",
  updatedBy: null,
  updatedAt: null,
};

export function normalizeReferralCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-F0-9]{12}$/.test(code) ? code : null;
}

export function normalizeReferralPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0020")) return `0${digits.slice(4)}`;
  if (digits.startsWith("20")) return `0${digits.slice(2)}`;
  return digits;
}

export function isCompleteReferralProfile(user: any): boolean {
  return Boolean(
    user &&
    user.role === "player" &&
    user.accountType === "player" &&
    !user.isSuspended &&
    user.emailVerifiedAt &&
    String(user.email ?? "").trim() &&
    String(user.name ?? "").trim() &&
    String(user.phone ?? "").trim() &&
    String(user.region ?? "").trim(),
  );
}

export function isReferralCampaignActive(config: any, now = new Date()): boolean {
  if (!config?.enabled) return false;
  const time = now.getTime();
  const startsAt = config.startsAt ? new Date(config.startsAt).getTime() : null;
  const endsAt = config.endsAt ? new Date(config.endsAt).getTime() : null;
  return Number.isFinite(time) &&
    (startsAt === null || (Number.isFinite(startsAt) && time >= startsAt)) &&
    (endsAt === null || (Number.isFinite(endsAt) && time <= endsAt));
}

async function getCampaign(tx: any): Promise<any> {
  const row = (await tx.select().from(referralCampaignSettings).where(eq(referralCampaignSettings.id, 1)).limit(1))[0];
  return row ?? DEFAULT_REFERRAL_CAMPAIGN;
}

async function getOrCreateReferralCode(tx: any, userId: number): Promise<string> {
  const existing = (await tx.select({ code: referralCodes.code }).from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1))[0];
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(6).toString("hex").toUpperCase();
    await tx.insert(referralCodes).values({ userId, code }).onConflictDoNothing();
    const saved = (await tx.select({ code: referralCodes.code }).from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1))[0];
    if (saved?.code) return saved.code;
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ماقدرناش نجهّز كود الدعوة دلوقتي." });
}

async function countQualifiedReferrals(tx: any, inviterId: number, since: Date): Promise<number> {
  const result = (await tx.select({ value: count() })
    .from(referralAttributions)
    .where(and(
      eq(referralAttributions.inviterId, inviterId),
      eq(referralAttributions.status, "qualified"),
      gte(referralAttributions.qualifiedAt, since),
    )))[0];
  return Number(result?.value ?? 0);
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function referralLimitReason(tx: any, inviterId: number, config: any, now: Date): Promise<string | null> {
  const dailyCount = await countQualifiedReferrals(tx, inviterId, utcDayStart(now));
  if (dailyCount >= Number(config.dailyReferralLimit || 0)) return "وصل الحد اليومي للدعوات؛ محتاجة مراجعة الإدارة.";
  const monthlyCount = await countQualifiedReferrals(tx, inviterId, utcMonthStart(now));
  if (monthlyCount >= Number(config.monthlyReferralLimit || 0)) return "وصل الحد الشهري للدعوات؛ محتاجة مراجعة الإدارة.";
  return null;
}

async function lockInviterReferralCode(tx: any, inviterId: number): Promise<void> {
  await tx.select({ id: referralCodes.id }).from(referralCodes)
    .where(eq(referralCodes.userId, inviterId)).limit(1).for("update");
}

async function grantReferralPoints(
  tx: any,
  input: { attributionId: number; inviterId: number; milestone: "profile_complete" | "first_qr_booking"; points: number; bookingId?: number | null; now?: Date },
): Promise<boolean> {
  const points = Math.trunc(Number(input.points));
  if (!Number.isFinite(points) || points <= 0) return false;
  const now = input.now ?? new Date();
  const inserted = await tx.insert(referralRewardEvents).values({
    attributionId: input.attributionId,
    recipientUserId: input.inviterId,
    milestone: input.milestone,
    points,
    bookingId: input.bookingId ?? null,
    status: "awarded",
    createdAt: now,
  }).onConflictDoNothing().returning({ id: referralRewardEvents.id });
  const rewardEventId = Number(inserted[0]?.id || 0);
  if (!rewardEventId) return false;

  const account = (await tx.insert(pointAccounts).values({ userId: input.inviterId, balance: points, updatedAt: now })
    .onConflictDoUpdate({
      target: pointAccounts.userId,
      set: { balance: sql`${pointAccounts.balance} + ${points}`, updatedAt: now },
    })
    .returning({ balance: pointAccounts.balance }))[0];
  const balanceAfter = Number(account?.balance ?? 0);
  const note = input.milestone === "profile_complete"
    ? "مكافأة دعوة لاعب جديد أكمل حسابه"
    : "مكافأة أول حجز اتأكد برمز QR";
  await tx.insert(pointTransactions).values({
    userId: input.inviterId,
    amount: points,
    balanceAfter,
    kind: "earn",
    referenceType: "referral_reward_event",
    referenceId: rewardEventId,
    note,
    createdAt: now,
  });
  return true;
}

export async function qualifyReferralForUser(tx: any, inviteeId: number, now = new Date()): Promise<{ status: string; pointsAwarded: number }> {
  const attribution = (await tx.select().from(referralAttributions)
    .where(eq(referralAttributions.inviteeId, inviteeId)).limit(1).for("update"))[0];
  if (!attribution || !["pending_profile", "pending_review"].includes(attribution.status))
    return { status: attribution?.status ?? "none", pointsAwarded: 0 };
  if (attribution.status === "pending_review") return { status: "pending_review", pointsAwarded: 0 };

  const invitee = (await tx.select().from(users).where(eq(users.id, inviteeId)).limit(1))[0];
  if (!isCompleteReferralProfile(invitee)) return { status: "pending_profile", pointsAwarded: 0 };

  const config = await getCampaign(tx);
  if (!isReferralCampaignActive(config, now)) {
    await tx.update(referralAttributions).set({ status: "campaign_inactive" }).where(eq(referralAttributions.id, attribution.id));
    return { status: "campaign_inactive", pointsAwarded: 0 };
  }

  const inviter = (await tx.select({ role: users.role, accountType: users.accountType, isSuspended: users.isSuspended })
    .from(users).where(eq(users.id, attribution.inviterId)).limit(1))[0];
  if (!inviter || inviter.role !== "player" || inviter.accountType !== "player" || inviter.isSuspended) {
    await tx.update(referralAttributions).set({ status: "pending_review", reviewNote: "حساب صاحب كود الدعوة محتاج مراجعة." }).where(eq(referralAttributions.id, attribution.id));
    return { status: "pending_review", pointsAwarded: 0 };
  }

  await lockInviterReferralCode(tx, Number(attribution.inviterId));
  const limitReason = await referralLimitReason(tx, attribution.inviterId, config, now);
  if (limitReason) {
    await tx.update(referralAttributions).set({ status: "pending_review", reviewNote: limitReason }).where(eq(referralAttributions.id, attribution.id));
    return { status: "pending_review", pointsAwarded: 0 };
  }
  const points = Number(config.profilePoints || 0);
  if (points > 0) {
    await grantReferralPoints(tx, {
      attributionId: Number(attribution.id),
      inviterId: Number(attribution.inviterId),
      milestone: "profile_complete",
      points,
      now,
    });
  }

  await tx.update(referralAttributions).set({ status: "qualified", qualifiedAt: now, reviewNote: null }).where(eq(referralAttributions.id, attribution.id));
  return { status: "qualified", pointsAwarded: points };
}

export async function attachReferralAtRegistration(tx: any, input: { referralCode?: string | null; inviteeId: number }): Promise<boolean> {
  const code = normalizeReferralCode(input.referralCode);
  if (!code) return false;
  const match = (await tx.select({ codeId: referralCodes.id, inviter: users })
    .from(referralCodes)
    .innerJoin(users, eq(referralCodes.userId, users.id))
    .where(eq(referralCodes.code, code))
    .limit(1))[0];
  if (!match) return false;
  const invitee = (await tx.select({ id: users.id, email: users.email, phone: users.phone, accountType: users.accountType, role: users.role })
    .from(users).where(eq(users.id, input.inviteeId)).limit(1))[0];
  const inviter = match.inviter;
  if (!invitee || invitee.accountType !== "player" || invitee.role !== "player") return false;
  if (inviter.accountType !== "player" || inviter.role !== "player" || inviter.isSuspended) return false;
  const sameEmail = String(invitee.email ?? "").trim().toLowerCase() === String(inviter.email ?? "").trim().toLowerCase();
  const inviteePhone = normalizeReferralPhone(invitee.phone);
  const samePhone = inviteePhone.length >= 10 && inviteePhone === normalizeReferralPhone(inviter.phone);
  if (Number(inviter.id) === Number(invitee.id) || sameEmail || samePhone) return false;

  const config = await getCampaign(tx);
  const active = isReferralCampaignActive(config);
  const inserted = await tx.insert(referralAttributions).values({
    inviterId: inviter.id,
    inviteeId: invitee.id,
    referralCode: code,
    status: active ? "pending_profile" : "campaign_inactive",
  }).onConflictDoNothing().returning({ id: referralAttributions.id });
  if (!inserted.length) return false;
  if (active) await qualifyReferralForUser(tx, Number(invitee.id));
  return true;
}

export async function awardFirstQrBookingReferralBonus(tx: any, inviteeId: number, bookingId: number, now = new Date()): Promise<number> {
  const attribution = (await tx.select().from(referralAttributions)
    .where(eq(referralAttributions.inviteeId, inviteeId)).limit(1).for("update"))[0];
  if (!attribution || attribution.status !== "qualified") return 0;
  const config = await getCampaign(tx);
  if (!isReferralCampaignActive(config, now)) return 0;
  const points = Number(config.firstQrBookingPoints || 0);
  if (points <= 0) return 0;
  const awarded = await grantReferralPoints(tx, {
    attributionId: Number(attribution.id),
    inviterId: Number(attribution.inviterId),
    milestone: "first_qr_booking",
    points,
    bookingId,
    now,
  });
  return awarded ? points : 0;
}

function assertPlayer(user: any) {
  if (!user || user.accountType !== "player" || user.role !== "player" || user.isSuspended)
    throw new TRPCError({ code: "FORBIDDEN", message: "نظام الدعوات والنقط متاح لحسابات اللعيبة النشطة بس." });
}

const referralCodeSchema = z.string().trim().transform(value => value.toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{12}$/, "كود الدعوة مش مضبوط."));

export const referralsRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    assertPlayer(ctx.user);
    const db = await dbOrThrow();
    const code = await db.transaction(tx => getOrCreateReferralCode(tx, ctx.user.id));
    const config = await getCampaign(db);
    await db.transaction(async tx => {
      const pending = await tx.select({ inviteeId: referralAttributions.inviteeId })
        .from(referralAttributions)
        .where(and(eq(referralAttributions.inviterId, ctx.user.id), inArray(referralAttributions.status, ["pending_profile", "pending_review"])))
        .limit(100);
      for (const item of pending) await qualifyReferralForUser(tx, Number(item.inviteeId));
    });
    const eventCounts = await db.select({ eventType: referralEvents.eventType, total: count() })
      .from(referralEvents)
      .innerJoin(referralCodes, eq(referralEvents.referralCodeId, referralCodes.id))
      .where(eq(referralCodes.userId, ctx.user.id))
      .groupBy(referralEvents.eventType);
    const referralCounts = await db.select({ status: referralAttributions.status, total: count() })
      .from(referralAttributions).where(eq(referralAttributions.inviterId, ctx.user.id)).groupBy(referralAttributions.status);
    const points = (await db.select({ total: sum(referralRewardEvents.points) }).from(referralRewardEvents)
      .where(and(eq(referralRewardEvents.recipientUserId, ctx.user.id), eq(referralRewardEvents.status, "awarded"))))[0];
    const eventMap = Object.fromEntries(eventCounts.map(row => [row.eventType, Number(row.total)]));
    const referralMap = Object.fromEntries(referralCounts.map(row => [row.status, Number(row.total)]));
    return {
      code,
      campaign: {
        active: isReferralCampaignActive(config),
        profilePoints: Number(config.profilePoints || 0),
        firstQrBookingPoints: Number(config.firstQrBookingPoints || 0),
        shareMessage: config.shareMessage,
      },
      counts: {
        visits: eventMap.visit || 0,
        shareAttempts: eventMap.share_attempt || 0,
        signups: Object.values(referralMap).reduce((total, value) => total + Number(value), 0),
        qualified: referralMap.qualified || 0,
        pending: (referralMap.pending_profile || 0) + (referralMap.pending_review || 0),
        pointsEarned: Number(points?.total || 0),
      },
    };
  }),
  track: publicProcedure.input(z.object({
    code: referralCodeSchema,
    eventType: z.enum(["visit", "share_attempt"]),
    clientEventId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const config = await getCampaign(db);
    if (!isReferralCampaignActive(config)) return { tracked: false };
    const codeRow = (await db.select({ id: referralCodes.id }).from(referralCodes).where(eq(referralCodes.code, input.code)).limit(1))[0];
    if (!codeRow) return { tracked: false };
    await db.insert(referralEvents).values({
      referralCodeId: codeRow.id,
      clientEventId: input.clientEventId,
      eventType: input.eventType,
    }).onConflictDoNothing();
    return { tracked: true };
  }),
});

const referralsForInviter = alias(users, "referrals_inviter");
const referralsForInvitee = alias(users, "referrals_invitee");

async function getAdminReferralSnapshot(db: any) {
  const config = await getCampaign(db);
  const [events, referralStatuses, pointTotals] = await Promise.all([
    db.select({ eventType: referralEvents.eventType, total: count() }).from(referralEvents).groupBy(referralEvents.eventType),
    db.select({ status: referralAttributions.status, total: count() }).from(referralAttributions).groupBy(referralAttributions.status),
    db.select({ total: sum(referralRewardEvents.points) }).from(referralRewardEvents).where(eq(referralRewardEvents.status, "awarded")),
  ]);
  const items = await db.select({
    referral: referralAttributions,
    inviterName: referralsForInviter.name,
    inviterEmail: referralsForInviter.email,
    inviteeName: referralsForInvitee.name,
    inviteeEmail: referralsForInvitee.email,
  }).from(referralAttributions)
    .leftJoin(referralsForInviter, eq(referralAttributions.inviterId, referralsForInviter.id))
    .leftJoin(referralsForInvitee, eq(referralAttributions.inviteeId, referralsForInvitee.id))
    .orderBy(desc(referralAttributions.attributedAt)).limit(250);
  const eventMap = Object.fromEntries(events.map((row: any) => [row.eventType, Number(row.total)]));
  const statusMap = Object.fromEntries(referralStatuses.map((row: any) => [row.status, Number(row.total)]));
  return {
    campaign: config,
    metrics: {
      visits: eventMap.visit || 0,
      shareAttempts: eventMap.share_attempt || 0,
      signups: Object.values(statusMap).reduce((total: number, value: any) => total + Number(value), 0),
      qualified: statusMap.qualified || 0,
      pendingProfile: statusMap.pending_profile || 0,
      pendingReview: statusMap.pending_review || 0,
      pointsAwarded: Number(pointTotals[0]?.total || 0),
    },
    items: items.map((row: any) => ({ ...row.referral, inviterName: row.inviterName, inviterEmail: row.inviterEmail, inviteeName: row.inviteeName, inviteeEmail: row.inviteeEmail })),
  };
}

function adminOnly(role: string) {
  if (role !== "admin" && role !== "super_admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "تعديل إعدادات الحملة متاح للمديرين بس." });
}

export const adminReferralsRouter = router({
  snapshot: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    return getAdminReferralSnapshot(db);
  }),
  updateCampaign: adminProcedure.input(z.object({
    enabled: z.boolean(),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    profilePoints: z.number().int().min(0).max(1000000),
    firstQrBookingPoints: z.number().int().min(0).max(1000000),
    dailyReferralLimit: z.number().int().min(1).max(10000),
    monthlyReferralLimit: z.number().int().min(1).max(100000),
    shareMessage: z.string().trim().min(8).max(500),
  })).mutation(async ({ ctx, input }) => {
    adminOnly(ctx.user.role);
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime())
      throw new TRPCError({ code: "BAD_REQUEST", message: "ميعاد بداية الحملة لازم يكون قبل ميعاد نهايتها." });
    if (input.enabled && input.profilePoints <= 0 && input.firstQrBookingPoints <= 0)
      throw new TRPCError({ code: "BAD_REQUEST", message: "حط نقاط لمكافأة واحدة على الأقل قبل تشغيل الحملة." });
    const db = await dbOrThrow();
    const values = {
      id: 1,
      enabled: input.enabled,
      startsAt,
      endsAt,
      profilePoints: input.profilePoints,
      firstQrBookingPoints: input.firstQrBookingPoints,
      dailyReferralLimit: input.dailyReferralLimit,
      monthlyReferralLimit: input.monthlyReferralLimit,
      shareMessage: input.shareMessage.trim(),
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    };
    const updated = await db.insert(referralCampaignSettings).values(values).onConflictDoUpdate({
      target: referralCampaignSettings.id,
      set: {
        enabled: values.enabled,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        profilePoints: values.profilePoints,
        firstQrBookingPoints: values.firstQrBookingPoints,
        dailyReferralLimit: values.dailyReferralLimit,
        monthlyReferralLimit: values.monthlyReferralLimit,
        shareMessage: values.shareMessage,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    }).returning();
    await db.insert(adminAuditLogs).values({
      actorId: ctx.user.id,
      action: "referrals.campaign_updated",
      targetType: "referral_campaign",
      targetId: 1,
      details: { enabled: values.enabled, profilePoints: values.profilePoints, firstQrBookingPoints: values.firstQrBookingPoints, dailyReferralLimit: values.dailyReferralLimit, monthlyReferralLimit: values.monthlyReferralLimit, startsAt: values.startsAt?.toISOString() ?? null, endsAt: values.endsAt?.toISOString() ?? null },
    });
    return updated[0] ?? values;
  }),
  review: adminProcedure.input(z.object({
    referralId: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    if (input.decision === "reject" && !input.note?.trim())
      throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب سبب رفض الإحالة عشان يتسجل في المراجعة." });
    const db = await dbOrThrow();
    return db.transaction(async (tx: any) => {
      const attribution = (await tx.select().from(referralAttributions)
        .where(eq(referralAttributions.id, input.referralId)).limit(1).for("update"))[0];
      if (!attribution || attribution.status !== "pending_review")
        throw new TRPCError({ code: "NOT_FOUND", message: "الإحالة مش موجودة في قائمة المراجعة." });
      const now = new Date();
      if (input.decision === "reject") {
        await tx.update(referralAttributions).set({
          status: "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: now,
          reviewNote: input.note!.trim(),
        }).where(eq(referralAttributions.id, attribution.id));
      } else {
        const config = await getCampaign(tx);
        if (!isReferralCampaignActive(config, now))
          throw new TRPCError({ code: "BAD_REQUEST", message: "الحملة مقفولة أو خارج مواعيدها؛ ماينفعش نصرف نقاط دلوقتي." });
        const invitee = (await tx.select().from(users).where(eq(users.id, attribution.inviteeId)).limit(1))[0];
        const inviter = (await tx.select({ id: users.id, role: users.role, accountType: users.accountType, isSuspended: users.isSuspended })
          .from(users).where(eq(users.id, attribution.inviterId)).limit(1))[0];
        if (!isCompleteReferralProfile(invitee) || !inviter || inviter.role !== "player" || inviter.accountType !== "player" || inviter.isSuspended)
          throw new TRPCError({ code: "BAD_REQUEST", message: "شروط الحساب مش مكتملة؛ راجع البريد والملف وحالة الحساب." });
        const points = Number(config.profilePoints || 0);
        if (points > 0) {
          await lockInviterReferralCode(tx, Number(attribution.inviterId));
          // A manager's explicit, audited approval is the manual path for a referral held by an automatic cap.
          await grantReferralPoints(tx, { attributionId: Number(attribution.id), inviterId: Number(attribution.inviterId), milestone: "profile_complete", points, now });
        }
        await tx.update(referralAttributions).set({
          status: "qualified",
          qualifiedAt: now,
          reviewedBy: ctx.user.id,
          reviewedAt: now,
          reviewNote: input.note?.trim() || "اتراجعت واتوافقت من الإدارة.",
        }).where(eq(referralAttributions.id, attribution.id));
      }
      await tx.insert(adminAuditLogs).values({
        actorId: ctx.user.id,
        action: input.decision === "approve" ? "referrals.approved" : "referrals.rejected",
        targetType: "referral_attribution",
        targetId: Number(attribution.id),
        details: { decision: input.decision, note: input.note?.trim() || null },
      });
      return { success: true, decision: input.decision };
    });
  }),
});
