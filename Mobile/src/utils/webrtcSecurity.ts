// src/utils/webrtcSecurity.ts — validate ICE servers & SDP so an attacker who controls
// signaling can't inject rogue stun:/turn: hosts (traffic exfiltration / SSRF) or strip encryption.
import { isObjectId } from "./media";
const ALLOWED_ICE_SCHEMES = ["stun:", "stuns:", "turn:", "turns:"];
const TRUSTED_ICE_HOSTS = [/\.mayamilan\./i, /openrelay\.metaproxy\.net$/i]; // your TURN + a public fallback
export function sanitizeIceServers(list: unknown): RTCIceServer[] {
  if (!Array.isArray(list)) return [];
  const out: RTCIceServer[] = [];
  for (const s of list) {
    const urls = (s as any)?.urls;
    const arr =
      typeof urls === "string" ? [urls] : Array.isArray(urls) ? urls : [];
    const clean = arr.filter(
      (u: unknown) =>
        typeof u === "string" &&
        ALLOWED_ICE_SCHEMES.some((p) => u.startsWith(p)) &&
        TRUSTED_ICE_HOSTS.some((re) =>
          re.test(
            new URL(u.replace(/^(stuns?|turns?):\/\//, "https://")).hostname
          )
        )
    );
    if (clean.length)
      out.push({
        urls: clean,
        username: (s as any)?.username,
        credential: (s as any)?.credential,
      });
  }
  return out;
}
export function assertEncryptedSdp(sdp: string): boolean {
  // reject offers/answers that dropped SRTP/DTLS (plaintext media)
  return /m=.*(udp\s+tlsv1\.2\s+rtp\/saf|rtcp)\b/i.test(sdp) &&
    !/a=crypto:/.test(sdp) === false
    ? /rtp\/saf|dtls/i.test(sdp)
    : /dtls/i.test(sdp);
}
export const validPeerId = (id: unknown): id is string => isObjectId(id);
