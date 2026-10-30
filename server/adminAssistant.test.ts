import { describe, expect, it } from "vitest";
import { estimatePlanExpiry, validateActionProposal } from "./adminAssistant";

const snapshot = {
  reports: [
    {
      id: 7,
      reporterId: 3,
      reporterName: "لاعب",
      targetType: "booking",
      targetId: 22,
      reason: "other",
      details: "ملاحظة",
      status: "open",
      createdAt: "2026-10-20T12:00:00.000Z",
    },
  ],
  owners: [{ id: 12, name: "صاحب ملعب", isSuspended: false }],
};

describe("admin assistant safety", () => {
  it("labels a subscription end date as an estimate and calculates days remaining", () => {
    const result = estimatePlanExpiry(
      new Date("2026-10-01T00:00:00.000Z"),
      30,
      new Date("2026-10-21T00:00:00.000Z")
    );
    expect(result).toEqual({ at: "2026-10-31T00:00:00.000Z", daysRemaining: 10 });
  });

  it("rejects invalid or incomplete subscription dates", () => {
    expect(estimatePlanExpiry(null, 30)).toBeNull();
    expect(estimatePlanExpiry("not-a-date", 30)).toBeNull();
    expect(estimatePlanExpiry("2026-10-01T00:00:00.000Z", 0)).toBeNull();
  });

  it("allows a report reply proposal only for reports in the live snapshot", () => {
    const proposal = validateActionProposal(
      { type: "reply_reports", reportIds: [7], message: "تمت مراجعة بلاغك." },
      snapshot
    );
    expect(proposal).toMatchObject({ type: "reply_reports", reportIds: [7], message: "تمت مراجعة بلاغك." });
    expect(validateActionProposal(
      { type: "reply_reports", reportIds: [999], message: "رد" },
      snapshot
    )).toBeNull();
    expect(validateActionProposal(
      { type: "reply_reports", reportIds: [7, 7], message: "رد" },
      snapshot
    )).toBeNull();
  });

  it("allows owner access proposals only for a known owner and a real state change", () => {
    expect(validateActionProposal(
      { type: "owner_access", ownerId: 12, suspended: true },
      snapshot
    )).toMatchObject({ type: "owner_access", ownerId: 12, suspended: true, currentlySuspended: false });
    expect(validateActionProposal(
      { type: "owner_access", ownerId: 99, suspended: true },
      snapshot
    )).toBeNull();
    expect(validateActionProposal(
      { type: "owner_access", ownerId: 12, suspended: false },
      snapshot
    )).toBeNull();
  });
});
