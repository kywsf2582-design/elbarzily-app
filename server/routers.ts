import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  adminAuditLogs,
  bookings,
  blockedUsers,
  chatMembers,
  chatCallSignals,
  chatMessageHidden,
  chatMessageReads,
  chatMessageReactions,
  chatMessageReplyReferences,
  chatMessages,
  chatRooms,
  downloadDailyStats,
  friendRequests,
  matchParticipants,
  matchReports,
  matchReportPlayers,
  matchReportMedia,
  matchStatReviews,
  playerMatchStats,
  playerStatTotals,
  statAppeals,
  matches,
  notifications,
  ownerPlans,
  pointAccounts,
  pointTransactions,
  pitchCaptains,
  pitchFields,
  pitches,
  pitchSuggestions,
  platformSettings,
  qrLogs,
  reports,
  rewardRedemptions,
  rewards,
  schedules,
  subscriptionRequests,
  uploadedAssets,
  users,
  walletAccounts,
  walletTransactions,
} from "../drizzle/schema.pg";
import {
  consumeOtp,
  findUserByEmail,
  hashPassword,
  localOpenId,
  normalizeUserEmail,
  notifyAdminRegistration,
  notifyAdminPitchSubmission,
  requestOtp,
  sendWelcomeEmail,
  verifyPassword,
} from "./authService";
import { getDb } from "./db";
import { sendBookingConfirmationEmail, sendBookingStatusEmail } from "./email/booking-mail";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import {
  assertAdminAccess,
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { storageGetSignedUrl, storagePut } from "./storage";
import { invokeJsonWithFallback } from "./aiJson";
import { cairoDayBounds, normalizeCairoWallTime } from "./scheduleTime";
import { generateImage } from "./_core/imageGeneration";
import { matchesSupportedImageMime } from "./imageMime";
import { normalizeWhatsAppNumbers, whatsAppLink } from "./whatsappSupport";
import { adminAssistantRouter } from "./adminAssistant";
import { ownerAssistantRouter } from "./ownerAssistant";
import {
  isSmartReceiptVerificationEnabled,
  verifyBookingReceipt,
  verifySubscriptionReceipt,
} from "./receiptVerification";
import { socialRouter } from "./socialRouter";
import { looksLikeAndroidApk, MAX_APK_BYTES } from "./apkValidation";
import { matchesSupportedVoiceMime } from "./audioValidation";
import { cairoIsoDate, classifyDownloadAgent, shiftIsoDate } from "./downloadAnalytics";
import { adminPortalRouter } from "./adminPortal";
import { approveMatchStats, compareMatchReports, dbOrThrowSmart, getPlayerStatHistory, rebuildPlayerTotal, type ReportPlayerInput } from "./smartStats";
import {
  getVapidPublicKey,
  pushIsConfigured,
  readNotificationPreferences,
  removePushSubscription,
  savePushSubscription,
  sendPushToUsers,
  updateNotificationPreferences,
} from "./push";

const roleSchema = z.enum(["player", "owner", "moderator", "super_admin"]);
const emailSchema = z.string().email().max(320);
const DEFAULT_PITCH_IMAGES = Array.from({ length: 20 }, (_, index) => `/pitch-images/pitch-${String(index + 1).padStart(2, "0")}.webp`);
const DEFAULT_PLAN_IMAGES = Array.from({ length: 4 }, (_, index) => `/package-images/plan-${String(index + 1).padStart(2, "0")}.webp`);
const dbOrThrow = async () => {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database is not available",
    });
  return db;
};
const recordAdminAudit = async (actorId: number, action: string, targetType?: string, targetId?: number, details?: unknown) => {
  const db = await dbOrThrow();
  await db.insert(adminAuditLogs).values({ actorId, action, targetType, targetId, details: details as any });
};
const fail = (
  message: string,
  code:
    | "BAD_REQUEST"
    | "CONFLICT"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "INTERNAL_SERVER_ERROR"
    | "UNAUTHORIZED" = "BAD_REQUEST"
): never => {
  throw new TRPCError({ code, message });
};

type DbFailureInfo = { code?: string; constraint?: string; table?: string; column?: string; errno?: number };
function dbFailureInfo(error: unknown): DbFailureInfo {
  let current: unknown = error;
  let fallback: DbFailureInfo = {};
  const seen = new Set<object>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const details = current as Record<string, unknown>;
    const next = details.cause ?? details.originalError;
    fallback = {
      code: details.code == null ? fallback.code : String(details.code),
      constraint: details.constraint == null ? fallback.constraint : String(details.constraint),
      table: details.table == null ? fallback.table : String(details.table),
      column: details.column == null ? fallback.column : String(details.column),
      errno: typeof details.errno === "number" ? details.errno : fallback.errno,
    };
    if (!next) break;
    current = next;
  }
  return fallback;
}
function isUniqueDbConflict(error: unknown): boolean {
  const details = dbFailureInfo(error);
  return details.code === "23505" || details.code === "ER_DUP_ENTRY" || details.errno === 1062;
}

const DOWNLOAD_SETTINGS_KEY = "app_download_settings";
const DEFAULT_DOWNLOAD_APP_NAME = "البرازيلي - التطبيق الرسمي";
const VOUCHER_CIPHER_ALGORITHM = "aes-256-gcm";
const voucherCipherKey = () => {
  const secret = process.env.MANUS_JWT_SECRET;
  if (!secret) throw new Error("Voucher encryption secret is not configured");
  return createHash("sha256").update(secret).digest();
};
const hashVoucherValue = (value: string) => createHash("sha256").update(value).digest("hex");
function encryptVoucherValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(VOUCHER_CIPHER_ALGORITHM, voucherCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}
function decryptVoucherValue(payload: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid voucher payload");
  const decipher = createDecipheriv(VOUCHER_CIPHER_ALGORITHM, voucherCipherKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}
function voucherToken() { return randomBytes(32).toString("base64url"); }
function voucherBackupCode() { return `BRZ-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`; }
function normalizeVoucherCode(value: string) { return value.trim().toUpperCase().replace(/[\s-]/g, ""); }
type DownloadPageConfig = {
  mode: "upload" | "url" | null;
  url: string;
  fileKey?: string;
  fileName: string;
  appName: string;
  version: string;
  windowsUrl: string;
  windowsFileName: string;
  supportLink: string;
  supportNumbers: string[];
};

export async function readDownloadPageConfig(): Promise<DownloadPageConfig | null> {
  const db = await dbOrThrow();
  const row = (await db.select({ value: platformSettings.value }).from(platformSettings)
    .where(eq(platformSettings.key, DOWNLOAD_SETTINGS_KEY)).limit(1))[0];
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as Partial<DownloadPageConfig>;
    const mode = value.mode === "upload" || value.mode === "url" ? value.mode : null;
    let supportNumbers: string[] = [];
    try {
      supportNumbers = normalizeWhatsAppNumbers(Array.isArray(value.supportNumbers)
        ? value.supportNumbers.filter((number): number is string => typeof number === "string")
        : []);
    } catch {
      supportNumbers = [];
    }
    return {
      mode,
      url: typeof value.url === "string" ? value.url : "",
      fileKey: typeof value.fileKey === "string" ? value.fileKey : undefined,
      fileName: typeof value.fileName === "string" ? value.fileName : `${DEFAULT_DOWNLOAD_APP_NAME}.apk`,
      appName: typeof value.appName === "string" ? value.appName : DEFAULT_DOWNLOAD_APP_NAME,
      version: typeof value.version === "string" ? value.version : "1.0.0",
      windowsUrl: typeof value.windowsUrl === "string" ? value.windowsUrl : "",
      windowsFileName: typeof value.windowsFileName === "string" ? value.windowsFileName : "ElBarzily-Windows.exe",
      supportLink: typeof value.supportLink === "string" ? value.supportLink : "/support",
      supportNumbers,
    };
  } catch {
    return null;
  }
}

const isAdmin = (role: string) => role === "admin" || role === "super_admin";
const hasModeratorScope = (user: typeof users.$inferSelect, scope: string) =>
  isAdmin(user.role) ||
  (user.role === "moderator" &&
    Array.isArray(user.moderatorPermissions) &&
    user.moderatorPermissions.includes(scope));
const canOwn = (role: string) => isAdmin(role) || role === "owner";
const assertActiveOwnerSubscription = (user: typeof users.$inferSelect) => {
  if (user.role === "owner" && user.ownerSubscriptionExpiresAt && user.ownerSubscriptionExpiresAt.getTime() <= Date.now())
    fail("انتهت مدة اشتراك الكابتن. جدّد الاشتراك لفتح لوحة الملعب وإدارة المواعيد.", "FORBIDDEN");
};
const canVerifyRewards = (user: typeof users.$inferSelect) => isAdmin(user.role) || (user.role === "moderator" && Array.isArray(user.moderatorPermissions) && user.moderatorPermissions.some(scope => scope === "rewards" || scope === "receipts"));
async function canConfirmRewardVoucher(db: any, user: typeof users.$inferSelect, authorization: { authorizedType: string; authorizedPitchId: number | null }) {
  if (isAdmin(user.role)) return true;
  if (authorization.authorizedType === "rewards_staff" && canVerifyRewards(user)) return true;
  if (authorization.authorizedType === "pitch_owner" && user.role === "owner" && authorization.authorizedPitchId) {
    const owned = await db.select({ id: pitches.id }).from(pitches).where(and(eq(pitches.id, authorization.authorizedPitchId), eq(pitches.ownerId, user.id))).limit(1);
    return owned.length > 0;
  }
  return false;
}
const safeUser = (user: typeof users.$inferSelect | null | undefined) => {
  if (!user) return null;
  const {
    passwordHash: _passwordHash,
    passwordSalt: _passwordSalt,
    openId: _openId,
    ...publicFields
  } = user;
  return publicFields;
};
const normalizedDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("Invalid date");
  return date;
};

async function setSession(
  ctx: { req: any; res: any },
  user: typeof users.$inferSelect
) {
  const token = await sdk.createSessionToken(user.openId, {
    name: user.name ?? "",
    expiresInMs: ONE_YEAR_MS,
    sessionVersion: user.sessionVersion,
  });
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: ONE_YEAR_MS,
  });
}
const ADMIN_TRUSTED_DEVICE_COOKIE = "elbarzily_admin_trusted_device";
async function getPitchForOwner(userId: number, pitchId: number) {
  const db = await dbOrThrow();
  const rows = await db
    .select()
    .from(pitches)
    .where(and(eq(pitches.id, pitchId), eq(pitches.ownerId, userId)))
    .limit(1);
  return rows[0];
}
async function assertRoomMember(roomId: number, userId: number) {
  const db = await dbOrThrow();
  const rows = await db
    .select()
    .from(chatMembers)
    .where(and(eq(chatMembers.roomId, roomId), eq(chatMembers.userId, userId)))
    .limit(1);
  if (!rows[0]) fail("You are not a member of this chat room", "FORBIDDEN");
  return rows[0];
}

