import { describe, expect, it } from "vitest";
import { mayDeleteAppAccount } from "./accountDeletion";
import { deletedIdentitySettingKey } from "./deletedIdentity";

describe("permanent account deletion safeguards", () => {
  it("allows player and owner accounts, including an owner waiting for activation", () => {
    expect(mayDeleteAppAccount({ role: "player", accountType: "player" })).toBe(true);
    expect(mayDeleteAppAccount({ role: "owner", accountType: "owner" })).toBe(true);
    expect(mayDeleteAppAccount({ role: "user", accountType: "owner" })).toBe(true);
  });

  it("never treats an administrator or moderator as a deletable player account", () => {
    expect(mayDeleteAppAccount({ role: "admin", accountType: "player" })).toBe(false);
    expect(mayDeleteAppAccount({ role: "super_admin", accountType: "owner" })).toBe(false);
    expect(mayDeleteAppAccount({ role: "moderator", accountType: "player" })).toBe(false);
  });

  it("stores only a stable one-way hash for a deleted OAuth identity", () => {
    const key = deletedIdentitySettingKey("oauth-open-id-123");
    expect(key).toMatch(/^deleted_identity_[a-f0-9]{64}$/);
    expect(key).not.toContain("oauth-open-id-123");
    expect(deletedIdentitySettingKey("oauth-open-id-123")).toBe(key);
  });
});
