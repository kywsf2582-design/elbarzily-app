import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  bookings,
  ownerPlans,
  pitches,
  platformSettings,
  receiptVerifications,
  notifications,
  schedules,
  subscriptionRequests,
  users,
} from "../drizzle/schema.pg";
import { invokeJsonWithFallback } from "./aiJson";
import { getDb } from "./db";
import { storageGetSignedUrl } from "./storage";
import { sendBookingStatusEmail } from "./email/booking-mail";
import { extendOwnerSubscription } from "../shared/subscription";

const MODEL = "gpt-5-mini";
const SETTING_KEY = "smart_receipt_verification";

type ReceiptKind = "booking" | "subscription";
type Decision = "approved" | "rejected" | "manual";

type ModelResult = {
  verdict: "match" | "mismatch" | "uncertain";
  amount: number | null;
  wallet: string | null;
  confidence: number;
  reason: string;
};

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, character => {
    const code = character.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function normalizedWallet(value: string | null | undefined): string {
  const digits = normalizeDigits(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length >= 12) return `0${digits.slice(2)}`;
  return digits;
}

function walletMatches(expected: string, extracted: string | null): boolean {
  const a = normalizedWallet(expected);
  const b = normalizedWallet(extracted);
  if (!a || !b) return false;
  return a === b || (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10));
}

function amountMatches(expected: number, extracted: number | null): boolean {
  return extracted !== null && Number.isFinite(extracted) && Math.abs(expected - extracted) <= 0.01;
}

function validModelResult(value: unknown): value is ModelResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    (item.verdict === "match" || item.verdict === "mismatch" || item.verdict === "uncertain") &&
    (item.amount === null || (typeof item.amount === "number" && Number.isFinite(item.amount))) &&
    (item.wallet === null || typeof item.wallet === "string") &&
    typeof item.confidence === "number" && Number.isFinite(item.confidence) &&
    typeof item.reason === "string"
  );
}

async function smartEnabled(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  if (!db) return false;
  const row = await db.select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTING_KEY))
    .limit(1);
  return row[0]?.value === "true";
}

async function analyzeReceipt(input: {
  kind: ReceiptKind;
  referenceId: number;
  receiptUrl: string;
  expectedAmount: number;
  expectedWallet: string;
}): Promise<{ decision: Decision; result: ModelResult | null; reason: string }> {
  const key = input.receiptUrl.replace(/^\/manus-storage\//, "");
  if (!key || !input.expectedWallet || !Number.isFinite(input.expectedAmount)) {
    return { decision: "manual", result: null, reason: "بيانات الإيصال أو بيانات الدفع غير مكتملة." };
  }

  try {
    const imageUrl = await storageGetSignedUrl(key);
    const parsed = await invokeJsonWithFallback(
      {
        model: MODEL,
        reasoning: { effort: "minimal" },
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "أنت مدقق إيصالات تحويل مالي. حلل صورة الإيصال فقط ولا تخمّن. أعد JSON فقط بالشكل: {\"verdict\":\"match|mismatch|uncertain\",\"amount\":number|null,\"wallet\":string|null,\"confidence\":number,\"reason\":string}. استخرج المبلغ النهائي المدفوع ورقم المحفظة الظاهر كما هو. اعتبر الصورة غير الواضحة أو البيانات الناقصة uncertain. لا تعتبر رقم المرجع أو رقم الهاتف مبلغاً.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  kind: input.kind,
                  expectedAmount: input.expectedAmount,
                  expectedWallet: input.expectedWallet,
                  instruction: "طابق المبلغ ورقم المحفظة مع القيم المتوقعة. لا تعتمد على اسم الملف أو النص خارج الصورة.",
                }),
              },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
      },
      validModelResult
    );
    if (!validModelResult(parsed)) {
      return { decision: "manual", result: null, reason: "لم تُنتج الصورة نتيجة قابلة للتحقق." };
    }
    const result = parsed;
    const confidence = Math.max(0, Math.min(1, result.confidence));
    const amountOk = amountMatches(input.expectedAmount, result.amount);
    const walletOk = walletMatches(input.expectedWallet, result.wallet);
    if (result.verdict === "match" && confidence >= 0.86 && amountOk && walletOk) {
      return { decision: "approved", result: { ...result, confidence }, reason: "تطابق المبلغ ورقم المحفظة بثقة مرتفعة." };
    }
    const clearMismatch = result.verdict === "mismatch" || (result.amount !== null && !amountOk) || (result.wallet !== null && !walletOk);
    if (clearMismatch && confidence >= 0.90) {
      return { decision: "rejected", result: { ...result, confidence }, reason: result.reason || "الإيصال لا يطابق بيانات الدفع المطلوبة." };
    }
    return { decision: "manual", result: { ...result, confidence }, reason: result.reason || "تحتاج الصورة إلى مراجعة يدوية." };
  } catch {
    return { decision: "manual", result: null, reason: "تعذر تحليل الإيصال تلقائياً؛ أُرسل للمراجعة اليدوية." };
  }
}

