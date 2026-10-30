import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, desc, eq, isNull } from "drizzle-orm";
import { authOtps, users } from "../drizzle/schema";
import { getDb } from "./db";
import { sendRenderedEmail } from "./email/service";
import { adminRegistrationEmail } from "./email/templates/admin-registration";
import { adminPitchSubmissionEmail, type AdminPitchSubmissionInput } from "./email/templates/admin-pitch-submission";
import { verificationEmail, type VerificationPurpose } from "./email/templates/verification";
import { welcomeEmail } from "./email/templates/welcome";

const scrypt = promisify(scryptCallback);
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

type OtpPurpose = "register" | "password_reset";

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashValue = async (value: string, salt: Buffer) =>
  (await scrypt(value, salt, 64)) as Buffer;

export async function hashPassword(password: string) {
  const salt = randomBytes(32);
  const derived = await hashValue(password, salt);
  return { hash: derived.toString("hex"), salt: salt.toString("hex") };
}

export async function verifyPassword(password: string, hash: string, saltHex: string) {
  const derived = await hashValue(password, Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function notifyAdminRegistration(input: { name: string; email: string; role: "player" | "owner" }) {
  const recipient = process.env.ADMIN_EMAIL?.trim();
  if (!recipient) return;
  try {
    await sendRenderedEmail(recipient, adminRegistrationEmail(input));
  } catch {
    // Registration must remain available if an optional administrator notice cannot be delivered.
  }
}

export async function notifyAdminPitchSubmission(input: AdminPitchSubmissionInput): Promise<boolean> {
  const recipient = process.env.ADMIN_EMAIL?.trim();
  if (!recipient) return false;
  try {
    await sendRenderedEmail(recipient, adminPitchSubmissionEmail(input));
    return true;
  } catch {
    console.warn("[mail] admin pitch submission notice failed");
    return false;
  }
}

export async function sendWelcomeEmail(input: { name: string | null; email: string | null; createdAt: Date }) {
  const recipient = input.email?.trim();
  if (!recipient) return;
  try {
    await sendRenderedEmail(recipient, welcomeEmail({ name: input.name, createdAt: input.createdAt }));
  } catch {
    // Welcome delivery is best-effort; account creation and login remain successful.
    console.warn("[mail] welcome email delivery failed");
  }
}

export async function requestOtp(emailInput: string, purpose: OtpPurpose, nameInput?: string) {
  const email = normalizeEmail(emailInput);
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  let recipientName = purpose === "register" ? nameInput?.trim() || null : null;
  if (purpose !== "register") {
    const matchedUser = await db.select({ name: users.name }).from(users).where(eq(users.email, email)).limit(1);
    recipientName = matchedUser[0]?.name ?? null;
  }
  const previous = await db.select().from(authOtps)
    .where(and(eq(authOtps.email, email), eq(authOtps.purpose, purpose), isNull(authOtps.consumedAt)))
    .orderBy(desc(authOtps.createdAt)).limit(1);
  const last = previous[0];
  if (last && Date.now() - last.lastSentAt.getTime() < OTP_RESEND_MS) {
    throw new Error("انتظر دقيقة قبل طلب رمز آخر.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(32);
  const codeHash = await hashValue(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const inserted = await db.insert(authOtps).values({
    email,
    purpose,
    codeHash: codeHash.toString("hex"),
    salt: salt.toString("hex"),
    expiresAt,
    lastSentAt: new Date(),
    attempts: 0,
  });
  try {
    await sendRenderedEmail(email, verificationEmail({ code, expiresAt, purpose, recipientName }));
  } catch (error) {
    await db.update(authOtps).set({ consumedAt: new Date() }).where(eq(authOtps.id, Number(inserted[0].insertId)));
    throw error;
  }
  return { accepted: true } as const;
}

export async function consumeOtp(emailInput: string, purpose: OtpPurpose, code: string) {
  const email = normalizeEmail(emailInput);
  if (!/^\d{6}$/.test(code)) return false;
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(authOtps)
    .where(and(eq(authOtps.email, email), eq(authOtps.purpose, purpose), isNull(authOtps.consumedAt)))
    .orderBy(desc(authOtps.createdAt)).limit(1);
  const record = rows[0];
  if (!record || record.expiresAt.getTime() <= Date.now() || record.attempts >= OTP_MAX_ATTEMPTS) return false;
  await db.update(authOtps).set({ attempts: record.attempts + 1 }).where(eq(authOtps.id, record.id));
  const candidate = await hashValue(code, Buffer.from(record.salt, "hex"));
  const expected = Buffer.from(record.codeHash, "hex");
  const valid = expected.length === candidate.length && timingSafeEqual(expected, candidate);
  if (valid) await db.update(authOtps).set({ consumedAt: new Date() }).where(eq(authOtps.id, record.id));
  return valid;
}

export async function findUserByEmail(emailInput: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(emailInput))).limit(1);
  return rows[0];
}

export function normalizeUserEmail(email: string) { return normalizeEmail(email); }
export function localOpenId() { return `local_${createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 56)}`; }
