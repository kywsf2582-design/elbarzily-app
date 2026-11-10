export type RealtimeInvalidation = {
  type: "invalidate";
  roots: string[];
  adminAreas: string[];
};

const ROOTS_BY_DOMAIN: Record<string, RealtimeInvalidation> = {
  bookings: { type: "invalidate", roots: ["bookings", "owner", "notifications"], adminAreas: ["receipts", "overview"] },
  availability: { type: "invalidate", roots: ["pitches", "schedules", "owner", "bookings"], adminAreas: ["venues", "suggestions", "receipts"] },
  support: { type: "invalidate", roots: ["support", "chat", "notifications"], adminAreas: ["support", "overview"] },
  subscriptions: { type: "invalidate", roots: ["subscriptions", "owner", "notifications"], adminAreas: ["subscriptions", "overview"] },
  profile: { type: "invalidate", roots: ["auth", "notifications", "bookings", "owner"], adminAreas: ["users", "customerActivity", "overview"] },
};

function targetForProcedure(path: string): RealtimeInvalidation {
  const [root, procedure = ""] = path.split(".");
  const name = procedure.toLowerCase();

  if (root === "bookings" || (root === "admin" && /booking|receipt|qr/i.test(procedure))) return ROOTS_BY_DOMAIN.bookings;
  if (root === "pitches" || root === "schedules" || (root === "admin" && /pitch|venue|schedule/i.test(procedure))) return ROOTS_BY_DOMAIN.availability;
  if (root === "support" || root === "chat") return ROOTS_BY_DOMAIN.support;
  if (root === "subscriptions" || (root === "admin" && /subscription|plan/i.test(procedure))) return ROOTS_BY_DOMAIN.subscriptions;
  if (root === "auth" || root === "users" || (root === "admin" && /user|moderator/i.test(procedure))) return ROOTS_BY_DOMAIN.profile;
  if (root === "owner") {
    if (/booking|payment|cash/i.test(name)) return { type: "invalidate", roots: ["pitches", "owner", "bookings"], adminAreas: ["venues", "overview"] };
    if (/plan|subscription/i.test(name)) return ROOTS_BY_DOMAIN.subscriptions;
    if (/pitch|schedule|slot|availability/i.test(name)) return ROOTS_BY_DOMAIN.availability;
    return ROOTS_BY_DOMAIN.bookings;
  }
  if (root === "appointments") return ROOTS_BY_DOMAIN.bookings;
  if (root === "notifications" || root === "push") return { type: "invalidate", roots: ["notifications", "push"], adminAreas: ["overview"] };
  if (root === "reports") return { type: "invalidate", roots: ["reports", "notifications"], adminAreas: ["reports", "overview"] };
  if (root === "suggestions") return { type: "invalidate", roots: ["suggestions", "pitches"], adminAreas: ["suggestions", "venues"] };
  if (root === "rewards" || root === "wallet") return { type: "invalidate", roots: [root, "notifications"], adminAreas: ["rewards", "customerActivity"] };
  if (root === "adminPortal") {
    if (/reward|voucher|point/i.test(procedure)) return { type: "invalidate", roots: ["adminPortal", "rewards", "wallet"], adminAreas: ["rewards", "overview"] };
    if (/user|customer/i.test(procedure)) return ROOTS_BY_DOMAIN.profile;
    return { type: "invalidate", roots: ["adminPortal", "admin"], adminAreas: ["overview"] };
  }
  if (root === "admin") return { type: "invalidate", roots: ["admin", "notifications"], adminAreas: ["overview"] };

  return { type: "invalidate", roots: root ? [root] : [], adminAreas: [] };
}

export function realtimeInvalidationForProcedures(paths: string[]): RealtimeInvalidation | null {
  const targets = paths.map(path => path.trim()).filter(Boolean).map(targetForProcedure);
  if (!targets.length) return null;
  return {
    type: "invalidate",
    roots: [...new Set(targets.flatMap(target => target.roots))],
    adminAreas: [...new Set(targets.flatMap(target => target.adminAreas))],
  };
}

export function successfulTrpcResponse(payload: unknown): boolean {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.length > 0 && entries.every(entry => {
    if (!entry || typeof entry !== "object") return false;
    const result = entry as Record<string, unknown>;
    return !("error" in result) && "result" in result;
  });
}
