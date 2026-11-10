import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  adminAuditLogs,
  customerActivityLogs,
  adminChatMembers,
  adminChatMessages,
  adminChatRooms,
  pointAccounts,
  pointTransactions,
  pitches,
  rewardRedemptions,
  rewards,
  users,
} from "../drizzle/schema.pg";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { hashPassword, localOpenId, normalizeUserEmail } from "./authService";
import { ModeratorLinkError, prepareExistingAccountModeratorLink } from "./adminLink";
import { adminReferralsRouter } from "./referrals";

const dbOrThrow = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فيه مشكلة في الاتصال بقاعدة البيانات. جرّب تاني بعد شوية." });
  return db;
};
const superOnly = (role: string) => {
  if (role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية متاحة للمدير العام فقط." });
};
const adminRoles = ["admin", "super_admin", "moderator"] as const;
const adminRole = z.enum(["admin", "moderator"]);
const permission = z.enum(MODERATOR_PERMISSION_IDS);
const usedByUsers = alias(users, "voucher_used_by");
const adminOnly = (role: string) => {
  if (role !== "admin" && role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية متاحة لمدير النظام فقط." });
};

async function audit(actorId: number, action: string, targetType?: string, targetId?: number, details?: unknown) {
  const db = await dbOrThrow();
  await db.insert(adminAuditLogs).values({ actorId, action, targetType, targetId, details: details as any });
}

export const adminPortalRouter = router({
  session: adminProcedure.query(({ ctx }) => ({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, permissions: ctx.user.moderatorPermissions ?? [] },
  })),
  audit: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).nullish())
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows = await db.select({ log: adminAuditLogs, actor: users })
        .from(adminAuditLogs).leftJoin(users, eq(adminAuditLogs.actorId, users.id))
        .orderBy(desc(adminAuditLogs.createdAt)).limit(input?.limit ?? 200);
      return { items: rows.map(row => ({ ...row.log, actorName: row.actor?.name, actorEmail: row.actor?.email })) };
  }),
  customerActivity: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(250) }).nullish())
    .query(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await dbOrThrow();
      const rows = await db.select({ activity: customerActivityLogs, user: users })
        .from(customerActivityLogs)
        .leftJoin(users, eq(customerActivityLogs.userId, users.id))
        .orderBy(desc(customerActivityLogs.createdAt))
        .limit(input?.limit ?? 250);
      return { items: rows.map(row => ({
        ...row.activity,
        userName: row.user?.name,
        userEmail: row.user?.email,
        userRole: row.user?.role,
        accountType: row.user?.accountType,
        lastSeenAt: row.user?.lastSeenAt,
      })) };
    }),
  admins: router({
    list: adminProcedure.query(async ({ ctx }) => {
      superOnly(ctx.user.role);
      const db = await dbOrThrow();
      return { items: await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isSuspended: users.isSuspended, moderatorPermissions: users.moderatorPermissions, lastSignedIn: users.lastSignedIn, lastSeenAt: users.lastSeenAt, createdAt: users.createdAt }).from(users).where(inArray(users.role, [...adminRoles])).orderBy(desc(users.lastSignedIn)) };
    }),
    linkExisting: adminProcedure.input(z.object({ email: z.string().email().max(320), role: z.enum(["admin", "moderator"]).default("moderator"), permissions: z.array(permission).default([]) })).mutation(async ({ ctx, input }) => {
      superOnly(ctx.user.role);
      const db = await dbOrThrow();
      const email = normalizeUserEmail(input.email);
      const target = (await db.select({ id: users.id, email: users.email, role: users.role, accountType: users.accountType, isSuspended: users.isSuspended }).from(users).where(eq(users.email, email)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "لا يوجد حساب لاعب مسجل بهذا البريد." });
      let changes;
      try {
        changes = prepareExistingAccountModeratorLink(target, { email, role: input.role, permissions: input.permissions }, ctx.user.email);
      } catch (error) {
        if (error instanceof ModeratorLinkError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
      await db.update(users).set(changes).where(eq(users.id, target.id));
      await audit(ctx.user.id, "admin.linked_existing", "user", target.id, { email, role: changes.role, permissions: changes.moderatorPermissions });
      return { id: target.id };
    }),
    create: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(160), email: z.string().email().max(320), password: z.string().min(8).max(128), role: adminRole.default("moderator"), permissions: z.array(permission).default([]) })).mutation(async ({ ctx, input }) => {
      superOnly(ctx.user.role);
      const db = await dbOrThrow();
      const email = normalizeUserEmail(input.email);
      if (email === normalizeUserEmail(ctx.user.email || ""))
        throw new TRPCError({ code: "BAD_REQUEST", message: "اكتب بريد المشرف نفسه، وليس بريدك أنت." });
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (exists.length) throw new TRPCError({ code: "BAD_REQUEST", message: "هذا البريد مسجل بالفعل؛ استخدم «ربط حساب مسجل» بدلاً من إنشاء حساب جديد." });
      const password = await hashPassword(input.password);
      const result = await db.insert(users).values({ openId: localOpenId(), name: input.name, email, loginMethod: "email", role: input.role, accountType: "player", moderatorPermissions: input.permissions, passwordHash: password.hash, passwordSalt: password.salt, emailVerifiedAt: null }).returning({ id: users.id });
      const id = result[0].id;
      await audit(ctx.user.id, "admin.created", "user", id, { email, role: input.role, permissions: input.permissions });
      return { id };
    }),
    update: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: adminRole.optional(), permissions: z.array(permission).optional(), isSuspended: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      superOnly(ctx.user.role);
      const db = await dbOrThrow();
      const target = (await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المشرف غير موجود." });
      if (target.role === "super_admin" || target.email?.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تقييد المدير العام." });
      await db.update(users).set({ ...(input.role ? { role: input.role } : {}), ...(input.permissions ? { moderatorPermissions: input.permissions } : {}), ...(input.isSuspended === undefined ? {} : { isSuspended: input.isSuspended }) }).where(eq(users.id, input.userId));
      await audit(ctx.user.id, "admin.updated", "user", input.userId, input);
      return { success: true };
    }),
    remove: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      superOnly(ctx.user.role);
      const db = await dbOrThrow();
      const target = (await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "المشرف غير موجود." });
      if (target.role === "super_admin" || target.email?.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase()) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف المدير العام." });
      await db.update(users).set({ role: "player", accountType: "player", isSuspended: true, moderatorPermissions: [] }).where(eq(users.id, input.userId));
      await audit(ctx.user.id, "admin.removed", "user", input.userId, { email: target.email });
      return { success: true };
    }),
  }),
  rewards: router({
    list: adminProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "moderator" && !(ctx.user.moderatorPermissions || []).includes("rewards")) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج صلاحية المكافآت لإدارة الكتالوج." });
      const db = await dbOrThrow();
      return { items: await db.select().from(rewards).orderBy(desc(rewards.createdAt)) };
    }),
    points: adminProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "moderator" && !(ctx.user.moderatorPermissions || []).includes("rewards")) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج صلاحية المكافآت لعرض أرصدة اللاعبين." });
      const db = await dbOrThrow();
      const rows = await db.select({ account: pointAccounts, user: users }).from(pointAccounts).leftJoin(users, eq(pointAccounts.userId, users.id)).orderBy(desc(pointAccounts.balance), desc(pointAccounts.updatedAt)).limit(500);
      return { items: rows.map(row => ({ ...row.account, playerName: row.user?.name || "لاعب", playerEmail: row.user?.email || "—" })) };
    }),
    pitchTargets: adminProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "moderator" && !(ctx.user.moderatorPermissions || []).includes("rewards")) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج صلاحية المكافآت لاختيار ملعب الجائزة." });
      const db = await dbOrThrow();
      const rows = await db.select({ pitch: pitches, owner: users }).from(pitches).innerJoin(users, eq(pitches.ownerId, users.id)).where(eq(pitches.status, "published")).orderBy(pitches.name);
      return { items: rows.map(row => ({ id: row.pitch.id, name: row.pitch.name, address: row.pitch.address, city: row.pitch.city, ownerId: row.pitch.ownerId, ownerName: row.owner.name, ownerEmail: row.owner.email })) };
    }),
    create: adminProcedure.input(z.object({
      name: z.string().trim().min(2).max(180),
      description: z.string().trim().max(5000).optional(),
      imageUrl: z.string().trim().max(512).optional(),
      rewardType: z.enum(["free_booking", "product_delivery", "discount", "other"]),
      costPoints: z.number().int().positive().max(100000000),
      terms: z.string().trim().max(5000).optional(),
      expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
      authorizedType: z.enum(["admin", "pitch_owner", "rewards_staff"]),
      authorizedPitchId: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      if (input.authorizedType === "pitch_owner" && !input.authorizedPitchId) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد الملعب المصرح له باسترداد المكافأة." });
      const db = await dbOrThrow();
      const result = await db.insert(rewards).values({ ...input, description: input.description || null, imageUrl: input.imageUrl || null, terms: input.terms || null, expiresInDays: input.expiresInDays ?? null, authorizedPitchId: input.authorizedPitchId ?? null }).returning({ id: rewards.id });
      const id = result[0].id;
      await audit(ctx.user.id, "reward.created", "reward", id, { name: input.name, costPoints: input.costPoints });
      return { id };
    }),
    update: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2).max(180).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      imageUrl: z.string().trim().max(512).nullable().optional(),
      rewardType: z.enum(["free_booking", "product_delivery", "discount", "other"]).optional(),
      costPoints: z.number().int().positive().max(100000000).optional(),
      terms: z.string().trim().max(5000).nullable().optional(),
      expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
      authorizedType: z.enum(["admin", "pitch_owner", "rewards_staff"]).optional(),
      authorizedPitchId: z.number().int().positive().nullable().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await dbOrThrow();
      const current = (await db.select({ authorizedType: rewards.authorizedType, authorizedPitchId: rewards.authorizedPitchId }).from(rewards).where(eq(rewards.id, input.id)).limit(1))[0];
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "المكافأة غير موجودة." });
      const authType = input.authorizedType ?? current.authorizedType;
      const authPitchId = input.authorizedPitchId === undefined ? current.authorizedPitchId : input.authorizedPitchId;
      if (authType === "pitch_owner" && !authPitchId) throw new TRPCError({ code: "BAD_REQUEST", message: "حدد الملعب المصرح له باسترداد المكافأة." });
      const { id: _id, ...values } = input;
      await db.update(rewards).set(values).where(eq(rewards.id, input.id));
      await audit(ctx.user.id, "reward.updated", "reward", input.id, input);
      return { success: true };
    }),
    adjustPoints: adminProcedure.input(z.object({ userId: z.number().int().positive(), amount: z.number().int().min(-100000000).max(100000000).refine(value => value !== 0), note: z.string().trim().min(2).max(500) })).mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const target = (await tx.select({ id: users.id, accountType: users.accountType, role: users.role, isSuspended: users.isSuspended }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
        if (!target || !["player", "owner"].includes(String(target.accountType)) || !["player", "owner"].includes(String(target.role)) || target.isSuspended) throw new TRPCError({ code: "NOT_FOUND", message: "لم نعثر على لاعب أو صاحب ملعب نشط بهذا الرقم." });
        const account = (await tx.select().from(pointAccounts).where(eq(pointAccounts.userId, input.userId)).limit(1).for("update"))[0];
        const currentBalance = account?.balance ?? 0;
        const nextBalance = currentBalance + input.amount;
        if (nextBalance < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يصبح رصيد النقاط سالباً." });
        if (account) await tx.update(pointAccounts).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(pointAccounts.id, account.id));
        else await tx.insert(pointAccounts).values({ userId: input.userId, balance: nextBalance });
        await tx.insert(pointTransactions).values({ userId: input.userId, amount: input.amount, balanceAfter: nextBalance, kind: "adjustment", note: input.note });
        await tx.insert(adminAuditLogs).values({ actorId: ctx.user.id, action: "reward.points_adjusted", targetType: "user", targetId: input.userId, details: input as any });
        return { success: true, balance: nextBalance };
      });
    }),
  }),
  vouchers: router({
    list: adminProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "moderator" && !(ctx.user.moderatorPermissions || []).includes("rewards")) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج صلاحية المكافآت لمراجعة القسائم." });
      const db = await dbOrThrow();
      const rows = await db.select({ voucher: rewardRedemptions, reward: rewards, player: users, usedBy: usedByUsers })
        .from(rewardRedemptions).innerJoin(rewards, eq(rewardRedemptions.rewardId, rewards.id)).innerJoin(users, eq(rewardRedemptions.userId, users.id)).leftJoin(usedByUsers, eq(rewardRedemptions.usedBy, usedByUsers.id))
        .orderBy(desc(rewardRedemptions.issuedAt)).limit(500);
      return { items: rows.map(row => ({ ...row.voucher, rewardType: row.reward.rewardType, rewardDescription: row.reward.description, playerName: row.player.name, playerEmail: row.player.email, usedByName: row.usedBy?.name, usedByEmail: row.usedBy?.email })) };
    }),
    cancel: adminProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().min(2).max(500) })).mutation(async ({ ctx, input }) => {
      adminOnly(ctx.user.role);
      const db = await dbOrThrow();
      const result = await db.update(rewardRedemptions).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: input.reason, updatedAt: new Date() }).where(and(eq(rewardRedemptions.id, input.id), eq(rewardRedemptions.status, "valid")));
      if (!Number((result as any).affectedRows ?? 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "القسيمة غير صالحة للإلغاء أو سبق استخدامها." });
      await audit(ctx.user.id, "reward.voucher_cancelled", "reward_redemption", input.id, { reason: input.reason });
      return { success: true };
    }),
  }),

  chat: router({
    rooms: adminProcedure.query(async ({ ctx }) => {
      throw new TRPCError({ code: "FORBIDDEN", message: "تم إيقاف الشات الداخلي؛ استخدم صندوق دعم المستخدمين." });
      const db = await dbOrThrow();
      const rows = await db.select({ room: adminChatRooms, member: adminChatMembers }).from(adminChatRooms).innerJoin(adminChatMembers, eq(adminChatRooms.id, adminChatMembers.roomId)).where(eq(adminChatMembers.userId, ctx.user.id)).orderBy(desc(adminChatRooms.updatedAt));
      return { items: rows.map(row => row.room) };
    }),
    createRoom: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(180), memberIds: z.array(z.number().int().positive()).min(1).max(50), isGroup: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      throw new TRPCError({ code: "FORBIDDEN", message: "تم إيقاف الشات الداخلي؛ استخدم صندوق دعم المستخدمين." });
      const db = await dbOrThrow();
      const members = Array.from(new Set([ctx.user.id, ...input.memberIds]));
      const valid = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, members), inArray(users.role, [...adminRoles])));
      if (valid.length !== members.length) throw new TRPCError({ code: "BAD_REQUEST", message: "كل أعضاء الغرفة يجب أن يكونوا مشرفين." });
      const room = await db.insert(adminChatRooms).values({ name: input.name, isGroup: input.isGroup || members.length > 2, createdBy: ctx.user.id }).returning({ id: adminChatRooms.id });
      const roomId = room[0].id;
      await db.insert(adminChatMembers).values(members.map(userId => ({ roomId, userId })));
      await audit(ctx.user.id, "admin.chat_room_created", "admin_chat_room", roomId, { members });
      return { id: roomId };
    }),
    messages: adminProcedure.input(z.object({ roomId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      throw new TRPCError({ code: "FORBIDDEN", message: "تم إيقاف الشات الداخلي؛ استخدم صندوق دعم المستخدمين." });
      const db = await dbOrThrow();
      const member = await db.select({ id: adminChatMembers.id }).from(adminChatMembers).where(and(eq(adminChatMembers.roomId, input.roomId), eq(adminChatMembers.userId, ctx.user.id))).limit(1);
      if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "لست عضواً في هذه المحادثة." });
      const rows = await db.select({ message: adminChatMessages, sender: users }).from(adminChatMessages).leftJoin(users, eq(adminChatMessages.senderId, users.id)).where(eq(adminChatMessages.roomId, input.roomId)).orderBy(adminChatMessages.createdAt).limit(500);
      return { items: rows.map(row => ({ ...row.message, senderName: row.sender?.name, senderEmail: row.sender?.email })) };
    }),
    send: adminProcedure.input(z.object({ roomId: z.number().int().positive(), body: z.string().max(10000), messageType: z.enum(["text", "image", "file", "voice"]).default("text"), mediaUrl: z.string().max(512).optional(), mediaMimeType: z.string().max(96).optional(), durationSeconds: z.number().int().min(0).max(3600).optional() })).mutation(async ({ ctx, input }) => {
      throw new TRPCError({ code: "FORBIDDEN", message: "تم إيقاف الشات الداخلي؛ استخدم صندوق دعم المستخدمين." });
      const db = await dbOrThrow();
      const member = await db.select({ id: adminChatMembers.id }).from(adminChatMembers).where(and(eq(adminChatMembers.roomId, input.roomId), eq(adminChatMembers.userId, ctx.user.id))).limit(1);
      if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "لست عضواً في هذه المحادثة." });
      const result = await db.insert(adminChatMessages).values({ ...input, body: input.body.trim(), senderId: ctx.user.id }).returning({ id: adminChatMessages.id });
      await db.update(adminChatRooms).set({ updatedAt: new Date() }).where(eq(adminChatRooms.id, input.roomId));
      await audit(ctx.user.id, "admin.chat_message_sent", "admin_chat_room", input.roomId, { messageType: input.messageType });
      return { id: result[0].id };
    }),
  }),
  referrals: adminReferralsRouter,
});
import { MODERATOR_PERMISSION_IDS } from "@shared/adminPermissions";
