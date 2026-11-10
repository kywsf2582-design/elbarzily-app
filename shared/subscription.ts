export type OwnerSubscriptionState = {
  status: "active" | "expired" | "missing";
  remainingMs: number;
  daysRemaining: number;
  hoursRemaining: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function timestamp(value: Date | string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function getOwnerSubscriptionState(
  expiresAt: Date | string | number | null | undefined,
  now = Date.now(),
): OwnerSubscriptionState {
  const expiry = timestamp(expiresAt);
  if (expiry === null) {
    return { status: "missing", remainingMs: 0, daysRemaining: 0, hoursRemaining: 0 };
  }
  const remainingMs = expiry - now;
  if (remainingMs <= 0) {
    return { status: "expired", remainingMs: 0, daysRemaining: 0, hoursRemaining: 0 };
  }
  return {
    status: "active",
    remainingMs,
    daysRemaining: Math.ceil(remainingMs / DAY_MS),
    hoursRemaining: Math.ceil(remainingMs / HOUR_MS),
  };
}

export function extendOwnerSubscription(
  currentExpiry: Date | string | null | undefined,
  durationDays: number,
  now = new Date(),
): Date {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new RangeError("Subscription duration must be a positive whole number of days");
  }
  const nowMs = now.getTime();
  const expiry = timestamp(currentExpiry);
  const base = expiry !== null && expiry > nowMs ? expiry : nowMs;
  return new Date(base + durationDays * DAY_MS);
}
