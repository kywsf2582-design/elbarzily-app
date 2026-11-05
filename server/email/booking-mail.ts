import { eq } from "drizzle-orm";
import { bookings, pitchFields, pitches, schedules, users } from "../../drizzle/schema.pg";
import { getDb } from "../db";
import {
  bookingConfirmationEmail,
  type BookingEmailData,
} from "./templates/booking-confirmation";
import { bookingReminderEmail } from "./templates/booking-reminder";
import { bookingStatusEmail } from "./templates/booking-status";
import { sendRenderedEmail } from "./service";

type BookingMailRow = {
  booking: typeof bookings.$inferSelect;
  player: { name: string | null; email: string | null };
  pitch: { name: string; address: string | null; city: string | null };
  field: { name: string | null } | null;
  schedule: { startsAt: Date; endsAt: Date; price: string };
};

function toEmailData(row: BookingMailRow, reasonOverride?: string | null): BookingEmailData {
  return {
    bookingId: row.booking.id,
    recipientName: row.player.name,
    pitchName: row.pitch.name,
    fieldName: row.field?.name ?? null,
    address: row.pitch.address,
    city: row.pitch.city,
    startsAt: row.schedule.startsAt,
    endsAt: row.schedule.endsAt,
    totalPrice: row.schedule.price,
    paymentMethod: row.booking.paymentMethod,
    paymentAmount: row.booking.paymentAmount,
    receiptUrl: row.booking.receiptUrl,
    status: row.booking.status,
    reason: reasonOverride ?? row.booking.reviewNote,
  };
}

async function loadBookingMail(bookingId: number): Promise<{ to: string; data: BookingEmailData } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      booking: bookings,
      player: { name: users.name, email: users.email },
      pitch: { name: pitches.name, address: pitches.address, city: pitches.city },
      field: { name: pitchFields.name },
      schedule: { startsAt: schedules.startsAt, endsAt: schedules.endsAt, price: schedules.price },
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.playerId, users.id))
    .innerJoin(pitches, eq(bookings.pitchId, pitches.id))
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .leftJoin(pitchFields, eq(bookings.fieldId, pitchFields.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  const row = rows[0] as BookingMailRow | undefined;
  const to = row?.player.email?.trim();
  if (!row || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null;
  return { to, data: toEmailData(row) };
}

async function deliver(to: string, mail: ReturnType<typeof bookingConfirmationEmail>): Promise<boolean> {
  try {
    await sendRenderedEmail(to, mail);
    return true;
  } catch {
    // Never log recipient addresses, booking data, SMTP responses, or credentials.
    console.warn("[mail] booking message delivery failed");
    return false;
  }
}

export async function sendBookingConfirmationEmail(bookingId: number): Promise<boolean> {
  try {
    const message = await loadBookingMail(bookingId);
    if (!message) return false;
    return await deliver(message.to, bookingConfirmationEmail(message.data));
  } catch {
    console.warn("[mail] booking confirmation preparation failed");
    return false;
  }
}

export async function sendBookingStatusEmail(
  bookingId: number,
  reasonOverride?: string | null,
): Promise<boolean> {
  try {
    const message = await loadBookingMail(bookingId);
    if (!message) return false;
    const data = { ...message.data, reason: reasonOverride ?? message.data.reason };
    return await deliver(message.to, bookingStatusEmail(data));
  } catch {
    console.warn("[mail] booking status preparation failed");
    return false;
  }
}

export async function sendBookingReminderEmail(
  to: string,
  data: BookingEmailData,
  now = new Date(),
): Promise<boolean> {
  return deliver(to, bookingReminderEmail(data, now));
}

export { toEmailData, type BookingMailRow };
