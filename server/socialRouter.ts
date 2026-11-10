import { and, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { blockedUsers, customerActivityLogs, friendRequests, notifications, users } from "../drizzle/schema.pg";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const dbOrThrow = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فيه مشكلة في الاتصال بقاعدة البيانات. جرّب تاني بعد شوية." });
  return db;
};
const isPlayer = (user: typeof users.$inferSelect) => user.accountType === "player" && user.role === "player";
const onlineSince = () => new Date(Date.now() - 2 * 60_000);
const positionAliases: Record<string, string> = { "حارس مرمى": "goalkeeper", "حارس": "goalkeeper", "مدافع": "defender", "لاعب وسط": "midfielder", "وسط": "midfielder", "مهاجم": "forward" };
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const publicPlayerFields = {
  id: users.id,
  name: users.name,
  age: users.age,
  position: users.position,
  skillLevel: users.skillLevel,
  bio: users.bio,
  avatarUrl: users.avatarUrl,
  lastSeenAt: users.lastSeenAt,
  region: users.region,
};

export const socialRouter = router({
  players: router({
    search: protectedProcedure
      .input(z.object({
        query: z.string().trim().max(80).optional(),
        position: z.enum(["goalkeeper", "defender", "midfielder", "forward"]).optional(),
        skillLevel: z.string().trim().max(32).optional(),
        limit: z.number().int().min(1).max(50).default(24),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (!isPlayer(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "دليل اللاعبين مخصص لحسابات اللاعبين." });
        const db = await dbOrThrow();
        const conditions = [
          eq(users.accountType, "player"),
          eq(users.role, "player"),
          eq(users.isSuspended, false),
          eq(users.isDiscoverable, true),
        ];
        conditions.push(ne(users.id, ctx.user.id));
        if (input?.position) conditions.push(eq(users.position, input.position));
        if (input?.skillLevel) conditions.push(eq(users.skillLevel, input.skillLevel));
        if (input?.query) {
          const query = input.query.trim();
          const positionQuery = positionAliases[query] || query;
          const searchCondition = or(
            like(users.name, `%${escapeLike(query)}%`),
            like(users.position, `%${escapeLike(positionQuery)}%`),
            like(users.skillLevel, `%${escapeLike(query)}%`),
            like(users.region, `%${escapeLike(query)}%`),
          );
          if (searchCondition) conditions.push(searchCondition);
        }
        const rows = await db.select(publicPlayerFields).from(users)
          .where(and(...conditions))
          .orderBy(desc(users.lastSeenAt), desc(users.id))
          .limit(input?.limit ?? 24);
        return { items: rows.map(player => ({
          ...player,
          isOnline: Boolean(player.lastSeenAt && player.lastSeenAt >= onlineSince()),
        })) };
      }),
    suggestions: protectedProcedure.query(async ({ ctx }) => {
      if (!isPlayer(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "اقتراحات اللاعبين متاحة للاعبين فقط." });
      const db = await dbOrThrow();
      const rows = await db.select(publicPlayerFields).from(users).where(and(
        eq(users.accountType, "player"), eq(users.role, "player"), eq(users.isSuspended, false),
        eq(users.isDiscoverable, true), ne(users.id, ctx.user.id),
      )).orderBy(
        sql`case when ${users.region} = ${ctx.user.region || ""} then 0 else 1 end`,
        sql`case when ${users.position} = ${ctx.user.position || ""} then 0 else 1 end`,
        sql`case when ${users.skillLevel} = ${ctx.user.skillLevel || ""} then 0 else 1 end`,
        desc(users.lastSeenAt), desc(users.id),
      ).limit(24);
      return { items: rows.map(player => ({
        ...player,
        isOnline: Boolean(player.lastSeenAt && player.lastSeenAt >= onlineSince()),
        matchScore: (player.region && player.region === ctx.user.region ? 40 : 0)
          + (player.position && player.position === ctx.user.position ? 30 : 0)
          + (player.skillLevel && player.skillLevel === ctx.user.skillLevel ? 20 : 0)
          + (player.lastSeenAt && player.lastSeenAt >= onlineSince() ? 10 : 0),
        matchReason: player.region && player.region === ctx.user.region
          ? player.position && player.position === ctx.user.position ? "في منطقتك ويلعب في مركزك" : "قريب منك"
          : player.position && player.position === ctx.user.position
            ? "يلعب في مركزك"
            : player.skillLevel && player.skillLevel === ctx.user.skillLevel ? "نفس مستوى اللعب" : "نشط مؤخراً",
      })) };
    }),
    profile: protectedProcedure
      .input(z.object({ playerId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const player = (await db.select({
          ...publicPlayerFields,
          isDiscoverable: users.isDiscoverable,
          accountType: users.accountType,
          role: users.role,
          isSuspended: users.isSuspended,
        }).from(users).where(eq(users.id, input.playerId)).limit(1))[0];
        if (!player || player.accountType !== "player" || player.role !== "player" || player.isSuspended)
          throw new TRPCError({ code: "NOT_FOUND", message: "لم نعثر على ملف لاعب متاح." });
        if (player.id !== ctx.user.id && !player.isDiscoverable)
          throw new TRPCError({ code: "NOT_FOUND", message: "هذا الملف غير متاح في دليل اللاعبين." });
        const { isDiscoverable: _isDiscoverable, accountType: _accountType, role: _role, isSuspended: _isSuspended, ...publicProfile } = player;
        return { ...publicProfile, isOnline: Boolean(player.lastSeenAt && player.lastSeenAt >= onlineSince()) };
      }),
  }),
  friends: router({
    status: protectedProcedure
      .input(z.object({ playerId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.id === input.playerId) return { state: "self" as const, requestId: null };
        const db = await dbOrThrow();
        const row = (await db.select().from(friendRequests).where(or(
          and(eq(friendRequests.requesterId, ctx.user.id), eq(friendRequests.recipientId, input.playerId)),
          and(eq(friendRequests.requesterId, input.playerId), eq(friendRequests.recipientId, ctx.user.id)),
        )).orderBy(desc(friendRequests.updatedAt)).limit(1))[0];
        if (!row) return { state: "none" as const, requestId: null };
        if (row.status === "accepted") return { state: "friends" as const, requestId: row.id };
        if (row.status === "pending") return {
          state: row.requesterId === ctx.user.id ? "outgoing" as const : "incoming" as const,
          requestId: row.id,
        };
        return { state: "none" as const, requestId: null };
      }),
    requests: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db.select().from(friendRequests).where(and(
        eq(friendRequests.status, "pending"),
        or(eq(friendRequests.requesterId, ctx.user.id), eq(friendRequests.recipientId, ctx.user.id)),
      )).orderBy(desc(friendRequests.createdAt)).limit(100);
      const items = await Promise.all(rows.map(async row => {
        const otherId = row.requesterId === ctx.user.id ? row.recipientId : row.requesterId;
        const other = (await db.select({ ...publicPlayerFields, isDiscoverable: users.isDiscoverable }).from(users).where(eq(users.id, otherId)).limit(1))[0];
        const player = !other ? null : other.isDiscoverable
          ? (({ isDiscoverable: _isDiscoverable, ...profile }) => profile)(other)
          : { id: other.id, name: other.name };
        return {
          id: row.id,
          direction: row.recipientId === ctx.user.id ? "incoming" as const : "outgoing" as const,
          createdAt: row.createdAt,
          player,
        };
      }));
      return { items: items.filter(item => item.player !== null) };
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db.select().from(friendRequests).where(and(
        eq(friendRequests.status, "accepted"),
        or(eq(friendRequests.requesterId, ctx.user.id), eq(friendRequests.recipientId, ctx.user.id)),
      )).orderBy(desc(friendRequests.updatedAt)).limit(200);
      const friends = await Promise.all(rows.map(async row => {
        const playerId = row.requesterId === ctx.user.id ? row.recipientId : row.requesterId;
        const player = (await db.select(publicPlayerFields).from(users).where(eq(users.id, playerId)).limit(1))[0];
        return player ? { ...player, isOnline: Boolean(player.lastSeenAt && player.lastSeenAt >= onlineSince()) } : null;
      }));
      return { items: friends.filter((player): player is NonNullable<typeof player> => player !== null) };
    }),
    request: protectedProcedure
      .input(z.object({ playerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!isPlayer(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "طلبات الصداقة متاحة للاعبين فقط." });
        if (ctx.user.id === input.playerId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك إرسال طلب إلى نفسك." });
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const target = (await tx.select({ id: users.id, isDiscoverable: users.isDiscoverable, role: users.role, isSuspended: users.isSuspended })
            .from(users).where(eq(users.id, input.playerId)).limit(1))[0];
          if (!target || target.role !== "player" || target.isSuspended || !target.isDiscoverable)
            throw new TRPCError({ code: "NOT_FOUND", message: "هذا اللاعب غير متاح لطلبات الصداقة." });
          const [outgoing, incoming] = await Promise.all([
            tx.select().from(friendRequests).where(and(eq(friendRequests.requesterId, ctx.user.id), eq(friendRequests.recipientId, input.playerId))).limit(1),
            tx.select().from(friendRequests).where(and(eq(friendRequests.requesterId, input.playerId), eq(friendRequests.recipientId, ctx.user.id))).limit(1),
          ]);
          if (outgoing[0]?.status === "accepted" || incoming[0]?.status === "accepted") return { state: "friends" as const };
          if (incoming[0]?.status === "pending") {
            await tx.update(friendRequests).set({ status: "accepted", acceptedAt: new Date() }).where(eq(friendRequests.id, incoming[0].id));
            await tx.insert(notifications).values({ userId: input.playerId, title: "تم قبول طلب الصداقة", body: `${ctx.user.name || "لاعب"} وافق على طلبك.`, type: "friend" });
            return { state: "friends" as const };
          }
          if (outgoing[0]?.status === "pending") return { state: "outgoing" as const };
          if (outgoing[0]) {
            await tx.update(friendRequests).set({ status: "pending", acceptedAt: null, updatedAt: new Date() }).where(eq(friendRequests.id, outgoing[0].id));
          } else {
            await tx.insert(friendRequests).values({ requesterId: ctx.user.id, recipientId: input.playerId, status: "pending" });
          }
          await tx.insert(notifications).values({ userId: input.playerId, title: "طلب صداقة جديد", body: `${ctx.user.name || "لاعب"} أرسل إليك طلب صداقة.`, type: "friend" });
          return { state: "outgoing" as const };
        });
      }),
    accept: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const request = (await tx.select().from(friendRequests).where(and(
            eq(friendRequests.id, input.requestId),
            eq(friendRequests.recipientId, ctx.user.id),
            eq(friendRequests.status, "pending"),
          )).limit(1).for("update"))[0];
          if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الصداقة غير موجود أو سبق التعامل معه." });
          await tx.update(friendRequests).set({ status: "accepted", acceptedAt: new Date() }).where(eq(friendRequests.id, request.id));
          await tx.insert(notifications).values({ userId: request.requesterId, title: "تم قبول طلب الصداقة", body: `${ctx.user.name || "لاعب"} وافق على طلبك.`, type: "friend" });
          return { success: true, playerId: request.requesterId };
        });
      }),
    decline: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        await db.update(friendRequests).set({ status: "declined" }).where(and(
          eq(friendRequests.id, input.requestId),
          eq(friendRequests.recipientId, ctx.user.id),
          eq(friendRequests.status, "pending"),
        ));
        return { success: true };
      }),
  }),
  blocks: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db.select({ id: blockedUsers.blockedId, name: users.name, avatarUrl: users.avatarUrl })
        .from(blockedUsers).innerJoin(users, eq(users.id, blockedUsers.blockedId))
        .where(eq(blockedUsers.blockerId, ctx.user.id)).orderBy(desc(blockedUsers.createdAt));
      return { items: rows };
    }),
    status: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const row = (await db.select({ id: blockedUsers.id }).from(blockedUsers).where(and(eq(blockedUsers.blockerId, ctx.user.id), eq(blockedUsers.blockedId, input.userId))).limit(1))[0];
      return { blocked: Boolean(row) };
    }),
    block: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك حظر نفسك." });
      const db = await dbOrThrow();
      await db.insert(blockedUsers).values({ blockerId: ctx.user.id, blockedId: input.userId }).onConflictDoNothing();
      return { success: true };
    }),
    unblock: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      await db.delete(blockedUsers).where(and(eq(blockedUsers.blockerId, ctx.user.id), eq(blockedUsers.blockedId, input.userId)));
      return { success: true };
    }),
  }),
  presence: router({
    heartbeat: protectedProcedure
      .input(z.object({ path: z.string().trim().max(255).optional(), action: z.string().trim().max(64).optional() }).nullish())
      .mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const current = ctx.user.lastSeenAt?.getTime() ?? 0;
      if (Date.now() - current > 30_000) {
        await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, ctx.user.id));
      }
      const latest = (await db.select({ action: customerActivityLogs.action, path: customerActivityLogs.path, createdAt: customerActivityLogs.createdAt })
        .from(customerActivityLogs)
        .where(eq(customerActivityLogs.userId, ctx.user.id))
        .orderBy(desc(customerActivityLogs.createdAt))
        .limit(1))[0];
      const path = input?.path || null;
      const action = input?.action || "active";
      if (!latest || latest.path !== path || Date.now() - latest.createdAt.getTime() > 5 * 60_000) {
        await db.insert(customerActivityLogs).values({ userId: ctx.user.id, action, path, details: { visibility: "visible" } });
      }
      return { success: true };
    }),
  }),
});
