import { describe, expect, it } from "vitest";
import { MODERATOR_PERMISSION_IDS } from "../shared/adminPermissions";
import { permissionOptions } from "../admin-dashboard/src/permissions";

describe("moderator permission catalog", () => {
  it("keeps the admin dashboard options exactly aligned with server scopes", () => {
    expect(permissionOptions.map(([id]) => id)).toEqual(MODERATOR_PERMISSION_IDS);
  });
});
