import { createHash } from "node:crypto";

export function deletedIdentitySettingKey(openId: string): string {
  const digest = createHash("sha256").update(openId).digest("hex");
  return `deleted_identity_${digest}`;
}
