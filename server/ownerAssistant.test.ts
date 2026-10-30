import { describe, expect, it } from "vitest";
import { normalizeCairoWallTime } from "./scheduleTime";
import { validateAvailableSlotProposal } from "./ownerAssistant";

const snapshot = {
  pitches: [{
    id: 7,
    name: "ملعب البرازيلي",
    city: "القاهرة",
    status: "published",
    bookingPaymentMode: "deposit" as const,
    depositAmount: "200.00",
    hasVodafoneCashNumber: true,
  }],
  fields: [{ id: 21, pitchId: 7, name: "ملعب 2", isActive: true, hourlyPrice: "500.00" }],
};
const now = new Date("2026-10-22T10:00:00.000Z");
const action = {
  type: "publish_available_slot",
  pitchId: 7,
  fieldId: 21,
  date: "2026-10-23",
  startTime: "18:00",
  endTime: "20:00",
  endsNextDay: false,
  price: 1000,
  depositAmount: 250,
};

describe("owner assistant available-slot proposal validation", () => {
  it("resolves an owned active sub-pitch and normalizes its Cairo-local time", () => {
    const result = validateAvailableSlotProposal(action, snapshot, now);
    expect(result).not.toBeNull();
    expect(result?.pitchName).toBe("ملعب البرازيلي");
    expect(result?.fieldName).toBe("ملعب 2");
    expect(result?.depositAmount).toBe(250);
    expect(new Date(result!.startsAt).getTime()).toBe(new Date(normalizeCairoWallTime("2026-10-23T18:00:00")).getTime());
  });

  it("uses the pitch default deposit when no slot-specific amount was requested", () => {
    const result = validateAvailableSlotProposal({ ...action, depositAmount: null }, snapshot, now);
    expect(result?.depositAmount).toBeNull();
    expect(result?.effectiveDepositAmount).toBe(200);
  });

  it("rejects pitches or fields outside the owner's live snapshot", () => {
    expect(validateAvailableSlotProposal({ ...action, pitchId: 99 }, snapshot, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, fieldId: 99 }, snapshot, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, fieldId: 22 }, {
      ...snapshot,
      fields: [{ id: 22, pitchId: 99, name: "ملعب آخر", isActive: true, hourlyPrice: "500" }],
    }, now)).toBeNull();
  });

  it("rejects invalid time, past dates, invalid or excessive deposits", () => {
    expect(validateAvailableSlotProposal({ ...action, date: "2026-02-30" }, snapshot, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, date: "2026-10-21" }, snapshot, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, startTime: "29:90" }, snapshot, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, depositAmount: 1001 }, snapshot, now)).toBeNull();
  });

  it("rejects a special deposit if the pitch has arrival-only or incomplete cash settings", () => {
    expect(validateAvailableSlotProposal({ ...action, depositAmount: 250 }, {
      pitches: [{ ...snapshot.pitches[0], bookingPaymentMode: "arrival" as const }], fields: snapshot.fields,
    }, now)).toBeNull();
    expect(validateAvailableSlotProposal({ ...action, depositAmount: 250 }, {
      pitches: [{ ...snapshot.pitches[0], hasVodafoneCashNumber: false }], fields: snapshot.fields,
    }, now)).toBeNull();
  });

  it("supports an explicitly overnight interval but keeps it within one day", () => {
    const result = validateAvailableSlotProposal({ ...action, startTime: "23:00", endTime: "01:00", endsNextDay: true, depositAmount: null }, snapshot, now);
    expect(result).not.toBeNull();
    expect(new Date(result!.endsAt).getTime()).toBeGreaterThan(new Date(result!.startsAt).getTime());
    expect(validateAvailableSlotProposal({ ...action, startTime: "23:00", endTime: "01:00", endsNextDay: false }, snapshot, now)).toBeNull();
  });
});
