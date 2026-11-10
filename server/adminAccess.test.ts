import { describe, expect, it } from "vitest";
import { assertAdminAccess } from "./_core/trpc";

describe("server-side administrator scopes", () => {
  it("allows active administrators across the common admin middleware", () => {
    expect(() => assertAdminAccess({ role: "admin" }, "adminPortal.audit")).not.toThrow();
    expect(() => assertAdminAccess({ role: "super_admin" }, "adminPortal.admins.list")).not.toThrow();
  });

  it("denies every suspended administrator role", () => {
    for (const role of ["admin", "super_admin", "moderator"]) {
      expect(() =>
        assertAdminAccess({ role, isSuspended: true, moderatorPermissions: ["users"] }, "admin.overview"),
      ).toThrow("هذا الحساب موقوف");
    }
  });

  it("allows a moderator the overview and session plus only assigned API scopes", () => {
    const moderator = { role: "moderator", isSuspended: false, moderatorPermissions: ["pitches"] };
    expect(() => assertAdminAccess(moderator, "admin.overview")).not.toThrow();
    expect(() => assertAdminAccess(moderator, "adminPortal.session")).not.toThrow();
    expect(() => assertAdminAccess(moderator, "admin.allPitches")).not.toThrow();
    expect(() => assertAdminAccess(moderator, "suggestions.review")).not.toThrow();
    expect(() => assertAdminAccess(moderator, "downloadSettings.save")).toThrow();
    expect(() => assertAdminAccess(moderator, "adminPortal.audit")).toThrow();
  });

  it("maps the dashboard's operational scopes to the actual server procedures", () => {
    const cases: Array<[string, string]> = [
      ["users", "admin.users"],
      ["suspend", "admin.users"],
      ["suspend", "admin.updateModerator"],
      ["receipts", "admin.reviewBooking"],
      ["subscriptions", "admin.reviewSubscription"],
      ["subscriptions", "admin.subscriptionRequests"],
      ["receipts", "admin.subscriptionRequests"],
      ["chats", "adminPortal.chat.rooms"],
      ["chats", "admin.moderateMessage"],
      ["chats", "chat.moderationRooms"],
      ["chats", "chat.createClosedRoom"],
      ["reports", "reports.review"],
      ["rewards", "adminPortal.rewards.points"],
      ["referrals", "adminPortal.referrals.snapshot"],
      ["referrals", "adminPortal.referrals.review"],
      ["downloads", "downloadSettings.stats"],
      ["settings", "admin.updateSettings"],
      ["pitches", "admin.updatePitchStatus"],
    ];
    for (const [scope, path] of cases) {
      expect(() =>
        assertAdminAccess({ role: "moderator", moderatorPermissions: [scope] }, path),
      ).not.toThrow(`${scope} should permit ${path}`);
    }
  });

  it("requires downloads in addition to settings to change the public download configuration", () => {
    const settingsOnly = { role: "moderator", moderatorPermissions: ["settings"] };
    expect(() => assertAdminAccess(settingsOnly, "admin.updateSettings", "vodafone_cash_number")).not.toThrow();
    expect(() => assertAdminAccess(settingsOnly, "admin.updateSettings", "app_download_settings")).toThrow();
    expect(() => assertAdminAccess(settingsOnly, "admin.updateSettings", " APP_DOWNLOAD_SETTINGS ")).toThrow();
    expect(() => assertAdminAccess({ role: "moderator", moderatorPermissions: ["settings", "downloads"] }, "admin.updateSettings", " APP_DOWNLOAD_SETTINGS ")).not.toThrow();
    expect(() => assertAdminAccess({ role: "admin" }, "admin.updateSettings", "app_download_settings")).not.toThrow();
  });

  it("keeps the referrals scope separate from rewards and campaign administration", () => {
    const referralsModerator = { role: "moderator", moderatorPermissions: ["referrals"] };
    expect(() => assertAdminAccess(referralsModerator, "adminPortal.referrals.snapshot")).not.toThrow();
    expect(() => assertAdminAccess(referralsModerator, "adminPortal.referrals.review")).not.toThrow();
    expect(() => assertAdminAccess(referralsModerator, "adminPortal.rewards.points")).toThrow();
    expect(() => assertAdminAccess({ role: "moderator", moderatorPermissions: ["rewards"] }, "adminPortal.referrals.snapshot")).toThrow();
  });

  it("does not let a moderator guess an unmapped route or use an unassigned scope", () => {
    expect(() => assertAdminAccess({ role: "moderator", moderatorPermissions: ["users"] }, "admin.updateSettings")).toThrow();
    expect(() => assertAdminAccess({ role: "moderator", moderatorPermissions: [] }, "admin.users")).toThrow();
  });
});