async function saveVerification(input: {
  kind: ReceiptKind;
  referenceId: number;
  decision: Decision;
  expectedAmount: number;
  expectedWallet: string;
  result: ModelResult | null;
  reason: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(receiptVerifications).values({
    kind: input.kind,
    referenceId: input.referenceId,
    decision: input.decision,
    confidence: input.result ? String(input.result.confidence) : null,
    extractedAmount: input.result?.amount == null ? null : String(input.result.amount),
    extractedWallet: input.result?.wallet || null,
    expectedAmount: String(input.expectedAmount),
    expectedWallet: input.expectedWallet,
    reason: input.reason,
    model: MODEL,
  }).onConflictDoNothing();
}

export async function verifyBookingReceipt(bookingId: number): Promise<Decision> {
  const db = await getDb();
  if (!db || !(await smartEnabled(db))) return "manual";
  const row = (await db.select({ booking: bookings, pitch: pitches, schedule: schedules })
    .from(bookings)
    .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .where(eq(bookings.id, bookingId)).limit(1))[0];
  if (!row || row.booking.status !== "pending" || !row.booking.receiptUrl) return "manual";
  const expectedAmount = Number(row.booking.paymentAmount);
  const analysis = await analyzeReceipt({
    kind: "booking",
    referenceId: bookingId,
    receiptUrl: row.booking.receiptUrl,
    expectedAmount,
    expectedWallet: row.pitch.vodafoneCashNumber || "",
  });
  await saveVerification({ kind: "booking", referenceId: bookingId, expectedAmount, expectedWallet: row.pitch.vodafoneCashNumber || "", ...analysis });
  if (analysis.decision === "manual") return analysis.decision;

  const now = new Date();
  const approved = analysis.decision === "approved";
  await db.transaction(async tx => {
    const current = (await tx.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update"))[0];
    if (!current || current.status !== "pending") return;
    await tx.update(bookings).set({
      status: approved ? "approved" : "rejected",
      qrToken: approved ? randomBytes(32).toString("hex") : null,
      reviewNote: `التحقق الذكي: ${analysis.reason}`,
      reviewedAt: now,
    }).where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")));
    const booking = row.booking;
    await tx.insert(notifications).values({
      userId: booking.playerId,
      title: approved ? "تم تأكيد الحجز تلقائياً" : "تم رفض إيصال الحجز",
      body: approved ? "تم مطابقة الإيصال وتأكيد الحجز وإصدار QR." : `تم رفض الحجز تلقائياً: ${analysis.reason}`,
      type: "booking",
    });
  });
  void sendBookingStatusEmail(bookingId, analysis.reason);
  return analysis.decision;
}

export async function verifySubscriptionReceipt(requestId: number): Promise<Decision> {
  const db = await getDb();
  if (!db || !(await smartEnabled(db))) return "manual";
  const row = (await db.select({ request: subscriptionRequests, plan: ownerPlans })
    .from(subscriptionRequests)
    .innerJoin(ownerPlans, eq(subscriptionRequests.planId, ownerPlans.id))
    .where(eq(subscriptionRequests.id, requestId)).limit(1))[0];
  if (!row || row.request.status !== "pending") return "manual";
  const walletRow = await db.select({ value: platformSettings.value }).from(platformSettings)
    .where(eq(platformSettings.key, "vodafone_cash_number")).limit(1);
  const expectedWallet = walletRow[0]?.value?.trim() || "";
  const expectedAmount = Number(row.plan.price);
  const analysis = await analyzeReceipt({ kind: "subscription", referenceId: requestId, receiptUrl: row.request.receiptUrl, expectedAmount, expectedWallet });
  await saveVerification({ kind: "subscription", referenceId: requestId, expectedAmount, expectedWallet, ...analysis });
  if (analysis.decision === "manual") return analysis.decision;

  await db.transaction(async tx => {
    const current = (await tx.select({ status: subscriptionRequests.status, ownerId: subscriptionRequests.ownerId, durationDays: ownerPlans.durationDays, ownerSubscriptionExpiresAt: users.ownerSubscriptionExpiresAt })
      .from(subscriptionRequests).innerJoin(ownerPlans, eq(subscriptionRequests.planId, ownerPlans.id)).innerJoin(users, eq(users.id, subscriptionRequests.ownerId)).where(eq(subscriptionRequests.id, requestId)).limit(1).for("update"))[0];
    if (!current || current.status !== "pending") return;
    await tx.update(subscriptionRequests).set({
      status: analysis.decision === "approved" ? "approved" : "rejected",
      reviewNote: `التحقق الذكي: ${analysis.reason}`,
      reviewedAt: new Date(),
    }).where(and(eq(subscriptionRequests.id, requestId), eq(subscriptionRequests.status, "pending")));
    if (analysis.decision === "approved") {
      await tx.update(users).set({ role: "owner", accountType: "owner", ownerSubscriptionExpiresAt: extendOwnerSubscription(current.ownerSubscriptionExpiresAt, current.durationDays) }).where(eq(users.id, current.ownerId));
    }
    await tx.insert(notifications).values({
      userId: current.ownerId,
      title: analysis.decision === "approved" ? "تم تفعيل الاشتراك تلقائياً" : "تم رفض إيصال الاشتراك",
      body: analysis.decision === "approved" ? "تمت مطابقة الإيصال وتفعيل حساب الملعب." : `تم رفض الطلب تلقائياً: ${analysis.reason}`,
      type: "subscription",
    });
  });
  return analysis.decision;
}

export async function isSmartReceiptVerificationEnabled(): Promise<boolean> {
  const db = await getDb();
  return smartEnabled(db);
}
