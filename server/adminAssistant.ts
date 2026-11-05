import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  notifications,
  ownerPlans,
  pitches,
  pitchFields,
  reports,
  schedules,
  subscriptionRequests,
  users,
} from "../drizzle/schema.pg";
import { invokeJsonWithFallback } from "./aiJson";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const reportReplyActionSchema = z.object({
  type: z.literal("reply_reports"),
  reportIds: z.array(z.number().int().positive()).min(1).max(8),
  message: z.string().trim().min(2).max(1000),
});

const ownerAccessActionSchema = z.object({
  type: z.literal("owner_access"),
  ownerId: z.number().int().positive(),
  suspended: z.boolean(),
});

const proposedActionSchema = z.discriminatedUnion("type", [
  reportReplyActionSchema,
  ownerAccessActionSchema,
]);

const assistantOutputSchema = z.object({
  answer: z.string().trim().min(1).max(5000),
  action: proposedActionSchema.nullable().optional(),
});

const historySchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1600),
  })
).max(8);

const adminOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "مساعد الإدارة متاح للأدمن فقط.",
    });
  }
  return next({ ctx });
});

const dbOrThrow = async () => {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available" });
  }
  return db;
};

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function estimatePlanExpiry(
  reviewedAt: Date | string | null | undefined,
  durationDays: number | null | undefined,
  now = new Date()
): { at: string; daysRemaining: number } | null {
  const start = reviewedAt
    ? reviewedAt instanceof Date ? reviewedAt.getTime() : new Date(reviewedAt).getTime()
    : Number.NaN;
  const duration = Number(durationDays);
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return null;
  const expires = start + duration * 24 * 60 * 60 * 1000;
  return {
    at: new Date(expires).toISOString(),
    daysRemaining: Math.ceil((expires - now.getTime()) / (24 * 60 * 60 * 1000)),
  };
}

export type AdminSnapshot = Awaited<ReturnType<typeof getAdminSnapshot>>;

async function getAdminSnapshot() {
  const db = await dbOrThrow();
  const [
    totalUsers,
    playerUsers,
    ownerUsers,
    suspendedOwners,
    totalPitches,
    publishedPitches,
    pendingBookings,
    openReports,
    pendingSubscriptions,
    recentReports,
    recentBookings,
    recentSubscriptions,
    recentOwners,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(users),
    db.select({ value: sql<number>`count(*)` }).from(users).where(eq(users.accountType, "player")),
    db.select({ value: sql<number>`count(*)` }).from(users).where(eq(users.accountType, "owner")),
    db.select({ value: sql<number>`count(*)` }).from(users).where(and(eq(users.accountType, "owner"), eq(users.isSuspended, true))),
    db.select({ value: sql<number>`count(*)` }).from(pitches),
    db.select({ value: sql<number>`count(*)` }).from(pitches).where(eq(pitches.status, "published")),
    db.select({ value: sql<number>`count(*)` }).from(bookings).where(eq(bookings.status, "pending")),
    db.select({ value: sql<number>`count(*)` }).from(reports).where(inArray(reports.status, ["open", "reviewing"])),
    db.select({ value: sql<number>`count(*)` }).from(subscriptionRequests).where(eq(subscriptionRequests.status, "pending")),
    db.select({
      id: reports.id,
      reporterId: reports.reporterId,
      reporterName: users.name,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      createdAt: reports.createdAt,
    }).from(reports).leftJoin(users, eq(reports.reporterId, users.id)).orderBy(desc(reports.createdAt)).limit(10),
    db.select({
      id: bookings.id,
      playerName: users.name,
      pitchName: pitches.name,
      fieldName: pitchFields.name,
      startsAt: schedules.startsAt,
      endsAt: schedules.endsAt,
      price: schedules.price,
      paymentMethod: bookings.paymentMethod,
      paymentAmount: bookings.paymentAmount,
      status: bookings.status,
      createdAt: bookings.createdAt,
    }).from(bookings)
      .leftJoin(users, eq(bookings.playerId, users.id))
      .leftJoin(pitches, eq(bookings.pitchId, pitches.id))
      .leftJoin(pitchFields, eq(bookings.fieldId, pitchFields.id))
      .leftJoin(schedules, eq(bookings.scheduleId, schedules.id))
      .orderBy(desc(bookings.createdAt)).limit(8),
    db.select({
      id: subscriptionRequests.id,
      ownerId: subscriptionRequests.ownerId,
      ownerName: users.name,
      planName: ownerPlans.name,
      planPrice: ownerPlans.price,
      durationDays: ownerPlans.durationDays,
      status: subscriptionRequests.status,
      createdAt: subscriptionRequests.createdAt,
      reviewedAt: subscriptionRequests.reviewedAt,
    }).from(subscriptionRequests)
      .leftJoin(users, eq(subscriptionRequests.ownerId, users.id))
      .leftJoin(ownerPlans, eq(subscriptionRequests.planId, ownerPlans.id))
      .orderBy(desc(subscriptionRequests.createdAt)).limit(16),
    db.select({ id: users.id, name: users.name, isSuspended: users.isSuspended })
      .from(users).where(eq(users.accountType, "owner")).orderBy(desc(users.createdAt)).limit(40),
  ]);

  const countValue = (rows: Array<{ value: unknown }>) => Number(rows[0]?.value ?? 0);
  const subscriptions = recentSubscriptions.map(item => {
    const expiry = item.status === "approved"
      ? estimatePlanExpiry(item.reviewedAt, item.durationDays)
      : null;
    return {
      id: item.id,
      ownerId: item.ownerId,
      ownerName: item.ownerName || "صاحب ملعب",
      planName: item.planName || "باقة غير متاحة",
      planPrice: item.planPrice === null ? null : String(item.planPrice),
      durationDays: item.durationDays,
      status: item.status,
      createdAt: toIso(item.createdAt),
      reviewedAt: toIso(item.reviewedAt),
      estimatedExpiryAt: expiry?.at ?? null,
      estimatedDaysRemaining: expiry?.daysRemaining ?? null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalUsers: countValue(totalUsers),
      players: countValue(playerUsers),
      owners: countValue(ownerUsers),
      suspendedOwners: countValue(suspendedOwners),
      totalPitches: countValue(totalPitches),
      publishedPitches: countValue(publishedPitches),
      pendingBookings: countValue(pendingBookings),
      openReports: countValue(openReports),
      pendingSubscriptions: countValue(pendingSubscriptions),
    },
    reports: recentReports.map(item => ({
      id: item.id,
      reporterId: item.reporterId,
      reporterName: item.reporterName || "مستخدم",
      targetType: item.targetType,
      targetId: item.targetId,
      reason: item.reason,
      details: (item.details || "").slice(0, 700),
      status: item.status,
      createdAt: toIso(item.createdAt),
    })),
    bookings: recentBookings.map(item => ({
      id: item.id,
      playerName: item.playerName || "لاعب",
      pitchName: item.pitchName || "ملعب",
      fieldName: item.fieldName || "ملعب فرعي",
      startsAt: toIso(item.startsAt),
      endsAt: toIso(item.endsAt),
      price: item.price === null ? null : String(item.price),
      paymentMethod: item.paymentMethod,
      paymentAmount: String(item.paymentAmount),
      status: item.status,
      createdAt: toIso(item.createdAt),
    })),
    subscriptions,
    owners: recentOwners.map(owner => ({
      id: owner.id,
      name: owner.name || "صاحب ملعب",
      isSuspended: owner.isSuspended,
    })),
  };
}

