import {
  MODERATOR_PERMISSION_OPTIONS,
  sanitizeModeratorPermissions,
  type ModeratorPermissionId,
} from "../../shared/adminPermissions";

export const permissionOptions = MODERATOR_PERMISSION_OPTIONS;
export type PermissionId = ModeratorPermissionId;

export function permissionList(value: unknown): string[] {
  return sanitizeModeratorPermissions(value);
}
