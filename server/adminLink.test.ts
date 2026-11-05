import { describe, expect, it } from "vitest";
import {
  ModeratorLinkError,
  prepareExistingAccountModeratorLink,
  type LinkedAccountTarget,
} from "./adminLink";

const player: LinkedAccountTarget = {
  id: 41,
  email: "player@example.com",
  role: "player",
  accountType: "player",
  isSuspended: false,
};

describe("linking an existing account as a moderator", () => {
  it("changes only role and moderator permissions for an eligible player", () => {
    const original = structuredClone(player);
    const changes = prepareExistingAccountModeratorLink(
      player,
      {
        email: " PLAYER@example.com ",
        role: "moderator",
        permissions: ["users", "reports", "users"],
      },
      "root@example.com",
    );

    expect(changes).toEqual({
      role: "moderator",
      moderatorPermissions: ["users", "reports"],
    });
    expect(Object.keys(changes).sort()).toEqual([
      "moderatorPermissions",
      "role",
    ]);
    expect(player).toEqual(original);
  });

  it("refuses the acting administrator's own email", () => {
    expect(() =>
      prepareExistingAccountModeratorLink(
        player,
        { email: player.email!, role: "moderator", permissions: [] },
        " PLAYER@example.com ",
      ),
    ).toThrow("لا يمكن ربط بريدك الشخصي");
  });

  it("refuses a current administrator instead of creating or duplicating a user", () => {
    expect(() =>
      prepareExistingAccountModeratorLink(
        { ...player, role: "admin" },
        { email: player.email!, role: "moderator", permissions: [] },
        "root@example.com",
      ),
    ).toThrow("مرتبط بالفعل بحساب إداري");
  });

  it("preserves and protects owner accounts", () => {
    expect(() =>
      prepareExistingAccountModeratorLink(
        { ...player, role: "owner", accountType: "owner" },
        { email: player.email!, role: "moderator", permissions: [] },
        "root@example.com",
      ),
    ).toThrow("حساب مالك الملعب");
  });

  it("does not activate a suspended account as a side effect", () => {
    let thrown: unknown;
    try {
      prepareExistingAccountModeratorLink(
        { ...player, isSuspended: true },
        { email: player.email!, role: "moderator", permissions: [] },
        "root@example.com",
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ModeratorLinkError);
    expect(thrown).toMatchObject({ code: "FORBIDDEN" });
  });
});
