export const MODERATOR_PERMISSION_IDS = [
  "users",
  "suspend",
  "receipts",
  "chats",
  "reports",
  "rewards",
  "pitches",
  "subscriptions",
  "downloads",
  "settings",
] as const;

export type ModeratorPermissionId = (typeof MODERATOR_PERMISSION_IDS)[number];

export const MODERATOR_PERMISSION_OPTIONS: ReadonlyArray<readonly [ModeratorPermissionId, string]> = [
  ["users", "المستخدمون"],
  ["suspend", "إيقاف/تفعيل الحسابات"],
  ["receipts", "الحجوزات والإيصالات"],
  ["chats", "مراقبة الشات"],
  ["reports", "البلاغات"],
  ["rewards", "المكافآت والقسائم"],
  ["pitches", "اعتماد الملاعب"],
  ["subscriptions", "الاشتراكات والباقات"],
  ["downloads", "التنزيلات"],
  ["settings", "إعدادات التشغيل"],
];

export function sanitizeModeratorPermissions(value: unknown): ModeratorPermissionId[] {
  const allowed = new Set<string>(MODERATOR_PERMISSION_IDS);
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map(String).map(item => item.trim()).filter((item): item is ModeratorPermissionId => allowed.has(item));
}
