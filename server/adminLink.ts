export type LinkedAccountTarget = {
  id: number;
  email: string | null;
  role: string;
  accountType: string;
  isSuspended: boolean;
};

export type ModeratorLinkRole = "admin" | "moderator";

export type ModeratorLinkChanges = {
  role: ModeratorLinkRole;
  moderatorPermissions: string[];
};

export class ModeratorLinkError extends Error {
  constructor(
    readonly code: "BAD_REQUEST" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "ModeratorLinkError";
  }
}

export function prepareExistingAccountModeratorLink(
  target: LinkedAccountTarget,
  input: { email: string; role: ModeratorLinkRole; permissions: string[] },
  actorEmail: string | null | undefined,
): ModeratorLinkChanges {
  const normalize = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase();

  if (normalize(input.email) === normalize(actorEmail)) {
    throw new ModeratorLinkError(
      "BAD_REQUEST",
      "لا يمكن ربط بريدك الشخصي كمشرف إضافي.",
    );
  }

  if (["admin", "super_admin", "moderator"].includes(target.role)) {
    throw new ModeratorLinkError(
      "BAD_REQUEST",
      "هذا البريد مرتبط بالفعل بحساب إداري؛ عدّل صلاحياته من قائمة المشرفين.",
    );
  }

  if (target.accountType !== "player") {
    throw new ModeratorLinkError(
      "FORBIDDEN",
      "لم نغيّر حساب مالك الملعب؛ استخدم حساب لاعب أو حساب مشرف منفصلاً.",
    );
  }

  if (target.role !== "player" && target.role !== "user") {
    throw new ModeratorLinkError(
      "FORBIDDEN",
      "هذا النوع من الحسابات لا يمكن تحويله إلى مشرف من هذه الشاشة.",
    );
  }

  if (target.isSuspended) {
    throw new ModeratorLinkError(
      "FORBIDDEN",
      "الحساب موقوف بالفعل؛ لم نغيّر حالة الإيقاف.",
    );
  }

  // Only role and moderator scopes are changed; identity, login credentials,
  // account type, verification state, suspension, and application data remain untouched.
  return {
    role: input.role,
    moderatorPermissions: [...new Set(input.permissions)],
  };
}
