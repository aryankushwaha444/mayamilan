// THE attacker-prevention gate for every remote media URL + the ObjectId rule.
import { MEDIA_HOSTS, OBJECTID_RE } from "../constants/mediaHosts";
import { URL_MAX } from "../constants/limits";

export function isSafeMediaUrl(u: unknown): u is string {
  if (typeof u !== "string" || !u || u.length > URL_MAX) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false; // reject http/data/blob/javascript
  const host = parsed.hostname.toLowerCase();
  return MEDIA_HOSTS.some((re) => re.test(host));
}
export function isObjectId(v: unknown): v is string {
  return typeof v === "string" && OBJECTID_RE.test(v);
}