type ValidatedProposal =
  | {
      type: "reply_reports";
      reportIds: number[];
      message: string;
      reports: Array<{ id: number; status: string; reason: string; reporterName: string }>;
    }
  | {
      type: "owner_access";
      ownerId: number;
      suspended: boolean;
      ownerName: string;
      currentlySuspended: boolean;
    };

export function validateActionProposal(
  value: unknown,
  snapshot: Pick<AdminSnapshot, "reports" | "owners">
): ValidatedProposal | null {
  const parsed = proposedActionSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.type === "reply_reports") {
    const ids = [...new Set(parsed.data.reportIds)];
    if (ids.length !== parsed.data.reportIds.length) return null;
    const byId = new Map(snapshot.reports.map(report => [report.id, report]));
    const items = ids.map(id => byId.get(id));
    if (items.some(item => !item)) return null;
    return {
      type: "reply_reports",
      reportIds: ids,
      message: parsed.data.message,
      reports: items.map(item => ({
        id: item!.id,
        status: item!.status,
        reason: item!.reason,
        reporterName: item!.reporterName,
      })),
    };
  }

  if (parsed.data.type !== "owner_access") return null;
  const ownerAction = ownerAccessActionSchema.parse(parsed.data);
  const owner = snapshot.owners.find(item => item.id === ownerAction.ownerId);
  if (!owner || owner.isSuspended === ownerAction.suspended) return null;
  return {
    type: "owner_access",
    ownerId: owner.id,
    suspended: ownerAction.suspended,
    ownerName: owner.name,
    currentlySuspended: owner.isSuspended,
  };
}