type ScheduleItemInput = {
  startsAt: string;
  endsAt: string;
  price: string | number;
  depositAmount?: string | number | null;
};
type ProjectDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function ensureSupportRoom(db: ProjectDb, user: typeof users.$inferSelect) {
  if (user.role === "admin" || user.role === "super_admin") return null;
  const existing = (await db.select({ roomId: chatRooms.id })
    .from(chatMembers)
    .innerJoin(chatRooms, eq(chatMembers.roomId, chatRooms.id))
    .where(and(eq(chatMembers.userId, user.id), eq(chatRooms.roomType, "support")))
    .limit(1))[0];
  const admins = await db.select({ id: users.id }).from(users).where(and(
    inArray(users.role, ["admin", "super_admin"]),
    eq(users.isSuspended, false),
  )).limit(10);
  const admin = admins.find(item => item.id !== user.id);
  if (existing) {
    if (admin) {
      const member = (await db.select({ id: chatMembers.id }).from(chatMembers).where(and(
        eq(chatMembers.roomId, existing.roomId), eq(chatMembers.userId, admin.id),
      )).limit(1))[0];
      if (!member) await db.insert(chatMembers).values({ roomId: existing.roomId, userId: admin.id, memberRole: "moderator" });
    }
    return existing.roomId;
  }
  const created = await db.insert(chatRooms).values({
    name: "إدارة البرازيلي والدعم",
    createdBy: user.id,
    isModerated: true,
    roomType: "support",
  }).returning({ id: chatRooms.id });
  const roomId = Number(created[0].id);
  await db.insert(chatMembers).values(admin ? [
    { roomId, userId: user.id, memberRole: "member" },
    { roomId, userId: admin.id, memberRole: "moderator" },
  ] : [{ roomId, userId: user.id, memberRole: "member" }]);
  return roomId;
}
async function publishScheduleItems(
  db: ProjectDb,
  pitchId: number,
  fieldId: number,
  items: ScheduleItemInput[]
) {
  return db.transaction(async tx => {
    const field = (
      await tx
        .select({ id: pitchFields.id })
        .from(pitchFields)
        .where(
          and(
            eq(pitchFields.id, fieldId),
            eq(pitchFields.pitchId, pitchId),
            eq(pitchFields.isActive, true)
          )
        )
        .limit(1)
        .for("update")
    )[0];
    if (!field) fail("الملعب الفرعي غير متاح", "NOT_FOUND");
    const usesSlotDeposit = items.some(item => item.depositAmount !== undefined && item.depositAmount !== null);
    if (usesSlotDeposit) {
      const paymentSettings = (await tx.select({ bookingPaymentMode: pitches.bookingPaymentMode, vodafoneCashNumber: pitches.vodafoneCashNumber })
        .from(pitches).where(eq(pitches.id, pitchId)).limit(1).for("update"))[0];
      if (!paymentSettings || paymentSettings.bookingPaymentMode !== "deposit" || !paymentSettings.vodafoneCashNumber)
        fail("فعّل الدفع بالعربون وأضف رقم Vodafone Cash قبل تحديد عربون خاص للموعد");
    }
    const existing = await tx
      .select({ startsAt: schedules.startsAt, endsAt: schedules.endsAt })
      .from(schedules)
      .where(
        and(
          eq(schedules.fieldId, fieldId),
          inArray(schedules.status, ["published", "blocked", "booked"])
        )
      )
      .for("update");
    const seen = [...existing];
    const values = items.map(item => {
      const startsAt = normalizedDate(item.startsAt);
      const endsAt = normalizedDate(item.endsAt);
      const price = Number(item.price);
      const depositAmount = item.depositAmount == null ? null : Number(item.depositAmount);
      if (depositAmount !== null && (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount > price))
        fail("مبلغ العربون يجب أن يكون أكبر من صفر ولا يتجاوز سعر الموعد");
      if (
        startsAt.getTime() <= Date.now() ||
        endsAt <= startsAt ||
        !Number.isFinite(price) ||
        price < 0
      )
        fail("تأكد أن الموعد مستقبلي ونهايته بعد بدايته والسعر صالح");
      if (seen.some(slot => startsAt < slot.endsAt && endsAt > slot.startsAt))
        fail("يوجد تداخل مع موعد منشور أو محجوب");
      seen.push({ startsAt, endsAt });
      return {
        pitchId,
        fieldId,
        startsAt,
        endsAt,
        price: String(item.price),
        depositAmount: depositAmount === null ? null : String(depositAmount),
        status: "published" as const,
      };
    });
    await tx.insert(schedules).values(values);
    return { count: values.length, items: values };
  });
}

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ ok: true })) }),
  social: socialRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => safeUser(ctx.user)),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(160),
        phone: z.string().trim().min(3).max(32),
        avatarKey: z.string().max(512).optional(),
        age: z.number().int().min(13).max(90).nullable().optional(),
        position: z.enum(["goalkeeper", "defender", "midfielder", "forward"]).nullable().optional(),
        skillLevel: z.string().trim().max(32).nullable().optional(),
        bio: z.string().trim().max(500).nullable().optional(),
        isDiscoverable: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        if (input.isDiscoverable === true && ctx.user.accountType !== "player")
          fail("عرض الملف في دليل اللاعبين متاح لحسابات اللاعبين فقط", "FORBIDDEN");
        const publicAge = input.age !== undefined ? input.age : ctx.user.age;
        const publicPosition = input.position !== undefined ? input.position : ctx.user.position;
        if (input.isDiscoverable === true && ctx.user.accountType === "player" && (!publicAge || !publicPosition))
          fail("أكمل العمر ومركز اللعب قبل إظهار ملفك في الدليل", "BAD_REQUEST");
        let avatarUrl = ctx.user.avatarUrl;
        if (input.avatarKey) {
          const asset = (await db.select({ key: uploadedAssets.key, mimeType: uploadedAssets.mimeType })
            .from(uploadedAssets).where(and(eq(uploadedAssets.key, input.avatarKey), eq(uploadedAssets.ownerId, ctx.user.id))).limit(1))[0];
          if (!asset || !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) fail("الصورة غير موجودة أو لا تخص هذا الحساب", "FORBIDDEN");
          avatarUrl = `/manus-storage/${asset.key}`;
        }
        await db.update(users).set({
          name: input.name,
          phone: input.phone,
          avatarUrl,
          ...(input.age !== undefined ? { age: input.age } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.skillLevel !== undefined ? { skillLevel: input.skillLevel?.trim() || null } : {}),
          ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
          ...(input.isDiscoverable !== undefined ? { isDiscoverable: input.isDiscoverable } : {}),
        }).where(eq(users.id, ctx.user.id));
        const updated = (await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1))[0];
        return safeUser(updated);
      }),
    requestOtp: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          name: z.string().trim().min(1).max(160).optional(),
          purpose: z.enum(["register", "password_reset"]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await requestOtp(input.email, input.purpose, input.name);
        } catch (error) {
          console.error("[auth.requestOtp] failed", error);
          const code = (error as any)?.code;
          const message = code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR"
            ? "خدمة التسجيل غير جاهزة الآن. حاول بعد قليل."
            : error instanceof Error ? error.message : "تعذر إرسال رمز التحقق";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message,
          });
        }
      }),
    register: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          password: z.string().min(8).max(128),
          name: z.string().min(1).max(160),
          otp: z.string().regex(/^\d{6}$/),
          accountType: z.enum(["player", "owner"]).default("player"),
          phone: z.string().max(32).optional(),
          region: z.string().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const email = normalizeUserEmail(input.email);
        if (
          input.accountType === "player" &&
          (!input.phone?.trim() || !input.region?.trim())
        )
          fail("رقم الهاتف والمنطقة مطلوبان لحساب اللاعب");
        let otpValid = false;
        try {
          otpValid = await consumeOtp(email, "register", input.otp);
        } catch (error) {
          console.error("[auth.register] OTP lookup failed", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر التحقق من رمز التسجيل الآن. حاول بعد قليل." });
        }
        if (!otpValid) fail("رمز التحقق غير صحيح أو انتهت صلاحيته");
        if (await findUserByEmail(email))
          fail("يوجد حساب مسجل بهذا البريد بالفعل");
        const password = await hashPassword(input.password);
        const db = await dbOrThrow();
        try {
          await db.insert(users).values({
            openId: localOpenId(),
            email,
            name: input.name.trim(),
            loginMethod: "email",
            role: "player",
            accountType: input.accountType,
            phone: input.phone?.trim() || null,
            region: input.region?.trim() || null,
            passwordHash: password.hash,
            passwordSalt: password.salt,
            emailVerifiedAt: new Date(),
          });
        } catch (error) {
          if ((error as any)?.code === "ER_DUP_ENTRY")
            fail("يوجد حساب مسجل بهذا البريد بالفعل", "BAD_REQUEST");
          console.error("[auth.register] user insert failed", error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء الحساب الآن. حاول بعد قليل." });
        }
        const created = await findUserByEmail(email);
        if (!created)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "تعذر إنشاء الحساب",
          });
        await setSession(ctx as any, created);
        void sendWelcomeEmail({ name: created.name, email: created.email, createdAt: created.createdAt });
        await notifyAdminRegistration({
          name: created.name ?? input.name,
          email,
          role: input.accountType,
        });
        return { user: safeUser(created), accountType: input.accountType };
      }),
    login: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          password: z.string().min(1),
          adminLogin: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let user = await findUserByEmail(input.email);
        if (input.adminLogin && !user) fail("هذا البريد غير مسجل في قاعدة هذا الموقع. أنشئ حسابًا به أولاً ثم ادخل لوحة الإدارة.", "UNAUTHORIZED");
        if (!user) fail("البريد أو كلمة المرور غير صحيحة", "UNAUTHORIZED");
        if (
          !user!.passwordHash ||
          !user!.passwordSalt ||
          !(await verifyPassword(
            input.password,
            user!.passwordHash,
            user!.passwordSalt
          ))
        )
          fail("البريد أو كلمة المرور غير صحيحة", "UNAUTHORIZED");
        if (input.adminLogin && !["admin", "super_admin", "moderator"].includes(user!.role)) {
          const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
          const matchesBootstrapEmail = Boolean(bootstrapEmail && user!.email?.trim().toLowerCase() === bootstrapEmail);
          if (matchesBootstrapEmail && user!.emailVerifiedAt) {
            const db = await dbOrThrow();
            await db.transaction(async tx => {
              const [existingAdmin, claimed] = await Promise.all([
                tx.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super_admin"])).limit(1).for("update"),
                tx.select({ id: platformSettings.id }).from(platformSettings).where(eq(platformSettings.key, "bootstrap_super_admin_claimed")).limit(1),
              ]);
              if (!existingAdmin.length && !claimed.length) {
                await tx.insert(platformSettings).values({ key: "bootstrap_super_admin_claimed", value: String(user!.id), updatedBy: user!.id });
                await tx.update(users).set({ role: "super_admin" }).where(eq(users.id, user!.id));
              }
            });
            user = await findUserByEmail(input.email);
          }
          if (!user || !["admin", "super_admin", "moderator"].includes(user.role)) fail("هذا البريد غير مسجل في الإدارة. استخدم البريد المحدد كمدير أول أو أنشئ الحساب بالبريد الإداري.", "FORBIDDEN");
        }
        const adminAccount = ["admin", "super_admin", "moderator"].includes(user!.role);
        if (user!.isSuspended) fail("هذا الحساب موقوف", "FORBIDDEN");
        const db = await dbOrThrow();
        await db
          .update(users)
          .set({ lastSignedIn: new Date(), ...(adminAccount ? { emailVerifiedAt: new Date() } : {}) })
          .where(eq(users.id, user!.id));
        await setSession(ctx as any, user!);
        return { user: safeUser(user) };
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: emailSchema }))
      .mutation(async ({ input }) => {
        const user = await findUserByEmail(input.email);
        if (!user) return { accepted: true } as const;
        try {
          return await requestOtp(input.email, "password_reset");
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "تعذر إرسال رمز إعادة التعيين",
          });
        }
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          otp: z.string().regex(/^\d{6}$/),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input }) => {
        if (!(await consumeOtp(input.email, "password_reset", input.otp)))
          fail("رمز التحقق غير صحيح أو انتهت صلاحيته");
        const user = await findUserByEmail(input.email);
        if (!user) fail("الحساب غير موجود", "NOT_FOUND");
        const password = await hashPassword(input.password);
        const db = await dbOrThrow();
        await db
          .update(users)
          .set({
            passwordHash: password.hash,
            passwordSalt: password.salt,
            sessionVersion: sql`${users.sessionVersion} + 1`,
          })
          .where(eq(users.id, user!.id));
        return { success: true } as const;
      }),
    canClaimAdmin: protectedProcedure.query(async ({ ctx }) => {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (
        !adminEmail ||
        !ctx.user.emailVerifiedAt ||
        ctx.user.email?.trim().toLowerCase() !== adminEmail
      )
        return { allowed: false } as const;
      const db = await dbOrThrow();
      const [existing, claim] = await Promise.all([
        db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.role, ["admin", "super_admin"]))
          .limit(1),
        db
          .select({ id: platformSettings.id })
          .from(platformSettings)
          .where(eq(platformSettings.key, "bootstrap_super_admin_claimed"))
          .limit(1),
      ]);
      return { allowed: existing.length === 0 && claim.length === 0 } as const;
    }),
    claimAdmin: protectedProcedure.mutation(async ({ ctx }) => {
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (
        !adminEmail ||
        !ctx.user.emailVerifiedAt ||
        ctx.user.email?.trim().toLowerCase() !== adminEmail
      )
        fail("هذا الحساب غير مخول لتهيئة مدير المنصة", "FORBIDDEN");
      const db = await dbOrThrow();
      try {
        await db.transaction(async tx => {
          const existing = await tx
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.role, ["admin", "super_admin"]))
            .limit(1)
            .for("update");
          if (existing.length) fail("تم إغلاق تهيئة المدير الأول", "FORBIDDEN");
          await tx.insert(platformSettings).values({
            key: "bootstrap_super_admin_claimed",
            value: String(ctx.user.id),
            updatedBy: ctx.user.id,
          });
          await tx
            .update(users)
            .set({ role: "super_admin" })
            .where(eq(users.id, ctx.user.id));
        });
      } catch (error) {
        if (
          (error as any)?.code === "ER_DUP_ENTRY" ||
          String((error as any)?.message ?? "").includes(
            "bootstrap_super_admin_claimed"
          )
        )
          fail("تم إغلاق تهيئة المدير الأول", "FORBIDDEN");
        throw error;
      }
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.openId.startsWith("local_")) {
        const db = await dbOrThrow();
        await db
          .update(users)
          .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
          .where(eq(users.id, ctx.user.id));
      }
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      ctx.res.clearCookie(ADMIN_TRUSTED_DEVICE_COOKIE, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),

  pitches: router({
    list: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      const items = await db
        .select({
          id: pitches.id,
          name: pitches.name,
          description: pitches.description,
          address: pitches.address,
          city: pitches.city,
          imageUrl: pitches.imageUrl,
          mapUrl: pitches.mapUrl,
          captainName: pitches.captainName,
          captainPhone: pitches.captainPhone,
          vodafoneCashNumber: pitches.vodafoneCashNumber,
          bookingPaymentMode: pitches.bookingPaymentMode,
          depositAmount: pitches.depositAmount,
          subPitchCount: pitches.subPitchCount,
          morningPrice: pitches.morningPrice,
          eveningPrice: pitches.eveningPrice,
          status: pitches.status,
        })
        .from(pitches)
        .where(eq(pitches.status, "published"))
        .orderBy(desc(pitches.createdAt));
      return { items };
    }),
    captains: publicProcedure
      .input(z.object({ pitchId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await dbOrThrow();
        const pitch = (
          await db
            .select({ id: pitches.id })
            .from(pitches)
            .where(
              and(
                eq(pitches.id, input.pitchId),
                eq(pitches.status, "published")
              )
            )
            .limit(1)
        )[0];
        if (!pitch) return { items: [] };
        return {
          items: await db
            .select({
              id: pitchCaptains.id,
              name: pitchCaptains.name,
              phone: pitchCaptains.phone,
            })
            .from(pitchCaptains)
            .where(
              and(
                eq(pitchCaptains.pitchId, input.pitchId),
                eq(pitchCaptains.isActive, true)
              )
            )
            .orderBy(pitchCaptains.id),
        };
      }),
    fields: publicProcedure
      .input(z.object({ pitchId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await dbOrThrow();
        const pitch = (
          await db
            .select({ id: pitches.id })
            .from(pitches)
            .where(
              and(
                eq(pitches.id, input.pitchId),
                eq(pitches.status, "published")
              )
            )
            .limit(1)
        )[0];
        if (!pitch) return { items: [] };
        return {
          items: await db
            .select()
            .from(pitchFields)
            .where(
              and(
                eq(pitchFields.pitchId, input.pitchId),
                eq(pitchFields.isActive, true)
              )
            )
            .orderBy(pitchFields.id),
        };
      }),
    availableSlots: publicProcedure
      .input(
        z.object({ pitchId: z.number().int().positive(), date: z.string() })
      )
      .query(async ({ input }) => {
        const db = await dbOrThrow();
        const pitch = (
          await db
            .select({ id: pitches.id })
            .from(pitches)
            .where(
              and(
                eq(pitches.id, input.pitchId),
                eq(pitches.status, "published")
              )
            )
            .limit(1)
        )[0];
        if (!pitch) return { items: [] };
        const dayBounds = cairoDayBounds(input.date);
        if (!dayBounds) return { items: [] };
        const { start, end } = dayBounds;
        const booked = await db
          .select({ scheduleId: bookings.scheduleId })
          .from(bookings)
          .where(inArray(bookings.status, ["pending", "approved"]));
        const excluded = booked.map(row => row.scheduleId);
        const conditions = [
          eq(schedules.pitchId, input.pitchId),
          eq(schedules.status, "published"),
          gte(schedules.startsAt, start),
          lt(schedules.startsAt, end),
          gte(schedules.startsAt, new Date()),
        ];
        if (excluded.length)
          conditions.push(notInArray(schedules.id, excluded));
        const items = await db
          .select()
          .from(schedules)
          .innerJoin(pitchFields, eq(schedules.fieldId, pitchFields.id))
          .where(and(...conditions, eq(pitchFields.isActive, true)))
          .orderBy(schedules.startsAt);
        return { items: items.map(row => row.schedules) };
      }),
    ownerSave: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          name: z.string().min(2).max(180),
          description: z.string().max(5000).optional(),
          address: z.string().min(2).max(320),
          city: z.string().min(2).max(120),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          imageUrl: z.string().max(512).optional(),
          amenities: z.unknown().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOwn(ctx.user.role))
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const db = await dbOrThrow();
        const { id, ...pitchInput } = input;
        const values = {
          ...pitchInput,
          latitude:
            pitchInput.latitude === undefined
              ? undefined
              : String(pitchInput.latitude),
          longitude:
            pitchInput.longitude === undefined
              ? undefined
              : String(pitchInput.longitude),
        };
        if (id) {
          const existing = await getPitchForOwner(ctx.user.id, id);
          if (!existing) fail("Pitch not found", "NOT_FOUND");
          await db
            .update(pitches)
            .set({
              ...values,
              status:
                existing.status === "published" ||
                existing.status === "rejected"
                  ? "pending"
                  : existing.status,
            })
            .where(eq(pitches.id, id));
          return { id };
        }
        const result = await db
          .insert(pitches)
          .values({ ownerId: ctx.user.id, ...values, status: "draft" })
          .returning({ id: pitches.id });
        return { id: Number(result[0].id) };
      }),
  }),

  schedules: router({
    publish: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          items: z
            .array(
              z.object({
                startsAt: z.string(),
                endsAt: z.string(),
                price: z.union([z.string(), z.number()]),
                depositAmount: z.union([z.string(), z.number()]).nullable().optional(),
              })
            )
            .min(1)
            .max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOwn(ctx.user.role))
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const pitch = await getPitchForOwner(ctx.user.id, input.pitchId);
        if (!pitch) fail("Pitch not found", "NOT_FOUND");
        const db = await dbOrThrow();
        const result = await publishScheduleItems(
          db,
          input.pitchId,
          input.fieldId,
          input.items
        );
        return { success: true, count: result.count };
      }),
    generate: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          date: z.string(),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(1).max(24),
          slotMinutes: z.number().int().min(30).max(180),
          price: z.union([z.string(), z.number()]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOwn(ctx.user.role))
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const pitch = await getPitchForOwner(ctx.user.id, input.pitchId);
        if (!pitch) fail("Pitch not found", "NOT_FOUND");
        const db = await dbOrThrow();
        const field = (
          await db
            .select({ id: pitchFields.id })
            .from(pitchFields)
            .where(
              and(
                eq(pitchFields.id, input.fieldId),
                eq(pitchFields.pitchId, input.pitchId),
                eq(pitchFields.isActive, true)
              )
            )
            .limit(1)
        )[0];
        if (!field) fail("الملعب الفرعي غير متاح", "NOT_FOUND");
        const scheduleSchema = z.object({
          slots: z
            .array(
              z.object({
                startsAt: z.string(),
                endsAt: z.string(),
                price: z.union([z.string(), z.number()]),
              })
            )
            .max(500),
        });
        const parsed = await invokeJsonWithFallback(
          {
            model: "gpt-5-mini",
            reasoning: { effort: "minimal" },
            messages: [
              {
                role: "system",
                content:
                  "حوّل تفاصيل الطلب إلى جدول مواعيد كرة قدم. أعد JSON فقط بالشكل {\"slots\":[{\"startsAt\":\"ISO date time\",\"endsAt\":\"ISO date time\",\"price\":500}]}. كل الأوقات بتوقيت القاهرة Africa/Cairo، واستخدم تاريخ البداية المحدد.",
              },
              { role: "user", content: JSON.stringify(input) },
            ],
            maxTokens: 2000,
          },
          value => scheduleSchema.safeParse(value).success
        );
        const candidate = scheduleSchema.safeParse(parsed);
        if (!candidate.success) fail("لم يُنشئ الذكاء الاصطناعي جدولاً صالحاً.");
        const slotData = candidate.data!;
        const valid = slotData.slots
          .map(slot => ({
            ...slot,
            startsAt: normalizeCairoWallTime(slot.startsAt),
            endsAt: normalizeCairoWallTime(slot.endsAt),
          }))
          .filter(slot => {
            const startsAt = new Date(slot.startsAt),
              endsAt = new Date(slot.endsAt);
            return (
              !Number.isNaN(startsAt.getTime()) &&
              !Number.isNaN(endsAt.getTime()) &&
              endsAt > startsAt &&
              slot.startsAt.startsWith(input.date) &&
              Number.isFinite(Number(slot.price)) &&
              Number(slot.price) > 0
            );
          });
        if (!valid.length) fail("لم يُنشئ الذكاء الاصطناعي مواعيد صالحة للتاريخ المحدد.");
        return { items: valid };
      }),
  }),

  appointments: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return {
        items: await db
          .select()
          .from(appointments)
          .where(eq(appointments.userId, ctx.user.id))
          .orderBy(appointments.startsAt),
      };
    }),
    create: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive().optional(),
          title: z.string().min(2).max(180),
          startsAt: z.string(),
          endsAt: z.string(),
          notes: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const startsAt = normalizedDate(input.startsAt);
        const endsAt = normalizedDate(input.endsAt);
        if (startsAt.getTime() <= Date.now() || endsAt <= startsAt)
          fail("اختر وقتاً مستقبلياً ونهاية بعد البداية");
        return db.transaction(async tx => {
          if (input.pitchId) {
            const pitch = (
              await tx
                .select({ id: pitches.id })
                .from(pitches)
                .where(
                  and(
                    eq(pitches.id, input.pitchId),
                    eq(pitches.status, "published")
                  )
                )
                .limit(1)
            )[0];
            if (!pitch) fail("Pitch not found", "NOT_FOUND");
          }
          await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, ctx.user.id))
            .limit(1)
            .for("update");
          const overlapping = await tx
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                eq(appointments.userId, ctx.user.id),
                eq(appointments.status, "scheduled"),
                lt(appointments.startsAt, endsAt),
                gt(appointments.endsAt, startsAt)
              )
            )
            .limit(1)
            .for("update");
          if (overlapping.length) fail("يتداخل الموعد مع موعد آخر لديك");
          const result = await tx
            .insert(appointments)
            .values({ ...input, userId: ctx.user.id, startsAt, endsAt })
            .returning({ id: appointments.id });
          return { id: Number(result[0].id) };
        });
      }),
    cancel: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        await db
          .update(appointments)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(appointments.id, input.id),
              eq(appointments.userId, ctx.user.id)
            )
          );
        return { success: true } as const;
      }),
  }),

  bookings: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db
        .select({ booking: bookings, schedule: schedules, pitch: pitches })
        .from(bookings)
        .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
        .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
        .where(eq(bookings.playerId, ctx.user.id))
        .orderBy(desc(bookings.createdAt));
      return {
        items: rows.map(row => ({
          ...row.booking,
          startsAt: row.schedule.startsAt,
          endsAt: row.schedule.endsAt,
          price: row.schedule.price,
          pitchName: row.pitch.name,
        })),
      };
    }),
    create: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          scheduleId: z.number().int().positive(),
          paymentMethod: z.enum(["arrival", "deposit", "full"]),
          receiptUrl: z.string().min(1).max(512).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player" && ctx.user.role !== "player")
          fail("حساب اللاعب مطلوب للحجز", "FORBIDDEN");
        const db = await dbOrThrow();
        const created = await db.transaction(async tx => {
          const pitch = (
            await tx
              .select()
              .from(pitches)
              .where(
                and(
                  eq(pitches.id, input.pitchId),
                  eq(pitches.status, "published")
                )
              )
              .limit(1)
              .for("update")
          )[0];
          if (!pitch) fail("الملعب غير منشور أو غير متاح", "NOT_FOUND");
          const field = (
            await tx
              .select({ id: pitchFields.id })
              .from(pitchFields)
              .where(
                and(
                  eq(pitchFields.id, input.fieldId),
                  eq(pitchFields.pitchId, input.pitchId),
                  eq(pitchFields.isActive, true)
                )
              )
              .limit(1)
          )[0];
          if (!field) fail("الملعب الفرعي غير متاح", "NOT_FOUND");
          const slot = (
            await tx
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.id, input.scheduleId),
                  eq(schedules.pitchId, input.pitchId),
                  eq(schedules.fieldId, input.fieldId),
                  eq(schedules.status, "published")
                )
              )
              .limit(1)
              .for("update")
          )[0];
          if (!slot || slot.startsAt.getTime() <= Date.now())
            fail("الموعد غير متاح", "NOT_FOUND");
          const price = Number(slot.price);
          const deposit = Number(slot.depositAmount ?? pitch.depositAmount);
          if (!Number.isFinite(price) || price < 0) fail("سعر الموعد غير صالح");
          if (pitch.bookingPaymentMode === "arrival") {
            if (input.paymentMethod !== "arrival" || input.receiptUrl)
              fail("هذا الملعب يقبل الدفع عند الوصول فقط، دون إيصال");
          } else {
            if (!pitch.vodafoneCashNumber || deposit <= 0)
              fail("إعدادات العربون غير مكتملة");
            if (input.paymentMethod === "arrival")
              fail("اختر العربون أو الدفع الكامل");
            if (input.paymentMethod === "deposit" && deposit > price)
              fail("العربون لا يتجاوز سعر الموعد");
            if (
              !input.receiptUrl?.startsWith(
                `/manus-storage/uploads/${ctx.user.id}/`
              )
            )
              fail("ارفع إيصال التحويل من حسابك أولاً");
            const receiptUrl = input.receiptUrl!;
            if (!receiptUrl) fail("إيصال التحويل مطلوب");
            const receiptKey = receiptUrl.slice("/manus-storage/".length);
            const receipt = (
              await tx
                .select({ key: uploadedAssets.key })
                .from(uploadedAssets)
                .where(
                  and(
                    eq(uploadedAssets.ownerId, ctx.user.id),
                    eq(uploadedAssets.key, receiptKey)
                  )
                )
                .limit(1)
            )[0];
            if (!receipt) fail("لم نعثر على إيصال مرفوع من حسابك");
          }
          const captainName = pitch.captainName ?? null;
          const captainPhone = pitch.captainPhone ?? null;
          const occupied = await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.scheduleId, input.scheduleId),
                inArray(bookings.status, ["pending", "approved"])
              )
            )
            .limit(1)
            .for("update");
          if (occupied.length) fail("تم حجز هذا الموعد بالفعل");
          const paymentAmount =
            input.paymentMethod === "arrival"
              ? "0"
              : String(input.paymentMethod === "deposit" ? deposit : price);
          const result = await tx.insert(bookings).values({
            playerId: ctx.user.id,
            pitchId: input.pitchId,
            fieldId: input.fieldId,
            scheduleId: input.scheduleId,
            receiptUrl: input.receiptUrl ?? null,
            paymentMethod: input.paymentMethod,
            paymentAmount,
            captainName,
            captainPhone,
            status: "pending",
          }).returning({ id: bookings.id });
          const bookingId = result[0].id;
          const bookingRoom = await tx.insert(chatRooms).values({
            name: `حجز #${bookingId} · ${pitch.name}`.slice(0, 180),
            createdBy: ctx.user.id,
            roomType: "booking",
            bookingId,
          }).returning({ id: chatRooms.id });
          const bookingRoomId = bookingRoom[0].id;
          await tx.insert(chatMembers).values([
            { roomId: bookingRoomId, userId: ctx.user.id, memberRole: "member" },
            { roomId: bookingRoomId, userId: pitch.ownerId, memberRole: "owner" },
          ]);
          const admins = await tx
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.role, ["admin", "super_admin"]));
          const notificationsToInsert = [
            {
              userId: pitch.ownerId,
              title: "حجز جديد",
              body: `لديك حجز جديد للموعد بقيمة ${paymentAmount}`,
              type: "booking",
              url: `/book?booking=${bookingId}`,
              dedupeKey: `booking:${bookingId}:${pitch.ownerId}`,
            },
            ...admins.map(admin => ({
              userId: admin.id,
              title: "حجز جديد للمتابعة",
              body: `تم إنشاء حجز جديد للملعب ${pitch.name}`,
              type: "booking",
              url: `/book?booking=${bookingId}`,
              dedupeKey: `booking:${bookingId}:${admin.id}`,
            })),
          ];
          if (notificationsToInsert.length)
            await tx.insert(notifications).values(notificationsToInsert);
          return { bookingId, recipientIds: notificationsToInsert.map(item => item.userId) };
        });
        const receiptDecision = input.receiptUrl
          ? await verifyBookingReceipt(created.bookingId)
          : "manual" as const;
        void sendBookingConfirmationEmail(created.bookingId);
        void sendPushToUsers(created.recipientIds, {
          category: "bookings",
          title: "حجز جديد",
          body: "تم إنشاء حجز جديد ويحتاج إلى متابعة.",
          url: `/book?booking=${created.bookingId}`,
          tag: `booking-${created.bookingId}`,
        });
        return {
          id: created.bookingId,
          status: receiptDecision === "manual" ? "pending" : receiptDecision,
        } as const;
      }),
    cancel: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player" && ctx.user.role !== "player")
          fail("حساب اللاعب مطلوب لإلغاء الحجز", "FORBIDDEN");
        const db = await dbOrThrow();
        const cancelledId = await db.transaction(async tx => {
          const row = (
            await tx
              .select({ booking: bookings, schedule: schedules })
              .from(bookings)
              .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
              .where(and(eq(bookings.id, input.id), eq(bookings.playerId, ctx.user.id)))
              .limit(1)
              .for("update")
          )[0];
          if (!row) fail("الحجز غير موجود", "NOT_FOUND");
          if (!(row.booking.status === "pending" || row.booking.status === "approved"))
            fail("لا يمكن إلغاء هذا الحجز في حالته الحالية");
          if (row.schedule.startsAt.getTime() <= Date.now())
            fail("لا يمكن إلغاء موعد بدأ بالفعل");
          const updated = await tx
            .update(bookings)
            .set({ status: "cancelled" })
            .where(and(
              eq(bookings.id, input.id),
              eq(bookings.playerId, ctx.user.id),
              inArray(bookings.status, ["pending", "approved"]),
            ))
            .returning({ id: bookings.id });
          if (!updated.length) fail("تعذر إلغاء الحجز");
          return row.booking.id;
        });
        void sendBookingStatusEmail(cancelledId, "ألغيت من حساب اللاعب");
        return { success: true, id: cancelledId, status: "cancelled" as const };
      }),
    review: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "owner")
          fail("Owner permission required", "FORBIDDEN");
        const db = await dbOrThrow();
        const result = await db.transaction(async tx => {
          const row = (
            await tx
              .select({ booking: bookings, pitch: pitches })
              .from(bookings)
              .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
              .where(eq(bookings.id, input.id))
              .limit(1)
              .for("update")
          )[0];
          if (!row) fail("Booking not found", "NOT_FOUND");
          if (row.pitch.ownerId !== ctx.user.id)
            fail("لا تملك هذا الملعب", "FORBIDDEN");
          if (row.booking.status !== "pending")
            fail("تمت مراجعة هذا الحجز بالفعل");
          const qrToken =
            input.status === "approved"
              ? randomBytes(32).toString("hex")
              : null;
          const updated = await tx
            .update(bookings)
            .set({
              status: input.status,
              qrToken,
              reviewNote: input.note,
              reviewedBy: ctx.user.id,
              reviewedAt: new Date(),
            })
            .where(
              and(eq(bookings.id, input.id), eq(bookings.status, "pending"))
            )
            .returning({ id: bookings.id });
          if (!updated.length)
            fail("تمت مراجعة هذا الحجز بالفعل");
          await tx.insert(notifications).values({
            userId: row.booking.playerId,
            title: "تحديث الحجز",
            body:
              input.status === "approved"
                ? "تم قبول حجزك وإصدار رمز QR"
                : `تم رفض حجزك${input.note ? `: ${input.note}` : ""}`,
            type: "booking",
            url: `/book?booking=${input.id}`,
            dedupeKey: `booking-review:${input.id}:${input.status}`,
          });
          return { approved: input.status === "approved", playerId: row.booking.playerId };
        });
        void sendBookingStatusEmail(input.id, input.note);
        void sendPushToUsers([result.playerId], {
          category: "bookings",
          title: "تحديث الحجز",
          body: result.approved ? "تم قبول حجزك وإصدار رمز QR" : `تم رفض حجزك${input.note ? `: ${input.note}` : ""}`,
          url: `/book?booking=${input.id}`,
          tag: `booking-review-${input.id}`,
        });
        return { success: true, status: input.status } as const;
      }),
    verifyQr: protectedProcedure
      .input(
        z.object({
          bookingId: z.number().int().positive(),
          token: z.string().min(8).max(512),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const row = (
            await tx
              .select({ booking: bookings, pitch: pitches })
              .from(bookings)
              .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
              .where(eq(bookings.id, input.bookingId))
              .limit(1)
              .for("update")
          )[0];
          if (!row) fail("Booking not found", "NOT_FOUND");
          if (
            !(
              row.pitch.ownerId === ctx.user.id ||
              hasModeratorScope(ctx.user, "receipts")
            )
          )
            fail("Not allowed to verify this booking", "FORBIDDEN");
          const qrToken = row.booking.qrToken;
          if (row.booking.status !== "approved" || !qrToken)
            fail("Booking is not approved");
          const expected = Buffer.from(String(qrToken ?? ""), "utf8");
          const supplied = Buffer.from(input.token, "utf8");
          if (
            expected.length !== supplied.length ||
            !timingSafeEqual(expected, supplied)
          )
            fail("رمز الحجز غير صالح", "FORBIDDEN");
          const hash = createHash("sha256").update(input.token).digest("hex");
          const used = await tx
            .select({ id: qrLogs.id })
            .from(qrLogs)
            .where(
              and(
                eq(qrLogs.bookingId, input.bookingId),
                eq(qrLogs.tokenHash, hash),
                eq(qrLogs.action, "validated")
              )
            )
            .limit(1)
            .for("update");
          if (used.length) fail("تم استخدام رمز هذا الحجز من قبل", "FORBIDDEN");
          await tx.insert(qrLogs).values({
            userId: ctx.user.id,
            bookingId: input.bookingId,
            action: "validated",
            tokenHash: hash,
          });
          const [player, schedule, field] = await Promise.all([
            tx.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, region: users.region }).from(users).where(eq(users.id, row.booking.playerId)).limit(1),
            tx.select().from(schedules).where(eq(schedules.id, row.booking.scheduleId)).limit(1),
            tx.select({ id: pitchFields.id, name: pitchFields.name }).from(pitchFields).where(eq(pitchFields.id, row.booking.fieldId)).limit(1),
          ]);
          const { qrToken: _privateToken, ...booking } = row.booking;
          return {
            valid: true,
            booking,
            player: player[0] ?? null,
            pitch: { id: row.pitch.id, name: row.pitch.name, address: row.pitch.address, city: row.pitch.city },
            field: field[0] ?? null,
            schedule: schedule[0] ?? null,
          } as const;
        });
      }),
  }),

  matches: router({
    list: publicProcedure
      .input(
        z.object({ pitchId: z.number().int().positive().optional() }).optional()
      )
      .query(async ({ input }) => {
        const db = await dbOrThrow();
        const conditions = [
          inArray(matches.status, ["open", "full"]),
          gte(matches.startsAt, new Date()),
          eq(pitches.status, "published"),
        ];
        if (input?.pitchId) conditions.push(eq(matches.pitchId, input.pitchId));
        const rows = await db
          .select({ match: matches, pitch: pitches })
          .from(matches)
          .innerJoin(pitches, eq(matches.pitchId, pitches.id))
          .where(and(...conditions))
          .orderBy(matches.startsAt);
        const items = await Promise.all(
          rows.map(async row => {
            const participants = await db
              .select({ value: sql<number>`count(*)` })
              .from(matchParticipants)
              .where(
                and(
                  eq(matchParticipants.matchId, row.match.id),
                  eq(matchParticipants.status, "joined")
                )
              );
            return {
              ...row.match,
              pitchName: row.pitch.name,
              joinedCount: Number(participants[0]?.value ?? 0),
            };
          })
        );
        return { items };
      }),
    create: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          scheduleId: z.number().int().positive().optional(),
          title: z.string().min(2).max(180),
          startsAt: z.string(),
          maxPlayers: z.number().int().min(2).max(50),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player")
          fail("حساب اللاعب مطلوب لإنشاء مباراة", "FORBIDDEN");
        const db = await dbOrThrow();
        const startsAt = normalizedDate(input.startsAt);
        if (startsAt.getTime() <= Date.now()) fail("اختر موعداً مستقبلياً");
        return db.transaction(async tx => {
          const pitch = (
            await tx
              .select({ id: pitches.id })
              .from(pitches)
              .where(
                and(
                  eq(pitches.id, input.pitchId),
                  eq(pitches.status, "published")
                )
              )
              .limit(1)
              .for("update")
          )[0];
          if (!pitch) fail("يجب اختيار ملعب مسجل ومعتمد في المنصة");
          const field = (
            await tx
              .select({ id: pitchFields.id })
              .from(pitchFields)
              .where(
                and(
                  eq(pitchFields.id, input.fieldId),
                  eq(pitchFields.pitchId, input.pitchId),
                  eq(pitchFields.isActive, true)
                )
              )
              .limit(1)
          )[0];
          if (!field) fail("الملعب الفرعي غير متاح");
          if (input.scheduleId) {
            const schedule = (
              await tx
                .select()
                .from(schedules)
                .where(
                  and(
                    eq(schedules.id, input.scheduleId),
                    eq(schedules.pitchId, input.pitchId),
                    eq(schedules.fieldId, input.fieldId),
                    eq(schedules.status, "published")
                  )
                )
                .limit(1)
                .for("update")
            )[0];
            if (!schedule || schedule.startsAt.getTime() !== startsAt.getTime())
              fail("اختر وقت الموعد المنشور نفسه");
          }
          const result = await tx.insert(matches).values({
            ...input,
            creatorId: ctx.user.id,
            startsAt,
            status: "open",
          }).returning({ id: matches.id });
          const matchId = Number(result[0].id);
          await tx
            .insert(matchParticipants)
            .values({ matchId, userId: ctx.user.id, status: "joined" });
          const room = await tx
            .insert(chatRooms)
            .values({ name: input.title, matchId, createdBy: ctx.user.id, roomType: "match" })
            .returning({ id: chatRooms.id });
          await tx.insert(chatMembers).values({
            roomId: Number(room[0].id),
            userId: ctx.user.id,
            memberRole: "owner",
          });
          if (input.scheduleId)
            await tx
              .update(schedules)
              .set({ status: "booked" })
              .where(
                and(
                  eq(schedules.id, input.scheduleId),
                  eq(schedules.status, "published")
                )
              );
          return { id: matchId };
        });
      }),
    complete: protectedProcedure
      .input(z.object({ matchId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const match = (await db.select().from(matches).where(eq(matches.id, input.matchId)).limit(1))[0];
        if (!match) fail("المباراة غير موجودة", "NOT_FOUND");
        if (match.creatorId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") fail("قائد المباراة أو الإدارة فقط يمكنه إنهاء المباراة", "FORBIDDEN");
        if (match.startsAt.getTime() > Date.now()) fail("لا يمكن إنهاء مباراة قبل موعدها");
        await db.update(matches).set({ status: "completed", updatedAt: new Date() }).where(and(eq(matches.id, input.matchId), inArray(matches.status, ["open", "full", "started"])));
        return { success: true } as const;
      }),
    join: protectedProcedure
      .input(z.object({ matchId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player")
          fail("حساب اللاعب مطلوب للانضمام", "FORBIDDEN");
        const db = await dbOrThrow();
        return db.transaction(async tx => {
          const match = (
            await tx
              .select()
              .from(matches)
              .where(eq(matches.id, input.matchId))
              .limit(1)
              .for("update")
          )[0];
          if (
            !match ||
            match.status !== "open" ||
            match.startsAt.getTime() <= Date.now()
          )
            fail("المباراة غير متاحة", "NOT_FOUND");
          const existing = (
            await tx
              .select()
              .from(matchParticipants)
              .where(
                and(
                  eq(matchParticipants.matchId, input.matchId),
                  eq(matchParticipants.userId, ctx.user.id)
                )
              )
              .limit(1)
          )[0];
          if (existing?.status === "joined")
            return { success: true, joinedCount: undefined } as const;
          const count = await tx
            .select({ value: sql<number>`count(*)` })
            .from(matchParticipants)
            .where(
              and(
                eq(matchParticipants.matchId, input.matchId),
                eq(matchParticipants.status, "joined")
              )
            );
          const joinedCount = Number(count[0]?.value ?? 0);
          if (joinedCount >= match.maxPlayers) {
            await tx
              .update(matches)
              .set({ status: "full" })
              .where(eq(matches.id, input.matchId));
            fail("اكتمل عدد اللاعبين");
          }
          if (existing)
            await tx
              .update(matchParticipants)
              .set({ status: "joined" })
              .where(eq(matchParticipants.id, existing.id));
          else
            await tx.insert(matchParticipants).values({
              matchId: input.matchId,
              userId: ctx.user.id,
              status: "joined",
            });
          const room = (
            await tx
              .select()
              .from(chatRooms)
              .where(eq(chatRooms.matchId, input.matchId))
              .limit(1)
          )[0];
          if (room) {
            const membership = await tx
              .select({ id: chatMembers.id })
              .from(chatMembers)
              .where(
                and(
                  eq(chatMembers.roomId, room.id),
                  eq(chatMembers.userId, ctx.user.id)
                )
              )
              .limit(1);
            if (!membership.length)
              await tx.insert(chatMembers).values({
                roomId: room.id,
                userId: ctx.user.id,
                memberRole: "member",
              });
          }
          const newCount = joinedCount + 1;
          if (newCount >= match.maxPlayers)
            await tx
              .update(matches)
              .set({ status: "full" })
              .where(eq(matches.id, input.matchId));
          return { success: true, joinedCount } as const;
        });
      }),
  }),

  smartStats: router({
    profile: publicProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await dbOrThrowSmart();
        const player = (await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, position: users.position, accountType: users.accountType }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
        if (!player) fail("اللاعب غير موجود", "NOT_FOUND");
        const totals = (await db.select().from(playerStatTotals).where(eq(playerStatTotals.userId, input.userId)).limit(1))[0] || { matches: 0, goals: 0, assists: 0, wins: 0, manOfMatch: 0, averageRating: "0", rankingScore: "0" };
        const rank = await db.select({ value: sql<number>`1 + COUNT(*)` }).from(playerStatTotals).where(gt(playerStatTotals.rankingScore, totals.rankingScore));
        const history = await getPlayerStatHistory(input.userId);
        const matchIds = history.map(item => item.matchId);
        const matchRows = matchIds.length ? await db.select({ id: matches.id, title: matches.title, startsAt: matches.startsAt, pitchName: pitches.name }).from(matches).innerJoin(pitches, eq(matches.pitchId, pitches.id)).where(inArray(matches.id, matchIds)) : [];
        const matchById = new Map(matchRows.map(row => [row.id, row]));
        return { player, totals, rank: Number(rank[0]?.value ?? 1), history: history.map(item => ({ ...item, match: matchById.get(item.matchId) || null })), achievements: [Number(totals.manOfMatch) > 0 ? "أفضل لاعب" : null, Number(totals.wins) >= 5 ? "سلسلة انتصارات" : null, Number(totals.goals) >= 10 ? "هداف" : null].filter(Boolean) };
      }),
    leaderboard: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        const db = await dbOrThrowSmart();
        return { items: await db.select({ totals: playerStatTotals, player: { id: users.id, name: users.name, avatarUrl: users.avatarUrl, position: users.position } }).from(playerStatTotals).innerJoin(users, eq(users.id, playerStatTotals.userId)).orderBy(desc(playerStatTotals.rankingScore)).limit(input?.limit ?? 50) };
      }),
    myMatches: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrowSmart();
      return { items: await db.select({ match: matches, participant: matchParticipants, pitchName: pitches.name }).from(matchParticipants).innerJoin(matches, eq(matches.id, matchParticipants.matchId)).innerJoin(pitches, eq(pitches.id, matches.pitchId)).where(and(eq(matchParticipants.userId, ctx.user.id), inArray(matchParticipants.status, ["joined", "left"]))).orderBy(desc(matches.startsAt)).limit(30) };
    }),
    reportsForMatch: protectedProcedure
      .input(z.object({ matchId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await dbOrThrowSmart();
        const participant = (await db.select({ id: matchParticipants.id }).from(matchParticipants).where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.userId, ctx.user.id), eq(matchParticipants.status, "joined"))).limit(1))[0];
        if (!participant && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") fail("انضم إلى المباراة أولاً", "FORBIDDEN");
        const reports = await db.select().from(matchReports).where(eq(matchReports.matchId, input.matchId)).orderBy(asc(matchReports.submittedAt));
        const reportIds = reports.map(report => report.id);
        const players = reportIds.length ? await db.select().from(matchReportPlayers).where(inArray(matchReportPlayers.reportId, reportIds)) : [];
        const media = reportIds.length ? await db.select().from(matchReportMedia).where(inArray(matchReportMedia.reportId, reportIds)) : [];
        const participants = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, position: users.position }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.status, "joined")));
        const review = (await db.select().from(matchStatReviews).where(eq(matchStatReviews.matchId, input.matchId)).limit(1))[0] || null;
        return { reports, players, media, participants, review };
      }),
    submitReport: protectedProcedure
      .input(z.object({
        matchId: z.number().int().positive(), teamKey: z.string().trim().min(1).max(32), homeScore: z.number().int().min(0).max(99), awayScore: z.number().int().min(0).max(99),
        players: z.array(z.object({ playerId: z.number().int().positive(), goals: z.number().int().min(0).max(99), assists: z.number().int().min(0).max(99), rating: z.number().min(0).max(10), manOfMatch: z.boolean() })).max(50),
        media: z.array(z.object({ url: z.string().startsWith("/manus-storage/").max(512), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]) })).max(4).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrowSmart();
        const match = (await db.select().from(matches).where(eq(matches.id, input.matchId)).limit(1))[0];
        if (!match) fail("المباراة غير موجودة", "NOT_FOUND");
        if (match.status !== "completed" && match.startsAt.getTime() > Date.now()) fail("لا يمكن تسجيل التقرير قبل انتهاء المباراة");
        const existingReports = await db.select({ reporterId: matchReports.reporterId }).from(matchReports).where(eq(matchReports.matchId, input.matchId)).orderBy(asc(matchReports.submittedAt));
        if (!existingReports.length && ctx.user.id !== match.creatorId && ctx.user.role !== "admin" && ctx.user.role !== "super_admin") fail("قائد المباراة فقط يمكنه تسجيل التقرير الأول", "FORBIDDEN");
        if (existingReports.length >= 2 && !existingReports.some(report => report.reporterId === ctx.user.id)) fail("اكتمل تقريرا المباراة", "FORBIDDEN");
        const membership = (await db.select({ id: matchParticipants.id }).from(matchParticipants).where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.userId, ctx.user.id), eq(matchParticipants.status, "joined"))).limit(1))[0];
        if (!membership) fail("يجب أن تكون من لاعبي المباراة لتسجيل التقرير", "FORBIDDEN");
        const validPlayers = await db.select({ id: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.status, "joined"), inArray(matchParticipants.userId, input.players.map(player => player.playerId))));
        if (validPlayers.length !== new Set(input.players.map(player => player.playerId)).size) fail("كل اللاعبين المذكورين يجب أن يكونوا ضمن المباراة");
        const result = await db.transaction(async tx => {
          const inserted = await tx.insert(matchReports).values({ matchId: input.matchId, reporterId: ctx.user.id, teamKey: input.teamKey, homeScore: input.homeScore, awayScore: input.awayScore, status: "submitted", submittedAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().returning({ id: matchReports.id });
          const reportId = Number(inserted[0]?.id) || Number((await tx.select({ id: matchReports.id }).from(matchReports).where(and(eq(matchReports.matchId, input.matchId), eq(matchReports.reporterId, ctx.user.id))).limit(1))[0]?.id);
          await tx.delete(matchReportPlayers).where(eq(matchReportPlayers.reportId, reportId));
          if (input.players.length) await tx.insert(matchReportPlayers).values(input.players.map(player => ({ reportId, ...player, rating: String(player.rating.toFixed(1)), updatedAt: new Date() })));
          await tx.delete(matchReportMedia).where(eq(matchReportMedia.reportId, reportId));
          if (input.media?.length) await tx.insert(matchReportMedia).values(input.media.map(item => ({ reportId, ...item })));
          return reportId;
        });
        const comparison = await compareMatchReports(input.matchId);
        return { reportId: result, comparison } as const;
      }),
    appeal: protectedProcedure
      .input(z.object({ matchId: z.number().int().positive(), reason: z.string().trim().min(5).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrowSmart();
        await db.insert(statAppeals).values({ matchId: input.matchId, appellantId: ctx.user.id, reason: input.reason, status: "open" });
        await db.update(matchStatReviews).set({ status: "appealed", updatedAt: new Date() }).where(eq(matchStatReviews.matchId, input.matchId));
        return { success: true } as const;
      }),
    adminQueue: adminProcedure.query(async () => {
      const db = await dbOrThrowSmart();
      return { reviews: await db.select({ review: matchStatReviews, match: matches }).from(matchStatReviews).innerJoin(matches, eq(matches.id, matchStatReviews.matchId)).orderBy(desc(matchStatReviews.updatedAt)), appeals: await db.select().from(statAppeals).where(inArray(statAppeals.status, ["open", "reviewing"])).orderBy(desc(statAppeals.createdAt)) };
    }),
    adminApprove: adminProcedure
      .input(z.object({ reviewId: z.number().int().positive(), players: z.array(z.object({ playerId: z.number().int().positive(), goals: z.number().int().min(0).max(99), assists: z.number().int().min(0).max(99), rating: z.number().min(0).max(10), manOfMatch: z.boolean() })).max(50), wonByPlayerId: z.array(z.number().int().positive()).max(50) }))
      .mutation(async ({ ctx, input }) => { await approveMatchStats(input.reviewId, ctx.user.id, input.players, input.wonByPlayerId); await recordAdminAudit(ctx.user.id, "smart_stats.approved", "match_stat_review", input.reviewId, { players: input.players, wonByPlayerId: input.wonByPlayerId }); return { success: true } as const; }),
    adminAutoApprove: adminProcedure
      .input(z.object({ reviewId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrowSmart();
        const review = (await db.select().from(matchStatReviews).where(eq(matchStatReviews.id, input.reviewId)).limit(1))[0];
        if (!review || review.status !== "pending" || review.differences) fail("لا يمكن الاعتماد التلقائي؛ توجد اختلافات للمراجعة");
        const source = review.firstReportId ? await db.select().from(matchReportPlayers).where(eq(matchReportPlayers.reportId, review.firstReportId)) : [];
        await approveMatchStats(input.reviewId, ctx.user.id, source.map(row => ({ playerId: row.playerId, goals: row.goals, assists: row.assists, rating: Number(row.rating), manOfMatch: row.manOfMatch })), []);
        await recordAdminAudit(ctx.user.id, "smart_stats.auto_approved", "match_stat_review", input.reviewId, { sourceReportId: review.firstReportId });
        return { success: true } as const;
      }),
    adminReject: adminProcedure
      .input(z.object({ reviewId: z.number().int().positive(), reason: z.string().trim().min(3).max(2000) }))
      .mutation(async ({ ctx, input }) => { const db = await dbOrThrowSmart(); const review = (await db.select().from(matchStatReviews).where(eq(matchStatReviews.id, input.reviewId)).limit(1))[0]; if (!review) fail("المراجعة غير موجودة", "NOT_FOUND"); await db.update(matchStatReviews).set({ status: "rejected", resolvedBy: ctx.user.id, resolvedAt: new Date(), differences: { rejectionReason: input.reason }, updatedAt: new Date() }).where(eq(matchStatReviews.id, input.reviewId)); await db.update(matchReports).set({ status: "rejected" }).where(inArray(matchReports.id, [review.firstReportId!, review.secondReportId!].filter(Boolean))); await recordAdminAudit(ctx.user.id, "smart_stats.rejected", "match_stat_review", input.reviewId, { reason: input.reason }); return { success: true } as const; }),
  }),

  chat: router({
    rooms: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin")
        await ensureSupportRoom(db, ctx.user);
      const memberships = await db
        .select({ room: chatRooms, member: chatMembers })
        .from(chatMembers)
        .innerJoin(chatRooms, eq(chatMembers.roomId, chatRooms.id))
        .where(eq(chatMembers.userId, ctx.user.id))
        .orderBy(desc(chatRooms.updatedAt))
        .limit(50);
      const roomIds = memberships.map(({ room }) => room.id);
      if (!roomIds.length) return { items: [] };
      const latestIds = await db.select({ roomId: chatMessages.roomId, id: sql<number>`max(${chatMessages.id})` })
        .from(chatMessages)
        .leftJoin(chatMessageHidden, and(eq(chatMessageHidden.messageId, chatMessages.id), eq(chatMessageHidden.userId, ctx.user.id)))
        .where(and(inArray(chatMessages.roomId, roomIds), isNull(chatMessages.deletedAt), isNull(chatMessageHidden.id)))
        .groupBy(chatMessages.roomId);
      const lastRows = latestIds.length ? await db.select({ id: chatMessages.id, roomId: chatMessages.roomId, body: chatMessages.body, messageType: chatMessages.messageType, createdAt: chatMessages.createdAt, senderName: users.name })
        .from(chatMessages).innerJoin(users, eq(users.id, chatMessages.senderId)).where(inArray(chatMessages.id, latestIds.map(row => row.id))) : [];
      const lastByRoom = new Map(lastRows.map(row => [row.roomId, row]));
      const unreadRows = await db.select({ roomId: chatMessages.roomId, value: sql<number>`count(distinct ${chatMessages.id})` })
        .from(chatMessages)
        .innerJoin(chatMembers, and(eq(chatMembers.roomId, chatMessages.roomId), eq(chatMembers.userId, ctx.user.id)))
        .leftJoin(chatMessageHidden, and(eq(chatMessageHidden.messageId, chatMessages.id), eq(chatMessageHidden.userId, ctx.user.id)))
        .where(and(inArray(chatMessages.roomId, roomIds), ne(chatMessages.senderId, ctx.user.id), isNull(chatMessages.deletedAt), isNull(chatMessageHidden.id), or(isNull(chatMembers.lastReadAt), gt(chatMessages.createdAt, chatMembers.lastReadAt))))
        .groupBy(chatMessages.roomId);
      const unreadByRoom = new Map(unreadRows.map(row => [row.roomId, Number(row.value)]));
      const participantRows = await db.select({ roomId: chatMembers.roomId, id: users.id, name: users.name, email: users.email, phone: users.phone, avatarUrl: users.avatarUrl, lastSeenAt: users.lastSeenAt, accountType: users.accountType, role: users.role })
        .from(chatMembers).innerJoin(users, eq(chatMembers.userId, users.id))
        .where(and(inArray(chatMembers.roomId, roomIds), ne(chatMembers.userId, ctx.user.id)));
      const participantsByRoom = new Map<number, typeof participantRows>();
      for (const participant of participantRows) participantsByRoom.set(participant.roomId, [...(participantsByRoom.get(participant.roomId) ?? []), participant]);
      const isAdminViewer = ctx.user.role === "admin" || ctx.user.role === "super_admin" || ctx.user.role === "moderator";
      const items = memberships.map(({ room }) => {
        const last = lastByRoom.get(room.id);
        const participants = participantsByRoom.get(room.id) ?? [];
        const supportContact = room.roomType === "support"
          ? participants.find(participant => participant.role !== "admin" && participant.role !== "super_admin" && participant.role !== "moderator") ?? participants[0]
          : undefined;
        return {
          ...room,
          title: room.roomType === "direct" ? (participants[0]?.name || room.name) : room.roomType === "support" && isAdminViewer ? (supportContact?.name || room.name) : room.name,
          lastMessageId: last?.id ?? null,
          lastMessage: last?.messageType === "voice" ? "رسالة صوتية" : last?.body ?? "",
          lastMessageSenderName: last?.senderName || null,
          unreadCount: unreadByRoom.get(room.id) ?? 0,
          pinned: room.roomType === "support",
          supportContact: isAdminViewer && supportContact ? {
            id: supportContact.id,
            name: supportContact.name,
            email: supportContact.email,
            phone: supportContact.phone,
            avatarUrl: supportContact.avatarUrl,
            accountType: supportContact.accountType,
            role: supportContact.role,
            lastSeenAt: supportContact.lastSeenAt,
            isOnline: Boolean(supportContact.lastSeenAt && supportContact.lastSeenAt >= new Date(Date.now() - 2 * 60_000)),
          } : null,
          participants: participants.slice(0, 10).map(participant => ({
            ...participant,
            isOnline: Boolean(participant.lastSeenAt && participant.lastSeenAt >= new Date(Date.now() - 2 * 60_000)),
          })),
        };
      });
      items.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.getTime() - a.updatedAt.getTime());
      return { items };
    }),
    callStart: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive(), mode: z.enum(["audio", "video"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const room = (await db.select({ id: chatRooms.id, roomType: chatRooms.roomType }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1))[0];
        const members = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.roomId, input.roomId));
        if (!room || !["direct", "support"].includes(room.roomType) || members.length !== 2 || !members.some(member => member.userId === ctx.user.id))
          fail("المكالمات متاحة داخل المحادثات الثنائية أو الدعم المباشر فقط", "FORBIDDEN");
        const recipientId = members.find(member => member.userId !== ctx.user.id)?.userId ?? 0;
        if (!recipientId) fail("تعذر تحديد طرف المكالمة", "BAD_REQUEST");
        const blocked = await db.select({ id: blockedUsers.id }).from(blockedUsers).where(or(
          and(eq(blockedUsers.blockerId, ctx.user.id), eq(blockedUsers.blockedId, recipientId)),
          and(eq(blockedUsers.blockerId, recipientId), eq(blockedUsers.blockedId, ctx.user.id)),
        )).limit(1);
        if (blocked.length) fail("لا يمكن بدء مكالمة مع حساب محظور", "FORBIDDEN");
        const callId = randomBytes(24).toString("base64url");
        try {
          await db.transaction(async tx => {
            // A previous data import may leave a serial sequence behind the table's max id.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(2070620240)`);
            await tx.execute(sql`SELECT setval(pg_get_serial_sequence('public.chat_call_signals', 'id'), GREATEST(COALESCE((SELECT MAX("id") FROM public.chat_call_signals), 0) + 1, 1), false)`);
            await tx.insert(chatCallSignals).values({
              roomId: input.roomId,
              callId,
              senderId: ctx.user.id,
              recipientId,
              kind: "ring",
              payload: JSON.stringify({ mode: input.mode }),
              seq: 1,
              expiresAt: new Date(Date.now() + 10 * 60_000),
            });
          });
        } catch (error) {
          const details = dbFailureInfo(error);
          console.error("[Call] ring insert failed", { code: details.code, constraint: details.constraint, table: details.table, column: details.column });
          if (details.code === "42P01" || details.code === "42704") fail("جدول إشارات المكالمات غير جاهز في قاعدة البيانات. تواصل مع الإدارة لتحديث المخطط.", "INTERNAL_SERVER_ERROR");
          if (details.code === "42501") fail("صلاحيات قاعدة البيانات لا تسمح بحفظ إشارات المكالمات.", "INTERNAL_SERVER_ERROR");
          fail("تعذر بدء المكالمة بسبب إعداد قاعدة البيانات. أعد المحاولة بعد لحظات.", "INTERNAL_SERVER_ERROR");
        }
        return { callId, roomId: input.roomId, mode: input.mode, recipientId };
      }),
    callSignal: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive(), callId: z.string().min(16).max(96), kind: z.enum(["ring", "offer", "answer", "ice-candidate", "renegotiate", "bye"]), payload: z.string().max(60_000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const room = (await db.select({ roomType: chatRooms.roomType }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1))[0];
        const members = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.roomId, input.roomId));
        if (!room || !["direct", "support"].includes(room.roomType) || members.length !== 2 || !members.some(member => member.userId === ctx.user.id))
          fail("غرفة المكالمة غير صالحة", "FORBIDDEN");
        const recipientId = members.find(member => member.userId !== ctx.user.id)?.userId ?? 0;
        if (!recipientId) fail("تعذر تحديد مستقبل الإشارة", "BAD_REQUEST");
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            return await db.transaction(async tx => {
              const lock = await tx.select({ id: chatCallSignals.id })
                .from(chatCallSignals)
                .where(and(eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId)))
                .orderBy(asc(chatCallSignals.id))
                .limit(1)
                .for("update");
              if (!lock.length) fail("انتهت صلاحية المكالمة", "NOT_FOUND");
              const [current] = await tx.select({ value: sql<number>`coalesce(max(${chatCallSignals.seq}), 0)` })
                .from(chatCallSignals)
                .where(and(eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId)));
              const seq = Number(current?.value || 0) + 1;
              await tx.insert(chatCallSignals).values({ roomId: input.roomId, callId: input.callId, senderId: ctx.user.id, recipientId, kind: input.kind, payload: input.payload, seq, expiresAt: new Date(Date.now() + 10 * 60_000) });
              return { seq };
            });
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            const dbError = dbFailureInfo(error);
            const duplicateSequence = isUniqueDbConflict(error);
            if (!duplicateSequence) {
              console.error("[Call] signal persistence failed", { code: dbError.code, constraint: dbError.constraint, table: dbError.table, kind: input.kind });
              fail("تعذر حفظ إشارة المكالمة. أعد المحاولة.", "INTERNAL_SERVER_ERROR");
            }
            if (attempt === 2) {
              fail("تعذر مزامنة المكالمة. أعد المحاولة.", "INTERNAL_SERVER_ERROR");
            }
          }
        }
        throw new Error("تعذر حفظ إشارة المكالمة");
      }),
    callSignals: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive(), callId: z.string().min(16).max(96), afterSeq: z.number().int().min(0).default(0) }))
      .query(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const member = (await db.select({ id: chatMembers.id }).from(chatMembers).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, ctx.user.id))).limit(1))[0];
        if (!member) fail("لا تملك صلاحية قراءة إشارات المكالمة", "FORBIDDEN");
        const rows = await db.select({ id: chatCallSignals.id, senderId: chatCallSignals.senderId, kind: chatCallSignals.kind, payload: chatCallSignals.payload, seq: chatCallSignals.seq })
          .from(chatCallSignals).where(and(eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId), eq(chatCallSignals.recipientId, ctx.user.id), gt(chatCallSignals.expiresAt, new Date()), gt(chatCallSignals.seq, input.afterSeq))).orderBy(chatCallSignals.seq).limit(100);
        if (rows.length) await db.update(chatCallSignals).set({ consumedAt: new Date() }).where(inArray(chatCallSignals.id, rows.map(row => row.id)));
        return { items: rows };
      }),
    callInbox: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db.select({ roomId: chatCallSignals.roomId, callId: chatCallSignals.callId, senderId: chatCallSignals.senderId, kind: chatCallSignals.kind, payload: chatCallSignals.payload, createdAt: chatCallSignals.createdAt })
        .from(chatCallSignals).innerJoin(chatMembers, and(eq(chatMembers.roomId, chatCallSignals.roomId), eq(chatMembers.userId, ctx.user.id)))
        .where(and(eq(chatCallSignals.recipientId, ctx.user.id), inArray(chatCallSignals.kind, ["ring", "offer"]), isNull(chatCallSignals.consumedAt), gt(chatCallSignals.expiresAt, new Date()))).orderBy(desc(chatCallSignals.createdAt)).limit(3);
      return { items: rows };
    }),
    callEnd: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive(), callId: z.string().min(16).max(96) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const member = (await db.select({ id: chatMembers.id }).from(chatMembers).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, ctx.user.id))).limit(1))[0];
        if (!member) fail("لا تملك صلاحية إنهاء المكالمة", "FORBIDDEN");
        const peer = (await db.select({ userId: chatMembers.userId }).from(chatMembers).where(and(eq(chatMembers.roomId, input.roomId), ne(chatMembers.userId, ctx.user.id))).limit(1))[0];
        if (!peer) return { success: true };
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const callExists = await db.transaction(async tx => {
              const lock = await tx.select({ id: chatCallSignals.id }).from(chatCallSignals)
                .where(and(eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId)))
                .orderBy(asc(chatCallSignals.id)).limit(1).for("update");
              if (!lock.length) return false;
              await tx.update(chatCallSignals).set({ consumedAt: new Date() }).where(and(
                eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId), isNull(chatCallSignals.consumedAt),
              ));
              const [current] = await tx.select({ value: sql<number>`coalesce(max(${chatCallSignals.seq}), 0)` }).from(chatCallSignals)
                .where(and(eq(chatCallSignals.roomId, input.roomId), eq(chatCallSignals.callId, input.callId)));
              await tx.insert(chatCallSignals).values({ roomId: input.roomId, callId: input.callId, senderId: ctx.user.id, recipientId: peer.userId, kind: "bye", payload: "{}", seq: Number(current?.value || 0) + 1, expiresAt: new Date(Date.now() + 60_000) });
              return true;
            });
            if (!callExists) fail("انتهت صلاحية المكالمة", "NOT_FOUND");
            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            if (!isUniqueDbConflict(error)) {
              const details = dbFailureInfo(error);
              console.error("[Call] end persistence failed", { code: details.code, constraint: details.constraint, table: details.table });
              fail("تعذر إنهاء المكالمة بشكل آمن. أعد المحاولة.", "INTERNAL_SERVER_ERROR");
            }
            if (attempt === 2) fail("تعذر مزامنة نهاية المكالمة. أعد المحاولة.", "INTERNAL_SERVER_ERROR");
          }
        }
        return { success: true };
      }),
    messages: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        await assertRoomMember(input.roomId, ctx.user.id);
        const db = await dbOrThrow();
        const selected = await db
          .select({ message: chatMessages, senderName: users.name, senderAvatarUrl: users.avatarUrl, senderAccountType: users.accountType, senderRole: users.role })
          .from(chatMessages)
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .leftJoin(chatMessageHidden, and(
            eq(chatMessageHidden.messageId, chatMessages.id),
            eq(chatMessageHidden.userId, ctx.user.id),
          ))
          .where(
            and(
              eq(chatMessages.roomId, input.roomId),
              isNull(chatMessages.deletedAt),
              isNull(chatMessageHidden.id),
            )
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(200);
        const messageIds = selected.map(row => row.message.id);
        const reactionRows = messageIds.length ? await db.select({ messageId: chatMessageReactions.messageId, userId: chatMessageReactions.userId, emoji: chatMessageReactions.emoji })
          .from(chatMessageReactions).where(inArray(chatMessageReactions.messageId, messageIds)) : [];
        const reactionsByMessage = new Map<number, typeof reactionRows>();
        for (const reaction of reactionRows) reactionsByMessage.set(reaction.messageId, [...(reactionsByMessage.get(reaction.messageId) ?? []), reaction]);
        const replyRows = messageIds.length ? await db.select({
          messageId: chatMessageReplyReferences.messageId,
          replyToMessageId: chatMessages.id,
          body: chatMessages.body,
          messageType: chatMessages.messageType,
          senderName: users.name,
        }).from(chatMessageReplyReferences)
          .innerJoin(chatMessages, eq(chatMessages.id, chatMessageReplyReferences.replyToMessageId))
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .leftJoin(chatMessageHidden, and(eq(chatMessageHidden.messageId, chatMessages.id), eq(chatMessageHidden.userId, ctx.user.id)))
          .where(and(inArray(chatMessageReplyReferences.messageId, messageIds), eq(chatMessages.roomId, input.roomId), isNull(chatMessages.deletedAt), isNull(chatMessageHidden.id))) : [];
        const repliesByMessage = new Map(replyRows.map(row => [row.messageId, {
          id: row.replyToMessageId,
          body: row.body,
          messageType: row.messageType,
          senderName: row.senderName,
        }]));
        const items = selected.map(row => {
          const { mediaUrl: _privateMediaKey, ...message } = row.message;
          return { ...message, senderName: row.senderName, senderAvatarUrl: row.senderAvatarUrl, senderAccountType: row.senderAccountType, senderRole: row.senderRole, reactions: reactionsByMessage.get(row.message.id) ?? [], quotedMessage: repliesByMessage.get(row.message.id) ?? null };
        }).reverse();
        if (!items.length) return { items };
        const ownIds = items.filter(message => message.senderId === ctx.user.id).map(message => message.id);
        if (!ownIds.length) return { items };
        const readMessageRows = await db.select({ messageId: chatMessageReads.messageId }).from(chatMessageReads)
          .where(inArray(chatMessageReads.messageId, ownIds));
        const readMessageIds = new Set(readMessageRows.map(row => row.messageId));
        const withReadState = items.map(message => ({ ...message, isRead: message.senderId === ctx.user.id && readMessageIds.has(message.id) }));
        if (!hasModeratorScope(ctx.user, "chats")) return { items: withReadState };
        const readRows = await db.select({ messageId: chatMessageReads.messageId, userId: chatMessageReads.userId, name: users.name })
          .from(chatMessageReads)
          .innerJoin(users, eq(users.id, chatMessageReads.userId))
          .where(inArray(chatMessageReads.messageId, ownIds));
        const readByMessage = new Map<number, { userId: number; name: string | null }[]>();
        for (const row of readRows) readByMessage.set(row.messageId, [...(readByMessage.get(row.messageId) ?? []), { userId: row.userId, name: row.name }]);
        return { items: withReadState.map(message => ({ ...message, readBy: readByMessage.get(message.id) ?? [] })) };
      }),
    markRead: protectedProcedure
      .input(z.object({ roomId: z.number().int().positive(), messageIds: z.array(z.number().int().positive()).min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await assertRoomMember(input.roomId, ctx.user.id);
        const db = await dbOrThrow();
        const visibleMessages = await db.select({ id: chatMessages.id, senderId: chatMessages.senderId, createdAt: chatMessages.createdAt })
          .from(chatMessages)
          .leftJoin(chatMessageHidden, and(eq(chatMessageHidden.messageId, chatMessages.id), eq(chatMessageHidden.userId, ctx.user.id)))
          .where(and(
            eq(chatMessages.roomId, input.roomId),
            inArray(chatMessages.id, input.messageIds),
            isNull(chatMessages.deletedAt),
            isNull(chatMessageHidden.id),
          ));
        const incoming = visibleMessages.filter(message => message.senderId !== ctx.user.id);
        if (!incoming.length) return { readMessageIds: [] as number[] };
        const incomingIds = incoming.map(message => message.id);
        const existing = await db.select({ messageId: chatMessageReads.messageId }).from(chatMessageReads).where(and(
          eq(chatMessageReads.userId, ctx.user.id), inArray(chatMessageReads.messageId, incomingIds),
        ));
        const existingIds = new Set(existing.map(row => row.messageId));
        const readAt = new Date();
        const newlyRead: number[] = [];
        for (const messageId of incomingIds.filter(id => !existingIds.has(id))) {
          try {
            await db.insert(chatMessageReads).values({ messageId, userId: ctx.user.id, readAt });
            newlyRead.push(messageId);
          } catch (error) {
            const duplicate = (error as any)?.code === "ER_DUP_ENTRY" || (error as any)?.errno === 1062;
            if (!duplicate) throw error;
          }
        }
        const membership = (await db.select({ lastReadAt: chatMembers.lastReadAt }).from(chatMembers).where(and(
          eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, ctx.user.id),
        )).limit(1))[0];
        const latestVisibleAt = incoming.reduce((latest, message) => message.createdAt > latest ? message.createdAt : latest, incoming[0].createdAt);
        if (!membership?.lastReadAt || latestVisibleAt.getTime() > membership.lastReadAt.getTime())
          await db.update(chatMembers).set({ lastReadAt: latestVisibleAt }).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, ctx.user.id)));
        return { readMessageIds: newlyRead };
      }),
    voiceUrl: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const message = (await db.select({ roomId: chatMessages.roomId, messageType: chatMessages.messageType, mediaUrl: chatMessages.mediaUrl, deletedAt: chatMessages.deletedAt })
          .from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1))[0];
        const mediaKey = message?.mediaUrl;
        if (!message || message.deletedAt || message.messageType === "text" || !mediaKey)
          fail("وسائط الرسالة غير متاحة", "NOT_FOUND");
        if (!hasModeratorScope(ctx.user, "chats")) await assertRoomMember(message.roomId, ctx.user.id);
        const key = mediaKey!.replace(/^\/manus-storage\//, "");
        if (!key.startsWith("chat-voice/") && !key.startsWith("chat-media/")) fail("رابط الوسائط غير صالح", "NOT_FOUND");
        return { url: await storageGetSignedUrl(key) };
      }),
      send: protectedProcedure
      .input(
        z.object({
          roomId: z.number().int().positive(),
          body: z.string().trim().max(4000).optional(),
          messageType: z.enum(["text", "voice", "image", "video", "file"]).default("text"),
          mediaAssetId: z.number().int().positive().optional(),
          durationSeconds: z.number().int().min(1).max(60).optional(),
          replyToMessageId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const body = input.body?.trim() ?? "";
        if (input.messageType === "text" && !body) fail("اكتب رسالة قبل الإرسال");
        let mediaAsset: { key: string; mimeType: string } | undefined;
        if (input.messageType !== "text") {
          const mediaAssetId = input.mediaAssetId;
          if (!mediaAssetId || (input.messageType === "voice" && !input.durationSeconds)) fail("الوسائط المرسلة غير مكتملة");
          mediaAsset = (await db.select({ key: uploadedAssets.key, mimeType: uploadedAssets.mimeType })
            .from(uploadedAssets).where(and(eq(uploadedAssets.id, mediaAssetId!), eq(uploadedAssets.ownerId, ctx.user.id))).limit(1))[0];
          if (!mediaAsset) fail("الملف غير موجود أو لا يخص هذا الحساب", "FORBIDDEN");
          const validType = input.messageType === "voice" ? mediaAsset.mimeType.startsWith("audio/") : input.messageType === "image" ? mediaAsset.mimeType.startsWith("image/") : input.messageType === "video" ? mediaAsset.mimeType.startsWith("video/") : true;
          if (!validType) fail("نوع الملف لا يطابق نوع الرسالة");
        }
        const result = await db.transaction(async tx => {
          const room = (
            await tx
              .select()
              .from(chatRooms)
              .where(eq(chatRooms.id, input.roomId))
              .limit(1)
              .for("update")
          )[0];
          if (!room) fail("غرفة المحادثة غير موجودة", "NOT_FOUND");
          const membership = await tx
            .select({ id: chatMembers.id })
            .from(chatMembers)
            .where(
              and(
                eq(chatMembers.roomId, input.roomId),
                eq(chatMembers.userId, ctx.user.id)
              )
            )
            .limit(1);
          if (!membership.length)
            fail("لا تملك صلاحية إرسال الرسائل في هذه الغرفة", "FORBIDDEN");
          if (input.replyToMessageId) {
            const replyTarget = (await tx.select({ id: chatMessages.id }).from(chatMessages).where(and(
              eq(chatMessages.id, input.replyToMessageId), eq(chatMessages.roomId, input.roomId), isNull(chatMessages.deletedAt),
            )).limit(1))[0];
            if (!replyTarget) fail("الرسالة المطلوب الرد عليها غير متاحة في هذه المحادثة", "NOT_FOUND");
          }
          const peerRows = await tx.select({ userId: chatMembers.userId }).from(chatMembers).where(and(eq(chatMembers.roomId, input.roomId), ne(chatMembers.userId, ctx.user.id)));
          if (peerRows.length) {
            const peerIds = peerRows.map(peer => peer.userId);
            const blocked = await tx.select({ id: blockedUsers.id }).from(blockedUsers).where(or(
              and(eq(blockedUsers.blockerId, ctx.user.id), inArray(blockedUsers.blockedId, peerIds)),
              and(inArray(blockedUsers.blockerId, peerIds), eq(blockedUsers.blockedId, ctx.user.id)),
            )).limit(1);
            if (blocked.length) fail("لا يمكن إرسال الرسالة لأن أحد أطراف المحادثة محظور", "FORBIDDEN");
          }
          const inserted = await tx.insert(chatMessages).values({
            roomId: input.roomId,
            senderId: ctx.user.id,
            body: input.messageType === "text" ? body : "",
            messageType: input.messageType,
            mediaUrl: mediaAsset?.key ?? null,
            mediaMimeType: mediaAsset?.mimeType ?? null,
            durationSeconds: input.messageType === "voice" ? input.durationSeconds ?? null : null,
          }).returning({ id: chatMessages.id });
          const newMessageId = Number(inserted[0].id);
          if (input.replyToMessageId) await tx.insert(chatMessageReplyReferences).values({ messageId: newMessageId, replyToMessageId: input.replyToMessageId });
          await tx
            .update(chatRooms)
            .set({ updatedAt: new Date() })
            .where(eq(chatRooms.id, input.roomId));
          const members = await tx
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(
              and(
                eq(chatMembers.roomId, input.roomId),
                ne(chatMembers.userId, ctx.user.id)
              )
            );
          const peerIds = members.map(member => member.userId);
          if (peerIds.length)
            await tx.insert(notifications).values(
              peerIds.map(userId => ({
                userId,
                chatMessageId: newMessageId,
                senderId: ctx.user.id,
                title: ctx.user.name || "رسالة جديدة",
                body: input.messageType === "text" ? body : input.messageType === "voice" ? "رسالة صوتية" : "وسائط جديدة",
                type: "chat",
                url: `/chat?room=${input.roomId}`,
                iconUrl: ctx.user.avatarUrl || "/app-icon-192.png",
                dedupeKey: `chat:${newMessageId}:${userId}`,
              }))
            );
          return { peerIds } as const;
        });
        void sendPushToUsers(result.peerIds, {
          category: "chat",
          title: ctx.user.name || "رسالة جديدة",
          body: input.messageType === "text" ? body : input.messageType === "voice" ? "رسالة صوتية" : "وسائط جديدة",
          url: `/chat?room=${input.roomId}`,
          icon: ctx.user.avatarUrl || "/app-icon-192.png",
          tag: `chat-room-${input.roomId}`,
          senderName: ctx.user.name,
          senderAvatarUrl: ctx.user.avatarUrl,
        });
        return { success: true } as const;
      }),
    react: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive(), emoji: z.string().trim().min(1).max(16) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const message = (await db.select({ roomId: chatMessages.roomId }).from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1))[0];
        if (!message) fail("الرسالة غير موجودة", "NOT_FOUND");
        await assertRoomMember(message.roomId, ctx.user.id);
        const existing = (await db.select({ id: chatMessageReactions.id }).from(chatMessageReactions).where(and(eq(chatMessageReactions.messageId, input.messageId), eq(chatMessageReactions.userId, ctx.user.id), eq(chatMessageReactions.emoji, input.emoji))).limit(1))[0];
        if (existing) await db.delete(chatMessageReactions).where(eq(chatMessageReactions.id, existing.id));
        else await db.insert(chatMessageReactions).values({ messageId: input.messageId, userId: ctx.user.id, emoji: input.emoji });
        return { active: !existing };
      }),
    deleteMessage: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive(), scope: z.enum(["me", "everyone"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const message = (await db.select().from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1))[0];
        if (!message) fail("الرسالة غير موجودة", "NOT_FOUND");
        await assertRoomMember(message.roomId, ctx.user.id);
        if (input.scope === "me") {
          await db.insert(chatMessageHidden).values({ messageId: message.id, userId: ctx.user.id }).onConflictDoNothing();
          await db.update(notifications).set({ body: "تم إخفاء الرسالة" }).where(and(
            eq(notifications.chatMessageId, message.id), eq(notifications.userId, ctx.user.id), eq(notifications.type, "chat"),
          ));
          return { success: true } as const;
        }
        if (message.senderId !== ctx.user.id || Date.now() - message.createdAt.getTime() > 15 * 60_000)
          fail("يمكن حذف رسائلك للجميع خلال أول 15 دقيقة فقط", "FORBIDDEN");
        await db.transaction(async tx => {
          await tx.update(chatMessages).set({ deletedAt: new Date() }).where(and(eq(chatMessages.id, message.id), isNull(chatMessages.deletedAt)));
          await tx.update(notifications).set({ body: "تم حذف الرسالة" }).where(and(
            eq(notifications.chatMessageId, message.id), eq(notifications.type, "chat"),
          ));
        });
        return { success: true } as const;
      }),
    openPitch: protectedProcedure
      .input(z.object({ pitchId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player")
          fail("يمكن للاعبين مراسلة أصحاب الملاعب", "FORBIDDEN");
        const db = await dbOrThrow();
        const pitch = (
          await db
            .select({
              id: pitches.id,
              ownerId: pitches.ownerId,
              name: pitches.name,
            })
            .from(pitches)
            .where(
              and(
                eq(pitches.id, input.pitchId),
                eq(pitches.status, "published")
              )
            )
            .limit(1)
        )[0];
        if (!pitch || pitch.ownerId === ctx.user.id)
          fail("الملعب غير متاح للمراسلة", "NOT_FOUND");
        const owner = (
          await db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(eq(users.id, pitch.ownerId))
            .limit(1)
        )[0];
        if (!owner || owner.role !== "owner")
          fail("صاحب الملعب غير مفعل", "FORBIDDEN");
        const myRooms = await db
          .select({ roomId: chatMembers.roomId })
          .from(chatMembers)
          .innerJoin(chatRooms, eq(chatMembers.roomId, chatRooms.id))
          .where(
            and(
              eq(chatMembers.userId, ctx.user.id),
              isNull(chatRooms.matchId),
              eq(chatRooms.isModerated, false),
              eq(chatRooms.roomType, "direct")
            )
          );
        for (const item of myRooms) {
          const members = await db
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(eq(chatMembers.roomId, item.roomId));
          if (
            members.length === 2 &&
            members.some(member => member.userId === owner.id)
          )
            return { id: item.roomId };
        }
        const room = await db
          .insert(chatRooms)
          .values({ name: pitch.name, createdBy: ctx.user.id })
          .returning({ id: chatRooms.id });
        const roomId = Number(room[0].id);
        await db.insert(chatMembers).values([
          { roomId, userId: ctx.user.id, memberRole: "owner" },
          { roomId, userId: owner.id, memberRole: "member" },
        ]);
        return { id: roomId };
      }),
    openSupport: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await dbOrThrow();
      const id = await ensureSupportRoom(db, ctx.user);
      if (!id) fail("لا يوجد مدير متاح للدعم حالياً", "NOT_FOUND");
      return { id };
    }),
    openPlayer: protectedProcedure
      .input(z.object({ playerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player" || ctx.user.role !== "player")
          fail("المحادثة الثنائية مخصصة للاعبين", "FORBIDDEN");
        if (input.playerId === ctx.user.id) fail("لا يمكنك بدء محادثة مع نفسك");
        const db = await dbOrThrow();
        const target = (await db.select({ id: users.id, name: users.name, accountType: users.accountType, role: users.role, isSuspended: users.isSuspended })
          .from(users).where(eq(users.id, input.playerId)).limit(1))[0];
        if (!target || target.accountType !== "player" || target.role !== "player" || target.isSuspended)
          fail("ملف اللاعب غير متاح", "NOT_FOUND");
        const friendship = (await db.select({ id: friendRequests.id }).from(friendRequests).where(and(
          eq(friendRequests.status, "accepted"),
          or(
            and(eq(friendRequests.requesterId, ctx.user.id), eq(friendRequests.recipientId, target.id)),
            and(eq(friendRequests.requesterId, target.id), eq(friendRequests.recipientId, ctx.user.id)),
          ),
        )).limit(1))[0];
        if (!friendship) fail("تظهر المحادثة بعد قبول طلب الصداقة من الطرفين", "FORBIDDEN");
        const myRooms = await db.select({ roomId: chatMembers.roomId }).from(chatMembers)
          .innerJoin(chatRooms, eq(chatMembers.roomId, chatRooms.id))
          .where(and(eq(chatMembers.userId, ctx.user.id), eq(chatRooms.roomType, "direct")))
          .limit(100);
        for (const item of myRooms) {
          const members = await db.select({ userId: chatMembers.userId }).from(chatMembers)
            .where(eq(chatMembers.roomId, item.roomId)).limit(3);
          if (members.length === 2 && members.some(member => member.userId === target.id)) return { id: item.roomId };
        }
        const room = await db.insert(chatRooms).values({
          name: `${ctx.user.name || "لاعب"} و${target.name || "لاعب"}`.slice(0, 180),
          createdBy: ctx.user.id,
          roomType: "direct",
        }).returning({ id: chatRooms.id });
        const roomId = Number(room[0].id);
        await db.insert(chatMembers).values([
          { roomId, userId: ctx.user.id, memberRole: "member" },
          { roomId, userId: target.id, memberRole: "member" },
        ]);
        return { id: roomId };
      }),
    createClosedRoom: protectedProcedure
      .input(
        z.object({
          userA: z.number().int().positive(),
          userB: z.number().int().positive(),
          name: z.string().min(2).max(180),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!hasModeratorScope(ctx.user, "chats"))
          fail("Chat room creation permission required", "FORBIDDEN");
        if (input.userA === input.userB) fail("اختر شخصين مختلفين");
        const db = await dbOrThrow();
        const participants = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, [input.userA, input.userB]));
        if (participants.length !== 2)
          fail("لم نعثر على الحسابين", "NOT_FOUND");
        const result = await db.insert(chatRooms).values({
          name: input.name,
          createdBy: ctx.user.id,
          isModerated: true,
        }).returning({ id: chatRooms.id });
        const roomId = Number(result[0].id);
        await db.insert(chatMembers).values([
          { roomId, userId: input.userA, memberRole: "member" },
          { roomId, userId: input.userB, memberRole: "member" },
        ]);
        return { id: roomId };
      }),
    moderationRooms: protectedProcedure.query(async ({ ctx }) => {
      if (!hasModeratorScope(ctx.user, "chats"))
        fail("Chat review permission required", "FORBIDDEN");
      const db = await dbOrThrow();
      const rooms = await db
        .select()
        .from(chatRooms)
        .orderBy(desc(chatRooms.updatedAt))
        .limit(100);
      if (!rooms.length) return { items: [] };
      const roomIds = rooms.map(room => room.id);
      const [memberRows, selectedMessages] = await Promise.all([
        db.select({ roomId: chatMembers.roomId, id: users.id, name: users.name, role: users.role })
          .from(chatMembers).innerJoin(users, eq(chatMembers.userId, users.id))
          .where(inArray(chatMembers.roomId, roomIds)),
        (async () => {
          const rankedMessages = db.select({
            id: chatMessages.id,
            roomId: chatMessages.roomId,
            senderId: chatMessages.senderId,
            body: chatMessages.body,
            messageType: chatMessages.messageType,
            mediaUrl: chatMessages.mediaUrl,
            mediaMimeType: chatMessages.mediaMimeType,
            durationSeconds: chatMessages.durationSeconds,
            createdAt: chatMessages.createdAt,
            senderName: users.name,
            rowNumber: sql<number>`row_number() over (partition by ${chatMessages.roomId} order by ${chatMessages.createdAt} desc, ${chatMessages.id} desc)`.as("rowNumber"),
          }).from(chatMessages).leftJoin(users, eq(chatMessages.senderId, users.id))
            .where(and(inArray(chatMessages.roomId, roomIds), isNull(chatMessages.deletedAt))).as("ranked_messages");
          return db.select().from(rankedMessages)
            .where(lte(rankedMessages.rowNumber, 20))
            .orderBy(desc(rankedMessages.createdAt), desc(rankedMessages.id));
        })(),
      ]);
      const messageIds = selectedMessages.map(message => message.id);
      const readRows = messageIds.length ? await db.select({ messageId: chatMessageReads.messageId, userId: chatMessageReads.userId, name: users.name })
        .from(chatMessageReads).innerJoin(users, eq(chatMessageReads.userId, users.id))
        .where(inArray(chatMessageReads.messageId, messageIds)) : [];
      const membersByRoom = new Map<number, typeof memberRows>();
      for (const member of memberRows) membersByRoom.set(member.roomId, [...(membersByRoom.get(member.roomId) ?? []), member]);
      const messagesByRoom = new Map<number, typeof selectedMessages>();
      for (const message of selectedMessages) messagesByRoom.set(message.roomId, [...(messagesByRoom.get(message.roomId) ?? []), message]);
      const readsByMessage = new Map<number, { userId: number; name: string | null }[]>();
      for (const read of readRows) readsByMessage.set(read.messageId, [...(readsByMessage.get(read.messageId) ?? []), { userId: read.userId, name: read.name }]);
      const items = rooms.map(room => ({
        ...room,
        members: membersByRoom.get(room.id) ?? [],
        messages: (messagesByRoom.get(room.id) ?? []).map(message => {
          const { mediaUrl: _privateMediaKey, ...safeMessage } = message;
          return { ...safeMessage, readBy: readsByMessage.get(message.id) ?? [] };
        }),
      }));
      return { items };
    }),
  }),

  reports: router({
    create: protectedProcedure
      .input(
        z.object({
          targetType: z.string().min(1).max(40),
          targetId: z.number().int().positive(),
          reason: z.enum(["spam", "harassment", "fraud", "unsafe", "other"]),
          details: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const result = await db
          .insert(reports)
          .values({ ...input, reporterId: ctx.user.id, status: "open" })
          .returning({ id: reports.id });
        return { id: Number(result[0].id) };
      }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const items = await db
        .select()
        .from(reports)
        .where(
          hasModeratorScope(ctx.user, "reports")
            ? undefined
            : eq(reports.reporterId, ctx.user.id)
        )
        .orderBy(desc(reports.createdAt));
      return { items };
    }),
    review: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["reviewing", "resolved", "dismissed"]),
          resolution: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!hasModeratorScope(ctx.user, "reports"))
          fail("Report review permission required", "FORBIDDEN");
        const db = await dbOrThrow();
        const row = (
          await db
            .select()
            .from(reports)
            .where(eq(reports.id, input.id))
            .limit(1)
        )[0];
        if (!row) fail("Report not found", "NOT_FOUND");
        await db
          .update(reports)
          .set({
            status: input.status,
            resolution: input.resolution,
            reviewedBy: ctx.user.id,
          })
          .where(eq(reports.id, input.id));
        const body =
          input.status === "dismissed"
            ? `تم رفض البلاغ: ${input.resolution?.trim() || "لم يتم تقديم سبب"}`
            : "تمت مراجعة بلاغك وسيتم اتخاذ الإجراء";
        await db.insert(notifications).values({
          userId: row.reporterId,
          title: "تحديث البلاغ",
          body,
          type: "report",
        });
        return { success: true } as const;
      }),
  }),

  suggestions: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2).max(180),
          address: z.string().min(2).max(320),
          city: z.string().min(2).max(120),
          notes: z.string().max(4000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const result = await db
          .insert(pitchSuggestions)
          .values({ ...input, userId: ctx.user.id })
          .returning({ id: pitchSuggestions.id });
        return { id: Number(result[0].id) };
      }),
    list: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      return {
        items: await db
          .select()
          .from(pitchSuggestions)
          .orderBy(desc(pitchSuggestions.createdAt)),
      };
    }),
    review: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["reviewed", "accepted", "rejected"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await dbOrThrow();
        const row = (
          await db
            .select()
            .from(pitchSuggestions)
            .where(eq(pitchSuggestions.id, input.id))
            .limit(1)
        )[0];
        if (!row) fail("Pitch suggestion not found", "NOT_FOUND");
        await db
          .update(pitchSuggestions)
          .set({ status: input.status })
          .where(eq(pitchSuggestions.id, input.id));
        const body =
          input.status === "accepted"
            ? "تم قبول اقتراح الملعب وسيتم التواصل مع المالك"
            : input.status === "rejected"
              ? "تمت مراجعة اقتراح الملعب ولن يُضاف حالياً"
              : "تمت مراجعة اقتراح الملعب وسيتم اتخاذ الإجراء";
        await db.insert(notifications).values({
          userId: row.userId,
          title: "تحديث اقتراح الملعب",
          body,
          type: "suggestion",
        });
        return { success: true } as const;
      }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      return {
        items: (await db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, ctx.user.id))
          .orderBy(desc(notifications.createdAt))
          .limit(100)).map(item => item.type === "chat" && !item.chatMessageId
            ? { ...item, body: "رسالة جديدة" }
            : item),
      };
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.id, input.id),
              eq(notifications.userId, ctx.user.id)
            )
          );
        return { success: true } as const;
    }),
  }),

  push: router({
    publicKey: publicProcedure.query(() => ({ publicKey: getVapidPublicKey(), configured: pushIsConfigured() })),
    preferences: protectedProcedure.query(({ ctx }) => readNotificationPreferences(ctx.user.id)),
    savePreferences: protectedProcedure
      .input(z.object({
        chat: z.boolean().optional(),
        bookings: z.boolean().optional(),
        matches: z.boolean().optional(),
        social: z.boolean().optional(),
        calls: z.boolean().optional(),
        hideMessagePreview: z.boolean().optional(),
        mutedUntil: z.string().datetime().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => updateNotificationPreferences(ctx.user.id, {
        ...input,
        mutedUntil: input.mutedUntil === undefined ? undefined : input.mutedUntil ? new Date(input.mutedUntil) : null,
      })),
    register: protectedProcedure
      .input(z.object({
        subscription: z.object({
          endpoint: z.string().url().max(2048),
          keys: z.object({ p256dh: z.string().min(16).max(512), auth: z.string().min(8).max(256) }),
          expirationTime: z.number().nullable().optional(),
        }),
        deviceName: z.string().trim().max(120).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await savePushSubscription(ctx.user.id, input.subscription, ctx.req.headers["user-agent"] || null, input.deviceName);
        return { success: true, configured: pushIsConfigured() } as const;
      }),
    unregister: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2048) }))
      .mutation(async ({ ctx, input }) => {
        await removePushSubscription(ctx.user.id, input.endpoint);
        return { success: true } as const;
      }),
    test: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await sendPushToUsers([ctx.user.id], {
        category: "social",
        title: "اختبار إشعارات البرازيلي",
        body: "إذا رأيت هذا التنبيه، فالإشعارات الحقيقية تعمل على هذا الجهاز.",
        url: "/settings",
        tag: `push-test-${ctx.user.id}`,
      });
      return { success: true, ...result } as const;
    }),
  }),

  subscriptions: router({
    plans: publicProcedure.query(async () => {
      const db = await dbOrThrow();
      const [items, setting] = await Promise.all([
        db
          .select()
          .from(ownerPlans)
          .where(eq(ownerPlans.isActive, true))
          .orderBy(ownerPlans.price),
        db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.key, "vodafone_cash_number"))
          .limit(1),
      ]);
      return { items, vodafoneCashNumber: setting[0]?.value ?? "" };
    }),
    request: protectedProcedure
      .input(
        z.object({
          planId: z.number().int().positive(),
          vodafoneCashNumber: z.string().min(8).max(32),
          paymentReference: z.string().min(2).max(160),
          receiptUrl: z.string().min(1).max(512),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "owner" && ctx.user.role !== "owner")
          fail("Owner account required", "FORBIDDEN");
        if (
          !input.receiptUrl.startsWith(`/manus-storage/uploads/${ctx.user.id}/`)
        )
          fail("ارفع إيصال التحويل من حسابك أولاً");
        const db = await dbOrThrow();
        const receiptKey = input.receiptUrl.slice("/manus-storage/".length);
        const receipt = (
          await db
            .select({ key: uploadedAssets.key })
            .from(uploadedAssets)
            .where(
              and(
                eq(uploadedAssets.ownerId, ctx.user.id),
                eq(uploadedAssets.key, receiptKey)
              )
            )
            .limit(1)
        )[0];
        if (!receipt) fail("لم نعثر على إيصال مرفوع من حسابك");
        const plan = (
          await db
            .select()
            .from(ownerPlans)
            .where(
              and(
                eq(ownerPlans.id, input.planId),
                eq(ownerPlans.isActive, true)
              )
            )
            .limit(1)
        )[0];
        if (!plan) fail("Plan not found", "NOT_FOUND");
        const result = await db
          .insert(subscriptionRequests)
          .values({ ...input, ownerId: ctx.user.id, status: "pending" })
          .returning({ id: subscriptionRequests.id });
        const requestId = Number(result[0].id);
        const receiptDecision = await verifySubscriptionReceipt(requestId);
        if (receiptDecision === "manual") {
          await db.insert(notifications).values({
            userId: ctx.user.id,
            title: "طلب الاشتراك",
            body: "تم استلام الإيصال وسيُراجع يدوياً من الإدارة.",
            type: "subscription",
          });
        }
        return {
          id: requestId,
          status: receiptDecision === "manual" ? "pending" : receiptDecision,
        } as const;
      }),
  }),

  wallet: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const account = (
        await db
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, ctx.user.id))
          .limit(1)
      )[0];
      const transactions = account
        ? await db
            .select()
            .from(walletTransactions)
            .where(eq(walletTransactions.walletId, account.id))
            .orderBy(desc(walletTransactions.createdAt))
            .limit(50)
        : [];
      return { balance: account?.balance ?? "0", transactions };
    }),
    qrLogs: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const items = await db
        .select()
        .from(qrLogs)
        .where(eq(qrLogs.userId, ctx.user.id))
        .orderBy(desc(qrLogs.createdAt))
        .limit(100);
      return { items };
    }),
  }),

  uploads: router({
    image: protectedProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(180),
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          dataBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          !isAdmin(ctx.user.role) &&
          !canOwn(ctx.user.role) &&
          ctx.user.role !== "player"
        )
          fail("Upload permission required", "FORBIDDEN");
        const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
        const data = Buffer.from(raw, "base64");
        if (!data.length) fail("Invalid image data");
        if (data.length > 5 * 1024 * 1024) fail("Image exceeds 5MB");
        if (!matchesSupportedImageMime(data, input.mimeType)) fail("محتوى الملف لا يطابق نوع الصورة المعلن");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uploaded = await storagePut(
          `uploads/${ctx.user.id}/${Date.now()}_${randomBytes(12).toString("hex")}_${safeName}`,
          data,
          input.mimeType
        );
        const db = await dbOrThrow();
        await db.insert(uploadedAssets).values({
          ownerId: ctx.user.id,
          key: uploaded.key,
          mimeType: input.mimeType,
        });
        return uploaded;
      }),
    voice: protectedProcedure
      .input(z.object({
        fileName: z.string().min(1).max(180),
        mimeType: z.string().regex(/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)(;\s*codecs=[a-z0-9-]+)?$/i),
        dataBase64: z.string().min(1),
        durationSeconds: z.number().int().min(1).max(60),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.accountType !== "player" && !canOwn(ctx.user.role) && ctx.user.role !== "moderator" && !isAdmin(ctx.user.role))
          fail("الرسائل الصوتية متاحة لحسابات التطبيق فقط", "FORBIDDEN");
        const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
        const data = Buffer.from(raw, "base64");
        if (!data.length) fail("تعذر قراءة التسجيل الصوتي");
        if (data.length > 8 * 1024 * 1024) fail("يجب ألا يتجاوز التسجيل الصوتي 8 ميغابايت");
        if (!matchesSupportedVoiceMime(data, input.mimeType)) fail("محتوى الملف لا يطابق نوع الصوت المعلن");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "voice-note.webm";
        const uploaded = await storagePut(`chat-voice/${ctx.user.id}/${Date.now()}_${randomBytes(12).toString("hex")}_${safeName}`, data, input.mimeType);
        const db = await dbOrThrow();
        const asset = await db.insert(uploadedAssets).values({ ownerId: ctx.user.id, key: uploaded.key, mimeType: input.mimeType }).returning({ id: uploadedAssets.id });
        return { assetId: Number(asset[0].id), key: uploaded.key, url: uploaded.url, durationSeconds: input.durationSeconds, mimeType: input.mimeType };
      }),
    chatMedia: protectedProcedure
      .input(z.object({ fileName: z.string().min(1).max(180), mimeType: z.string().regex(/^(image|video|application|text)\/[a-z0-9.+-]+$/i), dataBase64: z.string().min(1), messageType: z.enum(["image", "video", "file"]) }))
      .mutation(async ({ ctx, input }) => {
        const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
        const data = Buffer.from(raw, "base64");
        if (!data.length) fail("تعذر قراءة الملف");
        const maxBytes = input.messageType === "video" ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
        if (data.length > maxBytes) fail(`حجم الملف أكبر من الحد المسموح (${Math.round(maxBytes / 1024 / 1024)} ميغابايت)`);
        const validMime = input.messageType === "image" ? input.mimeType.startsWith("image/") : input.messageType === "video" ? input.mimeType.startsWith("video/") : !input.mimeType.startsWith("audio/");
        if (!validMime) fail("نوع الملف غير صالح لهذه الرسالة");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "chat-file";
        const uploaded = await storagePut(`chat-media/${ctx.user.id}/${Date.now()}_${randomBytes(12).toString("hex")}_${safeName}`, data, input.mimeType);
        const db = await dbOrThrow();
        const asset = await db.insert(uploadedAssets).values({ ownerId: ctx.user.id, key: uploaded.key, mimeType: input.mimeType }).returning({ id: uploadedAssets.id });
        return { assetId: Number(asset[0].id), key: uploaded.key, mimeType: input.mimeType, fileName: input.fileName };
      }),
    apk: adminProcedure
      .input(z.object({
        fileName: z.string().min(5).max(180),
        dataBase64: z.string().min(1).max(Math.ceil(MAX_APK_BYTES * 4 / 3) + 256),
      }))
      .mutation(async ({ ctx, input }) => {
        const originalName = input.fileName.trim();
        if (!originalName.toLowerCase().endsWith(".apk")) fail("يجب رفع ملف بامتداد APK.");
        const raw = input.dataBase64.replace(/^data:[^;]+;base64,/, "");
        const data = Buffer.from(raw, "base64");
        if (!data.length) fail("تعذر قراءة ملف APK.");
        if (data.length > MAX_APK_BYTES) fail("يجب ألا يتجاوز حجم ملف APK ‏30 ميغابايت.");
        if (!looksLikeAndroidApk(data)) fail("محتوى الملف لا يبدو حزمة Android APK صالحة.");
        const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "application.apk";
        const mimeType = "application/vnd.android.package-archive";
        const uploaded = await storagePut(`downloads/${ctx.user.id}/${Date.now()}_${randomBytes(12).toString("hex")}_${safeName}`, data, mimeType);
        const db = await dbOrThrow();
        await db.insert(uploadedAssets).values({ ownerId: ctx.user.id, key: uploaded.key, mimeType });
        return { ...uploaded, fileName: originalName, sizeBytes: data.length };
      }),
  }),

  downloadSettings: router({
    public: publicProcedure.query(async () => {
      const config = await readDownloadPageConfig();
      return {
        available: Boolean(config?.mode && config?.url),
        fileName: config?.fileName ?? null,
        appName: config?.appName ?? DEFAULT_DOWNLOAD_APP_NAME,
        version: config?.version ?? "1.0.0",
        windowsAvailable: Boolean(config?.windowsUrl),
        windowsFileName: config?.windowsFileName ?? "ElBarzily-Windows.exe",
        supportLink: config?.supportLink ?? "/support",
        supportNumbers: (config?.supportNumbers ?? []).map(number => ({ number, url: whatsAppLink(number) })),
      };
    }),
    request: publicProcedure
      .input(z.object({ platform: z.enum(["android", "windows"]) }))
      .mutation(async ({ ctx, input }) => {
        const config = await readDownloadPageConfig();
        const url = input.platform === "android"
          ? (config?.mode ? config.url : "")
          : (config?.windowsUrl ?? "");
        if (!url) throw new TRPCError({ code: "NOT_FOUND", message: "التنزيل غير متاح حالياً." });

        const client = classifyDownloadAgent(ctx.req.headers["user-agent"]);
        try {
          const db = await dbOrThrow();
          await db.insert(downloadDailyStats).values({
            eventDate: cairoIsoDate(),
            platform: input.platform,
            deviceType: client.deviceType,
            osName: client.osName,
            browserName: client.browserName,
            requestCount: 1,
          }).onConflictDoNothing();
        } catch {
          console.warn("[downloads] The daily counter could not be updated; continuing with the configured file.");
        }
        return {
          // Keep the endpoint uncached when a user previously opened an older installer.
          url: `/api/download/${input.platform}?v=${encodeURIComponent(config?.version ?? "1.0.0")}`,
          fileName: input.platform === "android" ? config?.fileName : config?.windowsFileName,
        };
      }),
    stats: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      const today = cairoIsoDate();
      const weekStart = shiftIsoDate(today, -6);
      const monthStart = shiftIsoDate(today, -29);
      const [allPlatforms, recentPlatforms, recentDevices, recentSystems, recentBrowsers, dailyRows] = await Promise.all([
        db.select({ platform: downloadDailyStats.platform, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).groupBy(downloadDailyStats.platform),
        db.select({ platform: downloadDailyStats.platform, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).where(gte(downloadDailyStats.eventDate, monthStart)).groupBy(downloadDailyStats.platform),
        db.select({ name: downloadDailyStats.deviceType, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).where(gte(downloadDailyStats.eventDate, monthStart)).groupBy(downloadDailyStats.deviceType),
        db.select({ name: downloadDailyStats.osName, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).where(gte(downloadDailyStats.eventDate, monthStart)).groupBy(downloadDailyStats.osName),
        db.select({ name: downloadDailyStats.browserName, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).where(gte(downloadDailyStats.eventDate, monthStart)).groupBy(downloadDailyStats.browserName),
        db.select({ date: downloadDailyStats.eventDate, total: sql<number>`SUM(${downloadDailyStats.requestCount})` })
          .from(downloadDailyStats).where(gte(downloadDailyStats.eventDate, weekStart)).groupBy(downloadDailyStats.eventDate).orderBy(downloadDailyStats.eventDate),
      ]);
      const asCount = (value: unknown) => Number(value) || 0;
      const byName = (rows: { name: string; total: number }[]) => rows.map(row => ({ name: row.name, total: asCount(row.total) })).sort((a, b) => b.total - a.total);
      const platformTotal = (rows: { platform: string; total: number }[], platform: string) => asCount(rows.find(row => row.platform === platform)?.total);
      const dailyMap = new Map(dailyRows.map(row => [String(row.date), asCount(row.total)]));
      const daily = Array.from({ length: 7 }, (_, index) => {
        const date = shiftIsoDate(weekStart, index);
        return { date, total: dailyMap.get(date) ?? 0 };
      });
      return {
        total: allPlatforms.reduce((sum, row) => sum + asCount(row.total), 0),
        android: platformTotal(allPlatforms, "android"),
        windows: platformTotal(allPlatforms, "windows"),
        last30Days: recentPlatforms.reduce((sum, row) => sum + asCount(row.total), 0),
        last30DaysPlatforms: {
          android: platformTotal(recentPlatforms, "android"),
          windows: platformTotal(recentPlatforms, "windows"),
        },
        devices: byName(recentDevices),
        operatingSystems: byName(recentSystems),
        browsers: byName(recentBrowsers),
        daily,
      };
    }),
    admin: adminProcedure.query(async () => {
      const config = await readDownloadPageConfig();
      return config ?? { mode: null, url: null, fileKey: null, fileName: `${DEFAULT_DOWNLOAD_APP_NAME}.apk`, appName: DEFAULT_DOWNLOAD_APP_NAME, version: "1.0.0", windowsUrl: "", windowsFileName: "ElBarzily-Windows.exe", supportLink: "/support", supportNumbers: [] };
    }),
    save: adminProcedure
      .input(z.object({
        mode: z.enum(["upload", "url"]).nullable().default(null),
        fileKey: z.string().min(1).max(512).optional(),
        url: z.string().max(2048).optional(),
        appName: z.string().trim().min(1).max(160).default(DEFAULT_DOWNLOAD_APP_NAME),
        version: z.string().trim().max(40).default("1.0.0"),
        windowsUrl: z.string().trim().max(2048).default(""),
        windowsFileName: z.string().trim().min(1).max(180).default("ElBarzily-Windows.exe"),
        supportNumbers: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
        supportLink: z.string().trim().max(500).default("/support"),
      }))
      .mutation(async ({ ctx, input }) => {
        let url = "";
        let fileKey: string | undefined;
        if (input.mode === "upload") {
          const requestedFileKey = input.fileKey;
          if (!requestedFileKey || !requestedFileKey.startsWith("downloads/")) throw new TRPCError({ code: "BAD_REQUEST", message: "ملف APK المرفوع غير صالح." });
          const db = await dbOrThrow();
          const asset = (await db.select({ key: uploadedAssets.key, mimeType: uploadedAssets.mimeType })
            .from(uploadedAssets).where(eq(uploadedAssets.key, requestedFileKey)).limit(1))[0];
          if (!asset || asset.mimeType !== "application/vnd.android.package-archive") fail("لم يتم العثور على ملف APK صالح في التخزين.");
          fileKey = asset.key;
          url = `/manus-storage/${asset.key}`;
        } else if (input.mode === "url") {
          const directUrl = input.url;
          if (!directUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "أدخل رابط تنزيل مباشر." });
          let parsed: URL;
          try { parsed = new URL(directUrl); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "رابط التنزيل غير صالح." }); }
          if (parsed.protocol !== "https:" || parsed.username || parsed.password) fail("يجب أن يكون رابط التنزيل آمناً ويبدأ بـ HTTPS.");
          url = parsed.toString();
        }

        let windowsUrl = "";
        if (input.windowsUrl) {
          if (/^\/manus-storage\/[A-Za-z0-9._/ -]+$/.test(input.windowsUrl) && !input.windowsUrl.includes("..")) {
            windowsUrl = input.windowsUrl;
          } else {
          let windowsAddress: URL;
          try { windowsAddress = new URL(input.windowsUrl); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "رابط نسخة Windows غير صالح." }); }
          if (windowsAddress.protocol !== "https:" || windowsAddress.username || windowsAddress.password)
            fail("رابط نسخة Windows يجب أن يكون HTTPS دون بيانات دخول مضمّنة.");
          windowsUrl = windowsAddress.toString();
          }
        }

        let supportNumbers: string[];
        try {
          supportNumbers = normalizeWhatsAppNumbers(input.supportNumbers.flatMap(value => value.split(/[\n,;]+/)).filter(Boolean));
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "رقم WhatsApp غير صالح." });
        }

        const supportLink = input.supportLink || "/support";
        if (supportLink !== "/support" && !/^(mailto:|tel:)/i.test(supportLink)) {
          let supportUrl: URL;
          try { supportUrl = new URL(supportLink); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "رابط الدعم غير صالح." }); }
          if (supportUrl.protocol !== "https:" || supportUrl.username || supportUrl.password) fail("رابط الدعم يجب أن يكون HTTPS أو بريداً أو هاتفاً.");
        }
        const config: DownloadPageConfig = {
          mode: input.mode,
          url,
          fileKey,
          fileName: `${input.appName.replace(/\.apk$/i, "")}.apk`,
          appName: input.appName,
          version: input.version,
          windowsUrl,
          windowsFileName: input.windowsFileName,
          supportLink,
          supportNumbers,
        };
        const db = await dbOrThrow();
        await db.insert(platformSettings).values({
          key: DOWNLOAD_SETTINGS_KEY,
          value: JSON.stringify(config),
          updatedBy: ctx.user.id,
        }).onConflictDoNothing();
        return { saved: true, config };
      }),
  }),

  rewards: router({
    catalog: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      return { items: await db.select({ id: rewards.id, name: rewards.name, description: rewards.description, imageUrl: rewards.imageUrl, rewardType: rewards.rewardType, costPoints: rewards.costPoints, terms: rewards.terms, expiresInDays: rewards.expiresInDays, authorizedType: rewards.authorizedType, authorizedPitchId: rewards.authorizedPitchId }).from(rewards).where(eq(rewards.isActive, true)).orderBy(rewards.costPoints, desc(rewards.createdAt)) };
    }),
    balance: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const account = (await db.select({ balance: pointAccounts.balance }).from(pointAccounts).where(eq(pointAccounts.userId, ctx.user.id)).limit(1))[0];
      return { balance: account?.balance ?? 0 };
    }),
    history: protectedProcedure.query(async ({ ctx }) => {
      const db = await dbOrThrow();
      const rows = await db.select({ redemption: rewardRedemptions, reward: rewards })
        .from(rewardRedemptions).innerJoin(rewards, eq(rewardRedemptions.rewardId, rewards.id))
        .where(eq(rewardRedemptions.userId, ctx.user.id)).orderBy(desc(rewardRedemptions.issuedAt)).limit(200);
      return {
        items: rows.map(row => {
          const expired = row.redemption.status === "valid" && row.redemption.expiresAt && row.redemption.expiresAt.getTime() <= Date.now();
          return {
            id: row.redemption.id,
            rewardId: row.reward.id,
            rewardName: row.redemption.rewardNameSnapshot,
            description: row.reward.description,
            imageUrl: row.reward.imageUrl,
            rewardType: row.reward.rewardType,
            pointsCost: row.redemption.pointsCost,
            terms: row.reward.terms,
            authorizedType: row.redemption.authorizedTypeSnapshot,
            authorizedPitchId: row.redemption.authorizedPitchIdSnapshot,
            issuedAt: row.redemption.issuedAt,
            expiresAt: row.redemption.expiresAt,
            status: expired ? "expired" : row.redemption.status,
            usedAt: row.redemption.usedAt,
            backupCode: decryptVoucherValue(row.redemption.encryptedBackupCode),
            qrValue: decryptVoucherValue(row.redemption.encryptedVerificationToken),
          };
        }),
      };
    }),
    redeem: protectedProcedure.input(z.object({ rewardId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const reward = (await tx.select().from(rewards).where(and(eq(rewards.id, input.rewardId), eq(rewards.isActive, true))).limit(1).for("update"))[0];
        if (!reward) fail("المكافأة غير متاحة حالياً", "NOT_FOUND");
        if (reward.costPoints <= 0) fail("تكلفة المكافأة غير صالحة");
        const account = (await tx.select().from(pointAccounts).where(eq(pointAccounts.userId, ctx.user.id)).limit(1).for("update"))[0];
        if (!account || account.balance < reward.costPoints) fail("رصيد النقاط غير كافٍ لاستبدال هذه المكافأة", "BAD_REQUEST");
        const token = voucherToken();
        const backupCode = voucherBackupCode();
        const expiresAt = reward.expiresInDays && reward.expiresInDays > 0 ? new Date(Date.now() + reward.expiresInDays * 24 * 60 * 60 * 1000) : null;
        const nextBalance = account.balance - reward.costPoints;
        const redemption = await tx.insert(rewardRedemptions).values({
          rewardId: reward.id,
          userId: ctx.user.id,
          pointsCost: reward.costPoints,
          rewardNameSnapshot: reward.name,
          authorizedTypeSnapshot: reward.authorizedType,
          authorizedPitchIdSnapshot: reward.authorizedPitchId,
          verificationTokenHash: hashVoucherValue(token),
          encryptedVerificationToken: encryptVoucherValue(token),
          backupCodeHash: hashVoucherValue(normalizeVoucherCode(backupCode)),
          encryptedBackupCode: encryptVoucherValue(backupCode),
          expiresAt,
        }).returning({ id: rewardRedemptions.id });
        const redemptionId = Number(redemption[0].id);
        await tx.update(pointAccounts).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(pointAccounts.id, account.id));
        await tx.insert(pointTransactions).values({ userId: ctx.user.id, amount: -reward.costPoints, balanceAfter: nextBalance, kind: "redeem", referenceType: "reward_redemption", referenceId: redemptionId, note: reward.name });
        return { id: redemptionId, balance: nextBalance, rewardName: reward.name, qrValue: token, backupCode, expiresAt };
      });
    }),
    verify: protectedProcedure.input(z.object({ token: z.string().trim().min(8).max(256).optional(), backupCode: z.string().trim().min(8).max(64).optional() }).refine(input => Boolean(input.token || input.backupCode), "أدخل QR أو رمز القسيمة" )).query(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      const tokenHash = input.token ? hashVoucherValue(input.token) : null;
      const backupHash = input.backupCode ? hashVoucherValue(normalizeVoucherCode(input.backupCode)) : null;
      const rows = await db.select({ redemption: rewardRedemptions, reward: rewards, player: users })
        .from(rewardRedemptions).innerJoin(rewards, eq(rewardRedemptions.rewardId, rewards.id)).innerJoin(users, eq(rewardRedemptions.userId, users.id))
        .where(tokenHash ? eq(rewardRedemptions.verificationTokenHash, tokenHash) : eq(rewardRedemptions.backupCodeHash, backupHash!)).limit(1);
      const row = rows[0];
      if (!row) fail("القسيمة غير موجودة أو رمزها غير صحيح", "NOT_FOUND");
      if (row.redemption.userId === ctx.user.id) fail("لا يمكن للاعب تأكيد استرداد قسيمته", "FORBIDDEN");
      const expired = row.redemption.status === "valid" && row.redemption.expiresAt && row.redemption.expiresAt.getTime() <= Date.now();
      const status = expired ? "expired" : row.redemption.status;
      const authorized = status === "valid" && await canConfirmRewardVoucher(db, ctx.user, { authorizedType: row.redemption.authorizedTypeSnapshot, authorizedPitchId: row.redemption.authorizedPitchIdSnapshot });
      if (!(await canConfirmRewardVoucher(db, ctx.user, { authorizedType: row.redemption.authorizedTypeSnapshot, authorizedPitchId: row.redemption.authorizedPitchIdSnapshot }))) fail("هذا الحساب غير مخول للتحقق من هذه المكافأة", "FORBIDDEN");
      return {
        id: row.redemption.id,
        rewardName: row.redemption.rewardNameSnapshot,
        rewardDescription: row.reward.description,
        imageUrl: row.reward.imageUrl,
        rewardType: row.reward.rewardType,
        pointsCost: row.redemption.pointsCost,
        terms: row.reward.terms,
        playerName: row.player.name || "لاعب",
        issuedAt: row.redemption.issuedAt,
        expiresAt: row.redemption.expiresAt,
        status,
        authorizedType: row.redemption.authorizedTypeSnapshot,
        authorizedPitchId: row.redemption.authorizedPitchIdSnapshot,
        usedAt: row.redemption.usedAt,
        canConfirm: Boolean(authorized),
      };
    }),
    confirm: protectedProcedure.input(z.object({ redemptionId: z.number().int().positive(), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();
      return db.transaction(async tx => {
        const row = (await tx.select({ redemption: rewardRedemptions, reward: rewards, player: users }).from(rewardRedemptions).innerJoin(rewards, eq(rewardRedemptions.rewardId, rewards.id)).innerJoin(users, eq(rewardRedemptions.userId, users.id)).where(eq(rewardRedemptions.id, input.redemptionId)).limit(1).for("update"))[0];
        if (!row) fail("القسيمة غير موجودة", "NOT_FOUND");
        if (row.redemption.userId === ctx.user.id) fail("لا يمكن للاعب تأكيد استرداد قسيمته", "FORBIDDEN");
        if (!(await canConfirmRewardVoucher(tx, ctx.user, { authorizedType: row.redemption.authorizedTypeSnapshot, authorizedPitchId: row.redemption.authorizedPitchIdSnapshot }))) fail("هذا الحساب غير مخول لتأكيد هذه المكافأة", "FORBIDDEN");
        if (row.redemption.status !== "valid") fail(row.redemption.status === "used" ? "تم استخدام القسيمة من قبل" : "القسيمة غير صالحة للتسليم", "BAD_REQUEST");
        if (row.redemption.expiresAt && row.redemption.expiresAt.getTime() <= Date.now()) {
          await tx.update(rewardRedemptions).set({ status: "expired", updatedAt: new Date() }).where(and(eq(rewardRedemptions.id, input.redemptionId), eq(rewardRedemptions.status, "valid")));
          return { success: false, redemptionId: input.redemptionId, expired: true, message: "انتهت صلاحية القسيمة." };
        }
        const result = await tx.update(rewardRedemptions).set({ status: "used", usedAt: new Date(), usedBy: ctx.user.id, useNote: input.note || null, updatedAt: new Date() }).where(and(eq(rewardRedemptions.id, input.redemptionId), eq(rewardRedemptions.status, "valid")));
        if (!Number((result as any).affectedRows ?? 1)) fail("تعذر تأكيد القسيمة؛ أعد التحقق من الخادم", "BAD_REQUEST");
        await tx.insert(notifications).values({ userId: row.redemption.userId, title: "تم تسليم مكافأتك", body: `تم تأكيد استخدام قسيمة «${row.redemption.rewardNameSnapshot}».`, type: "reward_redeemed" });
        await tx.insert(adminAuditLogs).values({ actorId: ctx.user.id, action: "reward.voucher_confirmed", targetType: "reward_redemption", targetId: input.redemptionId, details: { rewardType: row.reward.rewardType, note: input.note || null } as any });
        return { success: true, redemptionId: input.redemptionId, message: "تم تأكيد تسليم المكافأة بنجاح." };
      });
    }),
  }),

  owner: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      if (!canOwn(ctx.user.role))
        fail("Owner permission required", "FORBIDDEN");
      assertActiveOwnerSubscription(ctx.user);
      const db = await dbOrThrow();
      const owned = await db
        .select()
        .from(pitches)
        .where(eq(pitches.ownerId, ctx.user.id))
        .orderBy(desc(pitches.createdAt));
      const pitchIds = owned.map(p => p.id);
      const [bookingRows, fieldItems, slotItems, walletAccount, captainItems] =
        await Promise.all([
          pitchIds.length
            ? db
                .select({
                  booking: bookings,
                  player: users,
                  pitch: pitches,
                  schedule: schedules,
                })
                .from(bookings)
                .innerJoin(users, eq(bookings.playerId, users.id))
                .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
                .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
                .where(inArray(bookings.pitchId, pitchIds))
                .orderBy(desc(bookings.createdAt))
                .limit(100)
            : Promise.resolve([]),
          pitchIds.length
            ? db
                .select()
                .from(pitchFields)
                .where(inArray(pitchFields.pitchId, pitchIds))
                .orderBy(pitchFields.id)
            : Promise.resolve([]),
          pitchIds.length
            ? db
                .select()
                .from(schedules)
                .where(inArray(schedules.pitchId, pitchIds))
                .orderBy(schedules.startsAt)
                .limit(500)
            : Promise.resolve([]),
          db
            .select()
            .from(walletAccounts)
            .where(eq(walletAccounts.userId, ctx.user.id))
            .limit(1),
          pitchIds.length
            ? db
                .select({
                  id: pitchCaptains.id,
                  pitchId: pitchCaptains.pitchId,
                  name: pitchCaptains.name,
                  phone: pitchCaptains.phone,
                  isActive: pitchCaptains.isActive,
                })
                .from(pitchCaptains)
                .where(inArray(pitchCaptains.pitchId, pitchIds))
                .orderBy(pitchCaptains.id)
            : Promise.resolve([]),
        ]);
      const bookingItems = bookingRows.map(row => {
        const { qrToken: _privateToken, ...booking } = row.booking;
        return {
          ...booking,
          startsAt: row.schedule.startsAt,
          endsAt: row.schedule.endsAt,
          price: row.schedule.price,
          pitchName: row.pitch.name,
          playerName: row.player.name,
          playerPhone: row.player.phone,
          playerEmail: row.player.email,
        };
      });
      return {
        pitch: owned[0] ?? null,
        pitches: owned,
        bookings: bookingItems,
        captains: captainItems,
        fields: fieldItems,
        slots: slotItems,
        wallet: { total: walletAccount[0]?.balance ?? "0", commission: "0" },
      };
    }),
    updateBookingSettings: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          vodafoneCashNumber: z.string().trim().max(32),
          bookingPaymentMode: z.enum(["arrival", "deposit"]),
          depositAmount: z.union([z.string(), z.number()]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          ctx.user.role !== "owner" ||
          !(await getPitchForOwner(ctx.user.id, input.pitchId))
        )
          fail("Pitch not found", "NOT_FOUND");
        assertActiveOwnerSubscription(ctx.user);
        const depositAmount = Number(input.depositAmount);
        if (!Number.isFinite(depositAmount) || depositAmount < 0)
          fail("مبلغ العربون غير صالح");
        if (
          input.bookingPaymentMode === "deposit" &&
          (!input.vodafoneCashNumber || depositAmount <= 0)
        )
          fail("وضع العربون يتطلب رقم Vodafone Cash ومبلغاً موجباً");
        const db = await dbOrThrow();
        await db
          .update(pitches)
          .set({
            vodafoneCashNumber: input.vodafoneCashNumber || null,
            bookingPaymentMode: input.bookingPaymentMode,
            depositAmount: String(depositAmount),
          })
          .where(eq(pitches.id, input.pitchId));
        return { success: true } as const;
      }),
    saveCaptains: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          captains: z
            .array(
              z.object({
                name: z.string().trim().min(2).max(160),
                phone: z.string().trim().min(3).max(32),
              })
            )
            .max(10),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          ctx.user.role !== "owner" ||
          !(await getPitchForOwner(ctx.user.id, input.pitchId))
        )
          fail("Pitch not found", "NOT_FOUND");
        assertActiveOwnerSubscription(ctx.user);
        const db = await dbOrThrow();
        await db.transaction(async tx => {
          await tx
            .delete(pitchCaptains)
            .where(eq(pitchCaptains.pitchId, input.pitchId));
          if (input.captains.length)
            await tx.insert(pitchCaptains).values(
              input.captains.map(captain => ({
                pitchId: input.pitchId,
                name: captain.name,
                phone: captain.phone,
                isActive: true,
              }))
            );
        });
        return { success: true } as const;
      }),
    fields: protectedProcedure
      .input(z.object({ pitchId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        if (
          !canOwn(ctx.user.role) ||
          !(await getPitchForOwner(ctx.user.id, input.pitchId))
        )
          fail("Pitch not found", "NOT_FOUND");
        const db = await dbOrThrow();
        return {
          items: await db
            .select()
            .from(pitchFields)
            .where(eq(pitchFields.pitchId, input.pitchId))
            .orderBy(pitchFields.id),
        };
      }),
    saveField: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          pitchId: z.number().int().positive(),
          name: z.string().min(2).max(120),
          sport: z.string().max(60).default("football"),
          capacity: z.number().int().min(1).max(100),
          hourlyPrice: z.union([z.string(), z.number()]),
          isActive: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          !canOwn(ctx.user.role) ||
          !(await getPitchForOwner(ctx.user.id, input.pitchId))
        )
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const db = await dbOrThrow();
        const { id, ...rest } = input;
        if (id) {
          await db
            .update(pitchFields)
            .set({ ...rest, hourlyPrice: String(rest.hourlyPrice) })
            .where(
              and(
                eq(pitchFields.id, id),
                eq(pitchFields.pitchId, input.pitchId)
              )
            );
          return { id };
        }
        const result = await db
          .insert(pitchFields)
          .values({ ...rest, hourlyPrice: String(rest.hourlyPrice) })
          .returning({ id: pitchFields.id });
        return { id: Number(result[0].id) };
      }),
    savePitch: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          name: z.string().min(2).max(180),
          description: z.string().max(5000).optional(),
          address: z.string().min(2).max(320),
          city: z.string().min(2).max(120),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          imageUrl: z.string().max(512).optional(),
          mapUrl: z.string().max(512).optional(),
          captainName: z.string().max(160).optional(),
          captainPhone: z.string().max(32).optional(),
          subPitchCount: z.number().int().min(1).max(20).default(1),
          morningPrice: z.union([z.string(), z.number()]).optional(),
          eveningPrice: z.union([z.string(), z.number()]).optional(),
          amenities: z.unknown().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOwn(ctx.user.role))
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const db = await dbOrThrow();
        const { id, ...rest } = input;
        const existing = id ? await getPitchForOwner(ctx.user.id, id) : undefined;
        if (id && !existing) fail("Pitch not found", "NOT_FOUND");
        const selectedImage = rest.imageUrl?.trim() || (existing?.imageUrl && !existing.imageUrl.includes("/manus-storage/") ? existing.imageUrl : "");
        let imageUrl = selectedImage;
        if (!imageUrl) {
          const rows = await db.select({ imageUrl: pitches.imageUrl }).from(pitches);
          const usedImages = new Set(rows.map(row => row.imageUrl).filter((value): value is string => Boolean(value)));
          if (existing?.imageUrl) usedImages.delete(existing.imageUrl);
          imageUrl = DEFAULT_PITCH_IMAGES.find(candidate => !usedImages.has(candidate)) || "";
        }
        if (!imageUrl) fail("تم استخدام الصور الجاهزة العشرين. ارفع صورة مختلفة لهذا الملعب.", "CONFLICT");
        const values = {
          ...rest,
          imageUrl,
          latitude:
            rest.latitude === undefined ? undefined : String(rest.latitude),
          longitude:
            rest.longitude === undefined ? undefined : String(rest.longitude),
          morningPrice:
            rest.morningPrice === undefined
              ? undefined
              : String(rest.morningPrice),
          eveningPrice:
            rest.eveningPrice === undefined
              ? undefined
              : String(rest.eveningPrice),
        };
        let pitchId: number;
        if (id) {
          await db
            .update(pitches)
            .set({
              ...values,
              status:
                existing?.status === "published" ||
                existing?.status === "rejected"
                  ? "pending"
                  : existing?.status ?? "draft",
            })
            .where(eq(pitches.id, id));
          pitchId = id;
        } else {
          const result = await db
            .insert(pitches)
            .values({ ownerId: ctx.user.id, ...values, status: "pending" })
            .returning({ id: pitches.id });
          pitchId = Number(result[0].id);
        }
        const existingFields = await db
          .select()
          .from(pitchFields)
          .where(eq(pitchFields.pitchId, pitchId))
          .orderBy(pitchFields.id);
        const fieldCount = input.subPitchCount;
        const basePrice = String(input.eveningPrice ?? input.morningPrice ?? 0);
        for (let index = existingFields.length; index < fieldCount; index++) {
          await db.insert(pitchFields).values({
            pitchId,
            name: `ملعب ${index + 1}`,
            sport: "football",
            capacity: 10,
            hourlyPrice: basePrice,
            isActive: true,
          });
        }
        for (const [index, field] of existingFields.entries()) {
          await db
            .update(pitchFields)
            .set({ isActive: index < fieldCount, hourlyPrice: basePrice })
            .where(eq(pitchFields.id, field.id));
        }
        const [savedPitch] = await db
          .select()
          .from(pitches)
          .where(eq(pitches.id, pitchId))
          .limit(1);
        if (!savedPitch) return { id: pitchId, emailSent: false, inAppNotified: false };
        const [owner] = await db
          .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        const savedFields = await db
          .select({
            name: pitchFields.name,
            sport: pitchFields.sport,
            capacity: pitchFields.capacity,
            hourlyPrice: pitchFields.hourlyPrice,
            isActive: pitchFields.isActive,
          })
          .from(pitchFields)
          .where(eq(pitchFields.pitchId, pitchId))
          .orderBy(pitchFields.id);
        const ownerDetails = owner ?? {
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          phone: null,
        };
        let inAppNotified = false;
        try {
          const admins = await db
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.role, ["admin", "super_admin"]));
          if (admins.length) {
            await db.insert(notifications).values(admins.map(admin => ({
              userId: admin.id,
              title: id ? "تحديث بيانات ملعب للمراجعة" : "طلب مراجعة ملعب جديد",
              body: `وصل طلب مراجعة ملعب «${savedPitch.name}» من ${ownerDetails.name?.trim() || ownerDetails.email || `حساب ${ownerDetails.id}`}. رقم الطلب #${pitchId}. افتح قسم مراجعة الملاعب لعرض جميع البيانات.`,
              type: "venue_submission",
            })));
            inAppNotified = true;
          }
        } catch {
          console.warn("[admin] pitch submission notification could not be stored");
        }
        const emailSent = await notifyAdminPitchSubmission({
          owner: ownerDetails,
          pitch: savedPitch,
          fields: savedFields,
          submittedAt: new Date(),
          updated: Boolean(id),
        });
        return { id: pitchId, emailSent, inAppNotified };
      }),
    publishSchedule: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          items: z
            .array(
              z.object({
                startsAt: z.string(),
                endsAt: z.string(),
                price: z.union([z.string(), z.number()]),
                depositAmount: z.union([z.string(), z.number()]).nullable().optional(),
              })
            )
            .min(1)
            .max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOwn(ctx.user.role))
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        if (!(await getPitchForOwner(ctx.user.id, input.pitchId)))
          fail("Pitch not found", "NOT_FOUND");
        const db = await dbOrThrow();
        const result = await publishScheduleItems(
          db,
          input.pitchId,
          input.fieldId,
          input.items
        );
        return { success: true, count: result.count };
      }),
    generateSchedule: protectedProcedure
      .input(
        z.object({
          pitchId: z.number().int().positive(),
          fieldId: z.number().int().positive(),
          date: z.string(),
          prompt: z.string().min(2).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (
          !canOwn(ctx.user.role) ||
          !(await getPitchForOwner(ctx.user.id, input.pitchId))
        )
          fail("Owner permission required", "FORBIDDEN");
        assertActiveOwnerSubscription(ctx.user);
        const db = await dbOrThrow();
        const field = (
          await db
            .select()
            .from(pitchFields)
            .where(
              and(
                eq(pitchFields.id, input.fieldId),
                eq(pitchFields.pitchId, input.pitchId),
                eq(pitchFields.isActive, true)
              )
            )
            .limit(1)
        )[0];
        if (!field) fail("Pitch field not found", "NOT_FOUND");
        const scheduleSchema = z.object({
          items: z
            .array(
              z.object({
                startsAt: z.string(),
                endsAt: z.string(),
                price: z.union([z.string(), z.number()]),
              })
            )
            .max(500),
        });
        const parsed = await invokeJsonWithFallback(
          {
            model: "gpt-5-mini",
            reasoning: { effort: "minimal" },
            messages: [
              {
                role: "system",
                content:
                  "حوّل طلب صاحب الملعب إلى مواعيد كرة قدم بتاريخ اليوم المحدد. أعد JSON فقط بالشكل {\"items\":[{\"startsAt\":\"ISO date time\",\"endsAt\":\"ISO date time\",\"price\":500}]}. كل الأوقات بتوقيت القاهرة المحلي Africa/Cairo، والسعر رقم. استخدم تاريخ البداية المحدد ولا تضف تاريخاً آخر.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  date: input.date,
                  prompt: input.prompt,
                  defaultHourlyPrice: field.hourlyPrice,
                }),
              },
            ],
            maxTokens: 2000,
          },
          value => scheduleSchema.safeParse(value).success
        );
        const candidate = scheduleSchema.safeParse(parsed);
        if (!candidate.success || !candidate.data)
          fail("لم يُنشئ الذكاء الاصطناعي مواعيد صالحة.");
        const candidateData = candidate.data!;
        if (!candidateData.items.length)
          fail("لم يُنشئ الذكاء الاصطناعي مواعيد صالحة.");
        const items = candidateData.items
          .map(slot => ({
            ...slot,
            startsAt: normalizeCairoWallTime(slot.startsAt),
            endsAt: normalizeCairoWallTime(slot.endsAt),
          }))
          .filter(slot => {
            const startsAt = new Date(slot.startsAt),
              endsAt = new Date(slot.endsAt);
            return (
              !Number.isNaN(startsAt.getTime()) &&
              !Number.isNaN(endsAt.getTime()) &&
              endsAt > startsAt &&
              Number.isFinite(Number(slot.price)) &&
              Number(slot.price) > 0 &&
              slot.startsAt.startsWith(input.date)
            );
          });
        if (!items.length)
          fail("لم يُنشئ الذكاء الاصطناعي مواعيد صالحة للتاريخ المحدد.");
        const saved = await publishScheduleItems(
          db,
          input.pitchId,
          input.fieldId,
          items
        );
        return {
          items: saved.items.map(slot => ({
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            price: slot.price,
          })),
        };
      }),
  }),

  adminAssistant: adminAssistantRouter,
  ownerAssistant: ownerAssistantRouter,
  adminPortal: adminPortalRouter,
  admin: router({
    overview: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      const periodStart = new Date();
      periodStart.setUTCHours(0, 0, 0, 0);
      periodStart.setUTCDate(periodStart.getUTCDate() - 6);
      const [
        usersCount,
        pitchesCount,
        bookingsCount,
        reportCount,
        playerCount,
        ownerCount,
        pendingBookingCount,
        pendingSubscriptionCount,
        bookingRevenue,
        dailyUsers,
        dailyBookings,
      ] = await Promise.all([
        db.select({ value: sql<number>`count(*)` }).from(users),
        db.select({ value: sql<number>`count(*)` }).from(pitches),
        db.select({ value: sql<number>`count(*)` }).from(bookings),
        db
          .select({ value: sql<number>`count(*)` })
          .from(reports)
          .where(eq(reports.status, "open")),
        db
          .select({ value: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.accountType, "player")),
        db
          .select({ value: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.accountType, "owner")),
        db
          .select({ value: sql<number>`count(*)` })
          .from(bookings)
          .where(eq(bookings.status, "pending")),
        db
          .select({ value: sql<number>`count(*)` })
          .from(subscriptionRequests)
          .where(eq(subscriptionRequests.status, "pending")),
        db.select({ value: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.status} = 'approved' AND ${bookings.paymentMethod} IN ('deposit', 'full') THEN ${bookings.paymentAmount} ELSE 0 END), 0)` }).from(bookings),
        db.select({ createdAt: users.createdAt })
          .from(users)
          .where(gte(users.createdAt, periodStart)),
        db.select({
          createdAt: bookings.createdAt,
          status: bookings.status,
          paymentMethod: bookings.paymentMethod,
          paymentAmount: bookings.paymentAmount,
        })
          .from(bookings)
          .where(gte(bookings.createdAt, periodStart)),
      ]);
      const activity = new Map<string, { day: string; users: number; bookings: number; revenue: number }>();
      for (let offset = 0; offset < 7; offset += 1) {
        const dayDate = new Date(periodStart);
        dayDate.setUTCDate(periodStart.getUTCDate() + offset);
        const day = dayDate.toISOString().slice(0, 10);
        activity.set(day, { day, users: 0, bookings: 0, revenue: 0 });
      }
      for (const row of dailyUsers) {
        const day = new Date(row.createdAt).toISOString().slice(0, 10);
        const point = activity.get(day);
        if (point) point.users += 1;
      }
      for (const row of dailyBookings) {
        const day = new Date(row.createdAt).toISOString().slice(0, 10);
        const point = activity.get(day);
        if (point) {
          point.bookings += 1;
          if (row.status === "approved" && (row.paymentMethod === "deposit" || row.paymentMethod === "full")) {
            point.revenue += Number(row.paymentAmount ?? 0);
          }
        }
      }
      return {
        users: Number(usersCount[0]?.value ?? 0),
        pitches: Number(pitchesCount[0]?.value ?? 0),
        bookings: Number(bookingsCount[0]?.value ?? 0),
        players: Number(playerCount[0]?.value ?? 0),
        owners: Number(ownerCount[0]?.value ?? 0),
        pendingBookings: Number(pendingBookingCount[0]?.value ?? 0),
        pendingSubscriptions: Number(pendingSubscriptionCount[0]?.value ?? 0),
        openReports: Number(reportCount[0]?.value ?? 0),
        revenue: Number(bookingRevenue[0]?.value ?? 0),
        dailyActivity: [...activity.values()],
      };
    }),
    smartReceiptVerification: adminProcedure.query(async () => ({
      enabled: await isSmartReceiptVerificationEnabled(),
    })),
    setSmartReceiptVerification: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        await db.insert(platformSettings).values({
          key: "smart_receipt_verification",
          value: input.enabled ? "true" : "false",
          updatedBy: ctx.user.id,
        }).onConflictDoNothing();
        return { enabled: input.enabled } as const;
      }),
    users: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      return {
        items: await db
          .select({
            id: users.id,
            openId: users.openId,
            name: users.name,
            email: users.email,
            phone: users.phone,
            accountType: users.accountType,
            role: users.role,
            isSuspended: users.isSuspended,
            moderatorPermissions: users.moderatorPermissions,
            lastSeenAt: users.lastSeenAt,
            ownerSubscriptionExpiresAt: users.ownerSubscriptionExpiresAt,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt)),
      };
    }),
    qrLogs: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db
        .select({
          id: qrLogs.id,
          userId: qrLogs.userId,
          bookingId: qrLogs.bookingId,
          action: qrLogs.action,
          createdAt: qrLogs.createdAt,
          pitchName: pitches.name,
        })
        .from(qrLogs)
        .leftJoin(bookings, eq(qrLogs.bookingId, bookings.id))
        .leftJoin(pitches, eq(bookings.pitchId, pitches.id))
        .orderBy(desc(qrLogs.createdAt))
        .limit(200);
      return { items: rows };
    }),
    bookings: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db
        .select({
          booking: bookings,
          player: users,
          pitch: pitches,
          schedule: schedules,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.playerId, users.id))
        .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
        .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
        .orderBy(desc(bookings.createdAt))
        .limit(500);
      return {
        items: rows.map(row => {
          const { qrToken: _privateToken, ...booking } = row.booking;
          return {
            ...booking,
            pitchName: row.pitch.name,
            startsAt: row.schedule.startsAt,
            endsAt: row.schedule.endsAt,
            price: row.schedule.price,
            playerName: row.player.name,
            playerPhone: row.player.phone,
            playerEmail: row.player.email,
          };
        }),
      };
    }),
    reviewBooking: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum(["approved", "rejected", "cancelled"]),
        note: z.string().trim().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const pitchRow = (await db.select({ pitchName: pitches.name, playerId: bookings.playerId, currentStatus: bookings.status })
          .from(bookings).innerJoin(pitches, eq(bookings.pitchId, pitches.id))
          .where(eq(bookings.id, input.id)).limit(1))[0];
        if (!pitchRow) fail("الحجز غير موجود", "NOT_FOUND");
        if (input.status === "approved" && pitchRow.currentStatus !== "pending") fail("لا يمكن قبول الحجز في حالته الحالية");
        if (input.status === "rejected" && pitchRow.currentStatus !== "pending") fail("لا يمكن رفض الحجز بعد مراجعته");
        if (input.status === "cancelled" && !["pending", "approved"].includes(pitchRow.currentStatus)) fail("لا يمكن إلغاء الحجز في حالته الحالية");
        const qrToken = input.status === "approved" ? randomBytes(32).toString("hex") : null;
        await db.update(bookings).set({ status: input.status, qrToken, reviewNote: input.note || null, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(bookings.id, input.id));
        await db.insert(notifications).values({
          userId: pitchRow.playerId,
          title: "تحديث الحجز من الإدارة",
          body: input.status === "approved" ? `تم قبول حجزك في ${pitchRow.pitchName} وإصدار رمز QR` : input.status === "rejected" ? `تم رفض حجزك${input.note ? `: ${input.note}` : ""}` : `تم إلغاء حجزك من الإدارة${input.note ? `: ${input.note}` : ""}`,
          type: "booking",
        });
        await recordAdminAudit(ctx.user.id, "admin.booking_reviewed", "booking", input.id, { status: input.status, note: input.note });
        void sendBookingStatusEmail(input.id, input.note);
        return { success: true, status: input.status } as const;
      }),
    subscriptionRequests: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      return {
        items: await db
          .select()
          .from(subscriptionRequests)
          .orderBy(desc(subscriptionRequests.createdAt)),
      };
    }),
    reviewSubscription: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const row = (
          await db
            .select()
            .from(subscriptionRequests)
            .where(eq(subscriptionRequests.id, input.id))
            .limit(1)
        )[0];
        if (!row) fail("Subscription request not found", "NOT_FOUND");
        const plan = (await db.select({ durationDays: ownerPlans.durationDays }).from(ownerPlans).where(eq(ownerPlans.id, row.planId)).limit(1))[0];
        if (!plan) fail("Subscription plan not found", "NOT_FOUND");
        await db
          .update(subscriptionRequests)
          .set({
            status: input.status,
            reviewNote: input.note,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
          })
          .where(eq(subscriptionRequests.id, input.id));
        if (input.status === "approved")
          await db
            .update(users)
            .set({ role: "owner", accountType: "owner", ownerSubscriptionExpiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000) })
            .where(eq(users.id, row.ownerId));
        await db.insert(notifications).values({
          userId: row.ownerId,
          title: "تحديث الاشتراك",
          body:
            input.status === "approved"
              ? "تم قبول الاشتراك وتفعيل حساب الملعب"
              : `تم رفض الاشتراك${input.note ? `: ${input.note}` : ""}`,
          type: "subscription",
        });
        return { success: true } as const;
      }),
    pitches: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      return {
        items: await db
          .select()
          .from(pitches)
          .where(inArray(pitches.status, ["pending", "draft"]))
          .orderBy(desc(pitches.createdAt)),
      };
    }),
    reviewPitch: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          decision: z.enum(["approve", "reject"]),
          reason: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const row = (
          await db
            .select()
            .from(pitches)
            .where(eq(pitches.id, input.id))
            .limit(1)
        )[0];
        if (!row) fail("Pitch not found", "NOT_FOUND");
        const status = input.decision === "approve" ? "published" : "rejected";
        await db
          .update(pitches)
          .set({ status })
          .where(eq(pitches.id, input.id));
        await db.insert(notifications).values({
          userId: row.ownerId,
          title: "مراجعة صفحة الملعب",
          body:
            status === "published"
              ? "تم اعتماد صفحة ملعبك ونشرها للاعبين"
              : `لم يتم اعتماد صفحة الملعب${input.reason ? `: ${input.reason}` : ""}`,
          type: "pitch",
        });
        return { success: true } as const;
    }),
    allPitches: adminProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db.select({ pitch: pitches, ownerName: users.name, ownerEmail: users.email, ownerPhone: users.phone })
        .from(pitches).leftJoin(users, eq(pitches.ownerId, users.id))
        .orderBy(desc(pitches.updatedAt)).limit(500);
      const pitchIds = rows.map(row => row.pitch.id);
      const fields = pitchIds.length
        ? await db.select().from(pitchFields).where(inArray(pitchFields.pitchId, pitchIds)).orderBy(pitchFields.pitchId, pitchFields.id)
        : [];
      const fieldsByPitch = new Map<number, typeof fields>();
      for (const field of fields) {
        const current = fieldsByPitch.get(field.pitchId) ?? [];
        current.push(field);
        fieldsByPitch.set(field.pitchId, current);
      }
      return {
        items: rows.map(row => ({ ...row, fields: fieldsByPitch.get(row.pitch.id) ?? [] })),
      };
    }),
    updatePitchStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["published", "suspended", "rejected", "draft"]), reason: z.string().trim().max(2000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const pitch = (await db.select({ id: pitches.id, ownerId: pitches.ownerId, name: pitches.name }).from(pitches).where(eq(pitches.id, input.id)).limit(1))[0];
        if (!pitch) fail("الملعب غير موجود", "NOT_FOUND");
        await db.update(pitches).set({ status: input.status }).where(eq(pitches.id, input.id));
        await db.insert(notifications).values({
          userId: pitch.ownerId,
          title: "تحديث حالة الملعب",
          body: input.status === "published" ? `تم نشر ملعب ${pitch.name}` : `تم تغيير حالة ملعب ${pitch.name}${input.reason ? `: ${input.reason}` : ""}`,
          type: "pitch",
        });
        await recordAdminAudit(ctx.user.id, "admin.pitch_status_updated", "pitch", input.id, { status: input.status, reason: input.reason });
        return { success: true } as const;
      }),
    updateSettings: adminProcedure
      .input(
        z.object({
          key: z.string().min(1).max(120),
          value: z.string().max(10000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const key = input.key.trim();
        assertAdminAccess(ctx.user, "admin.updateSettings", key);
        const db = await dbOrThrow();
        await db
          .insert(platformSettings)
          .values({ ...input, key, updatedBy: ctx.user.id })
          .onConflictDoNothing();
        return { success: true } as const;
      }),
    createPlan: adminProcedure
      .input(
        z.object({
          name: z.string().min(2).max(120),
          description: z.string().max(4000).optional(),
          imageUrl: z.string().max(512).optional(),
          price: z.union([z.string(), z.number()]),
          durationDays: z.number().int().min(1).max(3650),
        })
      )
      .mutation(async ({ input }) => {
        const db = await dbOrThrow();
        const existingImages = await db.select({ imageUrl: ownerPlans.imageUrl }).from(ownerPlans);
        const usedImages = new Set(existingImages.map(plan => plan.imageUrl).filter((value): value is string => Boolean(value)));
        const imageUrl = input.imageUrl?.trim() || DEFAULT_PLAN_IMAGES.find(candidate => !usedImages.has(candidate)) || null;
        const result = await db
          .insert(ownerPlans)
          .values({ ...input, imageUrl, price: String(input.price), isActive: true })
          .returning({ id: ownerPlans.id });
        return { id: Number(result[0].id) };
      }),
    updatePlan: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(2).max(120).optional(),
          description: z.string().max(4000).optional(),
          imageUrl: z.string().max(512).optional(),
          price: z.union([z.string(), z.number()]).optional(),
          durationDays: z.number().int().min(1).max(3650).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await dbOrThrow();
        const { id, price, ...rest } = input;
        await db
          .update(ownerPlans)
          .set({
            ...rest,
            ...(price === undefined ? {} : { price: String(price) }),
          })
          .where(eq(ownerPlans.id, id));
        return { success: true } as const;
      }),
    updateModerator: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: roleSchema.optional(),
          isSuspended: z.boolean().optional(),
          permissions: z.array(z.enum(MODERATOR_PERMISSION_IDS)).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await dbOrThrow();
        const target = (
          await db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1)
        )[0];
        if (!target) fail("User not found", "NOT_FOUND");
        if (!isAdmin(ctx.user.role)) {
          if (
            !hasModeratorScope(ctx.user, "suspend") ||
            input.role !== undefined ||
            input.permissions !== undefined ||
            input.isSuspended === undefined
          )
            fail("A moderator may only suspend eligible accounts", "FORBIDDEN");
          if (target.role !== "player" && target.role !== "owner")
            fail(
              "This account cannot be suspended by a moderator",
              "FORBIDDEN"
            );
          await db
            .update(users)
            .set({ isSuspended: input.isSuspended })
            .where(eq(users.id, input.userId));
          return { success: true } as const;
        }
        if (
          target.role === "super_admin" ||
          (target.role === "admin" && ctx.user.role !== "super_admin")
        )
          fail("Only a super admin may modify this account", "FORBIDDEN");
        if (input.role === "super_admin")
          fail(
            "Only the bootstrap process can create a super admin",
            "FORBIDDEN"
          );
        if (input.role === "owner") {
          const approved = await db
            .select({ id: subscriptionRequests.id })
            .from(subscriptionRequests)
            .where(
              and(
                eq(subscriptionRequests.ownerId, input.userId),
                eq(subscriptionRequests.status, "approved")
              )
            )
            .limit(1);
          if (!approved.length)
            fail("يجب قبول طلب اشتراك صاحب الملعب أولاً", "FORBIDDEN");
        }
        const { userId, permissions, ...values } = input;
        const accountType =
          input.role === "owner" || input.role === "player"
            ? input.role
            : undefined;
        await db
          .update(users)
          .set({
            ...values,
            ...(accountType ? { accountType } : {}),
            ...(permissions === undefined
              ? input.role === "player" || input.role === "owner"
                ? { moderatorPermissions: [] }
                : {}
              : { moderatorPermissions: permissions }),
          })
          .where(eq(users.id, userId));
        await recordAdminAudit(ctx.user.id, "admin.user_updated", "user", userId, { role: input.role, isSuspended: input.isSuspended, permissions });
        return { success: true } as const;
      }),
    moderateMessage: adminProcedure
      .input(z.object({ messageId: z.number().int().positive(), reason: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!hasModeratorScope(ctx.user, "chats")) fail("Chat review permission required", "FORBIDDEN");
        const db = await dbOrThrow();
        const message = (await db.select({ id: chatMessages.id, roomId: chatMessages.roomId }).from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1))[0];
        if (!message) fail("الرسالة غير موجودة", "NOT_FOUND");
        await db.update(chatMessages).set({ deletedAt: new Date() }).where(and(eq(chatMessages.id, input.messageId), isNull(chatMessages.deletedAt)));
        await recordAdminAudit(ctx.user.id, "admin.chat_message_removed", "chat_message", input.messageId, { roomId: message.roomId, reason: input.reason });
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
import { MODERATOR_PERMISSION_IDS } from "@shared/adminPermissions";
