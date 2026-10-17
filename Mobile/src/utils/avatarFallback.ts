// src/utils/avatarFallback.ts — never render an unvalidated remote avatar
import { isSafeMediaUrl } from "./media";
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");
type Photo = { url?: string } | string | null | undefined;
export function avatarSource(
  photos?: Photo[] | Photo
): { uri: string } | typeof DEFAULT_AVATAR {
  const first = Array.isArray(photos) ? photos[0] : photos;
  const url = typeof first === "string" ? first : first?.url;
  return isSafeMediaUrl(url) ? { uri: url } : DEFAULT_AVATAR;
}
