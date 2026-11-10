const stagingStorageProxy = "https://elbarzily-api-staging.a62165368.workers.dev";
const productionStorageProxy = "https://elbarzily-api.a62165368.workers.dev";

export function mediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("blob:") || value.startsWith("data:") || /^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/manus-storage/")) {
    const configured = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
    return `${configured || (import.meta.env.PROD ? productionStorageProxy : stagingStorageProxy)}${value}`;
  }
  return value;
}

export function isVerifiedAccount(value?: { role?: string | null; accountType?: string | null } | null): boolean {
  return Boolean(value && (["admin", "super_admin", "owner"].includes(value.role || "") || value.accountType === "owner"));
}
