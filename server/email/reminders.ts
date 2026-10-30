import { and, eq, gt, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { bookings, pitchFields, pitches, schedules, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { sendBookingReminderEmail, toEmailData, type BookingMailRow } from "./booking-mail";

const REMINDER_WINDOW_MS = 60 * 60 * 1000;
const REMINDER_BATCH_SIZE = 20;

function validEmail(value: string | null): value is string {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export async function processDueBookingReminders(now = new Date()): Promise<{ checked: number; sent: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const claimAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
  const until = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const due = await db.transaction(async tx => {
    const rows = await tx
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
      .where(and(
        eq(bookings.status, "approved"),
        gt(schedules.startsAt, now),
        lte(schedules.startsAt, until),
        isNull(bookings.reminderSentAt),
        isNotNull(users.email),
        ne(users.email, ""),
      ))
      .orderBy(schedules.startsAt)
      .limit(REMINDER_BATCH_SIZE)
      .for("update");

    const candidates = (rows as BookingMailRow[]).filter(row => validEmail(row.player.email));
    if (!candidates.length) return [] as BookingMailRow[];
    await tx.update(bookings)
      .set({ reminderSentAt: claimAt })
      .where(and(inArray(bookings.id, candidates.map(row => row.booking.id)), isNull(bookings.reminderSentAt)));
    return candidates;
  });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const to = row.player.email!.trim();
    const success = await sendBookingReminderEmail(to, toEmailData(row), now);
    if (success) {
      sent += 1;
      continue;
    }
    failed += 1;
    await db.update(bookings)
      .set({ reminderSentAt: null })
      .where(and(eq(bookings.id, row.booking.id), eq(bookings.reminderSentAt, claimAt)));
  }
  return { checked: due.length, sent, failed };
}
