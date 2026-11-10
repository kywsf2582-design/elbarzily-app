import { describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema.pg";
import {
  DEFAULT_REFERRAL_CAMPAIGN,
  attachReferralAtRegistration,
  awardFirstQrBookingReferralBonus,
  isCompleteReferralProfile,
  isReferralCampaignActive,
  normalizeReferralCode,
  normalizeReferralPhone,
  qualifyReferralForUser,
} from "./referrals";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const COMPLETE_INVITER = {
  id: 1,
  role: "player",
  accountType: "player",
  isSuspended: false,
  emailVerifiedAt: new Date("2026-11-01T00:00:00.000Z"),
  email: "inviter@example.test",
  name: "صاحب الدعوة",
  phone: "01011112222",
  region: "مدينة نصر",
};
const COMPLETE_INVITEE = {
  id: 2,
  role: "player",
  accountType: "player",
  isSuspended: false,
  emailVerifiedAt: new Date("2026-11-02T00:00:00.000Z"),
  email: "invitee@example.test",
  name: "لاعب جديد",
  phone: "01033334444",
  region: "المعادي",
};
const ACTIVE_CAMPAIGN = {
  ...DEFAULT_REFERRAL_CAMPAIGN,
  enabled: true,
  startsAt: null,
  endsAt: null,
  profilePoints: 25,
  firstQrBookingPoints: 40,
  dailyReferralLimit: 10,
  monthlyReferralLimit: 100,
};

/**
 * Small stateful Drizzle-compatible fake. It exercises the service's real
 * qualification and reward code without connecting to a live database.
 */
class FakeReferralTx {
  inviter: any = { ...COMPLETE_INVITER };
  invitee: any = { ...COMPLETE_INVITEE };
  campaign: any = { ...ACTIVE_CAMPAIGN };
  attribution: any = {
    id: 7,
    inviterId: 1,
    inviteeId: 2,
    referralCode: "ABCDEF123456",
    status: "pending_profile",
  };
  qualifiedCount = 0;
  qualifiedCounts: number[] = [];
  countIndex = 0;
  lockedTables: any[] = [];
  pointBalance = 0;
  rewardEvents: any[] = [];
  pointTransactions: any[] = [];
  nextId = 1;

  select(selection?: any) {
    let table: any;
    const query: any = {
      from: (value: any) => { table = value; return query; },
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      limit: () => query,
      for: (mode: string) => { if (mode === "update") this.lockedTables.push(table); return query; },
      groupBy: () => query,
      orderBy: () => query,
      then: (resolve: any, reject: any) => Promise.resolve(this.rows(table, selection)).then(resolve, reject),
    };
    return query;
  }

  private rows(table: any, selection: any): any[] {
    if (table === schema.referralCampaignSettings) return this.campaign ? [this.campaign] : [];

    if (table === schema.referralAttributions) {
      if (selection && Object.prototype.hasOwnProperty.call(selection, "value"))
        return [{ value: this.qualifiedCounts[this.countIndex++] ?? this.qualifiedCount }];
      return this.attribution ? [this.attribution] : [];
    }

    if (table === schema.referralCodes) {
      if (selection && Object.prototype.hasOwnProperty.call(selection, "codeId"))
        return this.inviter ? [{ codeId: 3, inviter: this.inviter }] : [];
      return this.inviter ? [{ id: 3, code: "ABCDEF123456", userId: this.inviter.id }] : [];
    }

    if (table === schema.users) {
      if (selection && Object.prototype.hasOwnProperty.call(selection, "email") && Object.prototype.hasOwnProperty.call(selection, "phone")) {
        return this.invitee ? [{
          id: this.invitee.id,
          email: this.invitee.email,
          phone: this.invitee.phone,
          accountType: this.invitee.accountType,
          role: this.invitee.role,
        }] : [];
      }
      if (selection && Object.prototype.hasOwnProperty.call(selection, "role")) {
        return this.inviter ? [{
          id: this.inviter.id,
          role: this.inviter.role,
          accountType: this.inviter.accountType,
          isSuspended: this.inviter.isSuspended,
        }] : [];
      }
      return this.invitee ? [this.invitee] : [];
    }

    return [];
  }

  insert(table: any) {
    let values: any;
    let conflictMode: "nothing" | "update" | null = null;
    const op: any = {
      values: (value: any) => { values = value; return op; },
      onConflictDoNothing: () => { conflictMode = "nothing"; return op; },
      onConflictDoUpdate: () => { conflictMode = "update"; return op; },
      returning: () => Promise.resolve(this.insertRows(table, values, conflictMode)),
      then: (resolve: any, reject: any) => Promise.resolve(this.insertRows(table, values, conflictMode)).then(resolve, reject),
    };
    return op;
  }

  private insertRows(table: any, values: any, conflictMode: "nothing" | "update" | null): any[] {
    if (table === schema.referralAttributions) {
      if (this.attribution?.inviteeId === values.inviteeId && conflictMode === "nothing") return [];
      this.attribution = { ...values, id: this.nextId++ };
      return [{ id: this.attribution.id }];
    }

    if (table === schema.referralRewardEvents) {
      const duplicate = this.rewardEvents.some(event =>
        event.attributionId === values.attributionId && event.milestone === values.milestone,
      );
      if (duplicate && conflictMode === "nothing") return [];
      const event = { ...values, id: this.nextId++ };
      this.rewardEvents.push(event);
      return [{ id: event.id }];
    }

    if (table === schema.pointAccounts) {
      this.pointBalance += Number(values.balance || 0);
      return [{ balance: this.pointBalance }];
    }

    if (table === schema.pointTransactions) {
      this.pointTransactions.push(values);
      return [];
    }

    return [];
  }

  update(table: any) {
    let changes: any;
    const query: any = {
      set: (value: any) => { changes = value; return query; },
      where: () => query,
      then: (resolve: any, reject: any) => {
        if (table === schema.referralAttributions && this.attribution)
          this.attribution = { ...this.attribution, ...changes };
        return Promise.resolve(undefined).then(resolve, reject);
      },
    };
    return query;
  }
}

describe("referral campaign rules", () => {
  it("normalizes only 12-character hexadecimal referral codes", () => {
    expect(normalizeReferralCode(" ab12cd34ef56 ")).toBe("AB12CD34EF56");
    expect(normalizeReferralCode("AB12CD34EF5G")).toBeNull();
    expect(normalizeReferralCode("AB12CD34EF5")).toBeNull();
    expect(normalizeReferralCode("AB12CD34EF567")).toBeNull();
  });

  it("normalizes Egyptian international phone prefixes for self-referral checks", () => {
    expect(normalizeReferralPhone("+20 10 1234 5678")).toBe("01012345678");
    expect(normalizeReferralPhone("0020-10-1234-5678")).toBe("01012345678");
    expect(normalizeReferralPhone("01012345678")).toBe("01012345678");
  });

  it("requires an active, email-verified player with a complete profile", () => {
    expect(isCompleteReferralProfile(COMPLETE_INVITEE)).toBe(true);
    expect(isCompleteReferralProfile({ ...COMPLETE_INVITEE, emailVerifiedAt: null })).toBe(false);
    expect(isCompleteReferralProfile({ ...COMPLETE_INVITEE, region: " " })).toBe(false);
    expect(isCompleteReferralProfile({ ...COMPLETE_INVITEE, accountType: "owner" })).toBe(false);
    expect(isCompleteReferralProfile({ ...COMPLETE_INVITEE, isSuspended: true })).toBe(false);
  });

  it("keeps campaigns disabled with zero rewards until configured by an administrator", () => {
    expect(DEFAULT_REFERRAL_CAMPAIGN.enabled).toBe(false);
    expect(DEFAULT_REFERRAL_CAMPAIGN.profilePoints).toBe(0);
    expect(DEFAULT_REFERRAL_CAMPAIGN.firstQrBookingPoints).toBe(0);
    expect(isReferralCampaignActive(DEFAULT_REFERRAL_CAMPAIGN)).toBe(false);
  });

  it("honors campaign start and end times", () => {
    const config = {
      enabled: true,
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-11-30T23:59:59.000Z",
    };
    expect(isReferralCampaignActive(config, new Date("2026-11-09T12:00:00.000Z"))).toBe(true);
    expect(isReferralCampaignActive(config, new Date("2026-10-31T23:59:59.000Z"))).toBe(false);
    expect(isReferralCampaignActive(config, new Date("2026-12-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("referral reward transactions", () => {
  it("qualifies only after email verification and profile completion, then credits the inviter once", async () => {
    const tx = new FakeReferralTx();
    tx.invitee = { ...COMPLETE_INVITEE, emailVerifiedAt: null };

    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "pending_profile", pointsAwarded: 0 });
    expect(tx.pointBalance).toBe(0);
    expect(tx.attribution.status).toBe("pending_profile");

    tx.invitee = { ...COMPLETE_INVITEE };
    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "qualified", pointsAwarded: 25 });
    expect(tx.pointBalance).toBe(25);
    expect(tx.rewardEvents).toHaveLength(1);
    expect(tx.pointTransactions).toHaveLength(1);

    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "qualified", pointsAwarded: 0 });
    expect(tx.pointBalance).toBe(25);
    expect(tx.pointTransactions).toHaveLength(1);
  });

  it("holds referrals at the daily limit for manual review without automatic points", async () => {
    const tx = new FakeReferralTx();
    tx.qualifiedCount = 10;

    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "pending_review", pointsAwarded: 0 });
    expect(tx.attribution.status).toBe("pending_review");
    expect(tx.pointBalance).toBe(0);
    expect(tx.rewardEvents).toHaveLength(0);
  });

  it("enforces referral limits when profile points are zero and only a QR bonus is configured", async () => {
    const tx = new FakeReferralTx();
    tx.campaign = { ...ACTIVE_CAMPAIGN, profilePoints: 0, firstQrBookingPoints: 40 };
    tx.qualifiedCount = 10;

    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "pending_review", pointsAwarded: 0 });
    expect(tx.attribution.status).toBe("pending_review");
    expect(tx.pointBalance).toBe(0);
    expect(tx.rewardEvents).toHaveLength(0);
  });

  it("holds referrals at the monthly limit even when the daily limit has room", async () => {
    const tx = new FakeReferralTx();
    tx.qualifiedCounts = [0, 100];

    expect(await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW)).toEqual({ status: "pending_review", pointsAwarded: 0 });
    expect(tx.attribution.status).toBe("pending_review");
    expect(tx.pointBalance).toBe(0);
  });

  it("takes a row lock on the inviter's code before automatic qualification", async () => {
    const tx = new FakeReferralTx();
    await qualifyReferralForUser(tx, COMPLETE_INVITEE.id, NOW);
    expect(tx.lockedTables).toContain(schema.referralCodes);
  });

  it("does not credit QR-booking points until the referral is qualified", async () => {
    const tx = new FakeReferralTx();
    expect(await awardFirstQrBookingReferralBonus(tx, COMPLETE_INVITEE.id, 91, NOW)).toBe(0);
    expect(tx.pointBalance).toBe(0);
    expect(tx.rewardEvents).toHaveLength(0);
  });

  it("credits the first verified QR booking once and does not duplicate its ledger entry", async () => {
    const tx = new FakeReferralTx();
    tx.attribution = { ...tx.attribution, status: "qualified" };

    expect(await awardFirstQrBookingReferralBonus(tx, COMPLETE_INVITEE.id, 91, NOW)).toBe(40);
    expect(await awardFirstQrBookingReferralBonus(tx, COMPLETE_INVITEE.id, 92, NOW)).toBe(0);
    expect(tx.pointBalance).toBe(40);
    expect(tx.rewardEvents).toHaveLength(1);
    expect(tx.rewardEvents[0].bookingId).toBe(91);
    expect(tx.pointTransactions).toHaveLength(1);
  });

  it("rejects self-referrals and duplicate registrations before creating a second attribution", async () => {
    const selfReferral = new FakeReferralTx();
    selfReferral.invitee = { ...COMPLETE_INVITEE, id: COMPLETE_INVITER.id };
    expect(await attachReferralAtRegistration(selfReferral, { referralCode: "ABCDEF123456", inviteeId: COMPLETE_INVITER.id })).toBe(false);
    expect(selfReferral.attribution.status).toBe("pending_profile");

    const tx = new FakeReferralTx();
    tx.attribution = null;
    expect(await attachReferralAtRegistration(tx, { referralCode: "ABCDEF123456", inviteeId: COMPLETE_INVITEE.id })).toBe(true);
    expect(tx.attribution.status).toBe("qualified");
    expect(tx.pointBalance).toBe(25);

    expect(await attachReferralAtRegistration(tx, { referralCode: "ABCDEF123456", inviteeId: COMPLETE_INVITEE.id })).toBe(false);
    expect(tx.pointBalance).toBe(25);
    expect(tx.rewardEvents).toHaveLength(1);
  });
});
