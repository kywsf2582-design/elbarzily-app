import webpush from "web-push";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { notificationPreferences, pushSubscriptions } from "../drizzle/schema";

export type PushCategory = "chat" | "bookings" | "matches" | "social" | "calls";

export type PushPayload = {
  category: PushCategory;
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  tag?: string;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  actions?: Array<{ action: string; title: string }>;
};

export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

const preferenceField: Record<PushCategory, "chat" | "bookings" | "matches" | "social" | "calls"> = {
  chat: "chat",
  bookings: "bookings",
  matches: "matches",
  social: "social",
  calls: "calls",
};

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return true;
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function pushIsConfigured() {
  return configureVapid();
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export async function savePushSubscription(userId: number, subscription: StoredPushSubscription, userAgent?: string | null, deviceName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, 512) || null,
    deviceName: deviceName?.trim().slice(0, 120) || null,
    lastSeenAt: new Date(),
    disabledAt: null,
  }).onDuplicateKeyUpdate({
    set: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 512) || null,
      deviceName: deviceName?.trim().slice(0, 120) || null,
      lastSeenAt: new Date(),
      disabledAt: null,
    },
  });
  await db.insert(notificationPreferences).values({ userId }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
}

export async function removePushSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(pushSubscriptions).set({ disabledAt: new Date() }).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function readNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0];
  if (row) return row;
  await db.insert(notificationPreferences).values({ userId });
  return (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0];
}

export async function updateNotificationPreferences(userId: number, input: Partial<Pick<typeof notificationPreferences.$inferInsert, "chat" | "bookings" | "matches" | "social" | "calls" | "hideMessagePreview" | "mutedUntil">>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(notificationPreferences).values({ userId, ...input }).onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });
  return readNotificationPreferences(userId);
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload) {
  if (!userIds.length || !configureVapid()) return { sent: 0, skipped: true };
  const db = await getDb();
  if (!db) return { sent: 0, skipped: true };
  const subscriptions = await db.select().from(pushSubscriptions).where(and(inArray(pushSubscriptions.userId, Array.from(new Set(userIds))), isNull(pushSubscriptions.disabledAt)));
  if (!subscriptions.length) return { sent: 0, skipped: false };
  const preferenceRows = await db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, Array.from(new Set(userIds))));
  const preferences = new Map(preferenceRows.map(row => [row.userId, row]));
  let sent = 0;
  await Promise.all(subscriptions.map(async subscription => {
    const preference = preferences.get(subscription.userId);
    if (preference && !preference[preferenceField[payload.category]]) return;
    if (preference?.mutedUntil && preference.mutedUntil.getTime() > Date.now()) return;
    const body = payload.category === "chat" && preference?.hideMessagePreview ? "لديك رسالة جديدة" : payload.body;
    const data = {
      title: payload.title,
      body,
      icon: payload.icon || payload.senderAvatarUrl || "/app-icon-192.png",
      badge: payload.badge || "/app-icon-192.png",
      url: payload.url,
      tag: payload.tag || `${payload.category}-${subscription.userId}`,
      category: payload.category,
      senderName: payload.senderName || null,
      senderAvatarUrl: payload.senderAvatarUrl || null,
      actions: payload.actions || [],
    };
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(data), { TTL: 60 * 60 * 24 * 7 });
      sent += 1;
      await db.update(pushSubscriptions).set({ lastSeenAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.update(pushSubscriptions).set({ disabledAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        console.warn("[Push] delivery failed", { statusCode: error?.statusCode, category: payload.category });
      }
    }
  }));
  return { sent, skipped: false };
}
