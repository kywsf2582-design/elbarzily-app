import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    if (shape.data?.code === "INTERNAL_SERVER_ERROR") {
      return {
        ...shape,
        message: "تعذر إكمال الطلب حالياً. لم تُعرض تفاصيل تقنية لحماية بيانات التطبيق؛ يرجى المحاولة بعد قليل.",
      };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (ctx.user.isSuspended) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب موقوف" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

type AdminAccessUser = {
  role: string;
  isSuspended?: boolean | null;
  moderatorPermissions?: readonly string[] | null;
};

const moderatorScopeByProcedure: Readonly<Record<string, string | readonly string[]>> = {
  "admin.users": ["users", "suspend"],
  "admin.bookings": "receipts",
  "admin.bookingStatusSync": "receipts",
  "admin.qrLogs": "receipts",
  "admin.reviewBooking": "receipts",
  "admin.subscriptionRequests": ["subscriptions", "receipts"],
  "admin.reviewSubscription": ["subscriptions", "receipts"],
  "admin.updateModerator": "suspend",
  "admin.smartReceiptVerification": "settings",
  "admin.setSmartReceiptVerification": "settings",
  "admin.updateSettings": "settings",
  "admin.createPlan": "settings",
  "admin.updatePlan": "settings",
  "admin.pitches": "pitches",
  "admin.reviewPitch": "pitches",
  "admin.allPitches": "pitches",
  "admin.updatePitchStatus": "pitches",
  "support.adminList": "support",
  "support.adminMessages": "support",
  "support.adminReply": "support",
  "support.setStatus": "support",
  "support.adminProfile": "support",
  "support.mediaUrl": "support",
  "reports.list": "reports",
  "reports.review": "reports",
  "suggestions.list": "pitches",
  "suggestions.review": "pitches",
  "downloadSettings.stats": "downloads",
  "downloadSettings.admin": "downloads",
  "downloadSettings.save": "downloads",
  "downloadSettings.apk": "downloads",
  "adminPortal.rewards.list": "rewards",
  "adminPortal.rewards.points": "rewards",
  "adminPortal.rewards.create": "rewards",
  "adminPortal.rewards.update": "rewards",
  "adminPortal.rewards.adjustPoints": "rewards",
  "adminPortal.vouchers.list": "rewards",
  "adminPortal.vouchers.cancel": "rewards",
  "adminPortal.referrals.snapshot": "referrals",
  "adminPortal.referrals.updateCampaign": "referrals",
  "adminPortal.referrals.review": "referrals",
};

export function assertAdminAccess(
  user: AdminAccessUser | null | undefined,
  path: string,
  resourceKey?: string,
): void {
  if (!user) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  if (user.isSuspended) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب موقوف" });
  }

  if (user.role === "admin" || user.role === "super_admin") return;

  const configuredScope = moderatorScopeByProcedure[path];
  const scopes = Array.isArray(configuredScope)
    ? configuredScope
    : configuredScope
      ? [configuredScope]
      : [];
  const moderatorAllowed =
    user.role === "moderator" &&
    (path === "admin.overview" ||
      path === "adminPortal.session" ||
      scopes.some(scope => user.moderatorPermissions?.includes(scope)));

  if (!moderatorAllowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  if (path === "admin.updateSettings" && resourceKey?.trim().toLowerCase() === "app_download_settings") {
    assertAdminAccess(user, "downloadSettings.save");
  }
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path } = opts;
    assertAdminAccess(ctx.user, path);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user!,
      },
    });
  }),
);
