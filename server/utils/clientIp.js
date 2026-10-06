// Defense-in-depth client-IP resolver. Returns Express's resolved req.ip when it is
// already public (direct exposure, or trust proxy unwrapped correctly) so we NEVER trust
// a client-supplied X-Forwarded-For in that case (no spoofing). Only when the resolved
// peer is private/loopback (we are behind a proxy, e.g. Render's LB) do we read the
// leftmost PUBLIC address from X-Forwarded-For / req.ips — which the proxy authored.
const PRIVATE =
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]{3}:|0:0:0:0:0:0:0:1$)/i;

const isPublic = (ip) => !!ip && !PRIVATE.test(ip);

export function getClientIp(req) {
  const resolved = (req.ip || "").replace(/^::ffff:/, "");
  if (isPublic(resolved)) return resolved; // trust Express's own resolution first
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const parts = String(xff)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) if (isPublic(p)) return p; // leftmost public = originator
  }
  if (Array.isArray(req.ips))
    for (const p of req.ips) if (isPublic(p)) return p;
  return resolved || "unknown";
}
