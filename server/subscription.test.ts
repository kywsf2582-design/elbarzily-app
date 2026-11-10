import { describe, expect, it } from "vitest";
import { extendOwnerSubscription, getOwnerSubscriptionState } from "../shared/subscription";

describe("owner subscription helpers", () => {
  it("reports an active countdown in whole days and hours", () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(getOwnerSubscriptionState(new Date(now + 25 * 60 * 60 * 1000), now)).toEqual({
      status: "active",
      remainingMs: 25 * 60 * 60 * 1000,
      daysRemaining: 2,
      hoursRemaining: 25,
    });
  });

  it("marks missing and expired subscriptions as inactive", () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    expect(getOwnerSubscriptionState(null, now).status).toBe("missing");
    expect(getOwnerSubscriptionState(now - 1, now).status).toBe("expired");
  });

  it("extends an active subscription from its current end date", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(extendOwnerSubscription(new Date("2026-01-11T00:00:00.000Z"), 30, now).toISOString())
      .toBe("2026-02-10T00:00:00.000Z");
  });

  it("starts a lapsed subscription from now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(extendOwnerSubscription(new Date("2025-12-01T00:00:00.000Z"), 7, now).toISOString())
      .toBe("2026-01-08T00:00:00.000Z");
  });
});