const systemPrompt = (snapshot: AdminSnapshot) =>
  `أنت مساعد الإدارة الذكي لمنصة البرازيلي لكرة القدم. أجب بالعربية المصرية المنظمة والمباشرة، مع عناوين قصيرة وقوائم عند الحاجة. بيانات المنصة الحالية أدناه؛ لا تختلق حقائق أو أعداداً، وقل بوضوح إذا كانت المعلومة غير موجودة. تجنب عرض بيانات شخصية غير لازمة. طلبات الباقات المعتمدة لا تحتوي في قاعدة البيانات على تاريخ انتهاء صريح؛ estimatedExpiryAt تقدير محسوب من تاريخ اعتماد الطلب ومدته، لذلك صفه دائماً بأنه تقديري لا كموعد قطعي. تستطيع فقط اقتراح أحد الإجراءين المحددين في JSON: reply_reports لإرسال نص إلى مبلّغي البلاغات، أو owner_access لإيقاف/إعادة تفعيل وصول صاحب ملعب. لا تنفذ أي إجراء بنفسك: الاقتراح سيظهر للأدمن للمراجعة والتأكيد قبل التنفيذ. لا تقترح إجراءً إلا بطلب صريح ومحدد من الأدمن؛ إذا طلب مسودة فقط، اكتبها في الإجابة واجعل action=null. عند الرد على بلاغات، استخدم report IDs الموجودة حصراً في البيانات الحالية، واحتفظ بنص الرد الذي طلبه الأدمن حرفياً قدر الإمكان، ولا تغلق البلاغ عند إرسال الرد. عند إيقاف صاحب ملعب أو إعادة تفعيله، استخدم ID موجوداً في قائمة الملاك الحالية ولا تغير باقته أو سجلات الدفع. أعد JSON فقط بالشكل {"answer":"...","action":null أو كائن إجراء صالح}.\n\nبيانات المنصة الحية (وقت الجلب ${snapshot.generatedAt}):\n${JSON.stringify(snapshot)}`;

export const adminAssistantRouter = router({
  snapshot: adminOnlyProcedure.query(async () => getAdminSnapshot()),

  ask: adminOnlyProcedure
    .input(z.object({
      prompt: z.string().trim().min(1).max(1600),
      history: historySchema.default([]),
    }))
    .mutation(async ({ input }) => {
      const snapshot = await getAdminSnapshot();
      const messages = [
        { role: "system" as const, content: systemPrompt(snapshot) },
        ...input.history.slice(-8).map(message => ({ role: message.role, content: message.content })),
        { role: "user" as const, content: input.prompt },
      ];
      let raw: unknown;
      try {
        raw = await invokeJsonWithFallback(
          {
            model: "gpt-5-mini",
            reasoning: { effort: "minimal" },
            maxTokens: 1800,
            messages,
          },
          value => assistantOutputSchema.safeParse(value).success
        );
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "المساعد الذكي غير متاح الآن. احتفظ بسؤالك وحاول مرة أخرى بعد قليل.",
        });
      }
      const parsed = assistantOutputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: "تعذر قراءة إجابة منظمة من المساعد." });
      }
      const action = parsed.data.action
        ? validateActionProposal(parsed.data.action, snapshot)
        : null;
      return { answer: parsed.data.answer, action, context: snapshot };
    }),

  sendReportReply: adminOnlyProcedure
    .input(z.object({
      reportIds: z.array(z.number().int().positive()).min(1).max(8),
      message: z.string().trim().min(2).max(1000),
    }))
    .mutation(async ({ input }) => {
      const ids = [...new Set(input.reportIds)];
      if (ids.length !== input.reportIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "قائمة البلاغات تحتوي على تكرار." });
      }
      const db = await dbOrThrow();
      const rows = await db.select({ id: reports.id, reporterId: reports.reporterId })
        .from(reports).where(inArray(reports.id, ids));
      if (rows.length !== ids.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "أحد البلاغات لم يعد موجوداً." });
      }
      await db.insert(notifications).values(rows.map(row => ({
        userId: row.reporterId,
        title: "رد الإدارة على بلاغك",
        body: input.message,
        type: "report_response",
      })));
      return { success: true as const, notifiedReports: rows.length };
    }),

  setOwnerAccess: adminOnlyProcedure
    .input(z.object({ ownerId: z.number().int().positive(), suspended: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const owner = (await db.select({
        id: users.id,
        name: users.name,
        accountType: users.accountType,
        role: users.role,
        isSuspended: users.isSuspended,
      }).from(users).where(eq(users.id, input.ownerId)).limit(1))[0];
      if (!owner || (owner.accountType !== "owner" && owner.role !== "owner")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "صاحب الملعب غير موجود." });
      }
      if (owner.id === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تغيير صلاحية حسابك من هنا." });
      }
      if (owner.isSuspended === input.suspended) {
        return { success: true as const, changed: false as const, isSuspended: owner.isSuspended, ownerName: owner.name || "صاحب ملعب" };
      }
      await db.update(users).set({ isSuspended: input.suspended }).where(eq(users.id, owner.id));
      return { success: true as const, changed: true as const, isSuspended: input.suspended, ownerName: owner.name || "صاحب ملعب" };
    }),
});
