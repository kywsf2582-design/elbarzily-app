import {
  MODERATOR_PERMISSION_OPTIONS,
  sanitizeModeratorPermissions,
  type ModeratorPermissionId,
} from "../../shared/adminPermissions";

const permissionLabels: Record<ModeratorPermissionId, string> = {
  users: "إدارة المستخدمين",
  suspend: "إيقاف الحسابات وتفعيلها",
  receipts: "الحجوزات والإيصالات",
  support: "الدعم الفني",
  reports: "البلاغات والشكاوى",
  rewards: "المكافآت والقسائم",
  referrals: "نظام الدعوات والإحالات",
  pitches: "إدارة الملاعب واعتمادها",
  subscriptions: "الاشتراكات والباقات",
  downloads: "ملفات التنزيل",
  settings: "إعدادات الإدارة",
};

export const permissionOptions = MODERATOR_PERMISSION_OPTIONS.map(([id]) => [id, permissionLabels[id]] as const);
export type PermissionId = ModeratorPermissionId;

export function permissionList(value: unknown): string[] {
  return sanitizeModeratorPermissions(value);
}
