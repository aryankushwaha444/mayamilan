import { checkIpReputation, getIpBlockMessage } from "../utils/ipReputation.js";
import { logAudit } from "../utils/auditLogger.js";
import redis from "../utils/cache.js";

// Trusted IPs that should bypass reputation checks
const IP_WHITELIST = [
  "66.249.", // Googlebot
  "64.233.", // Google
  "72.14.", // Google
  "209.85.", // Google
  "216.58.", // Google
  "127.0.0.1", // Localhost
  "::1", // IPv6 localhost
];

const isWhitelisted = (ip) => {
  return IP_WHITELIST.some((prefix) => ip.startsWith(prefix));
};

const normalizeIp = (ip) => {
  if (!ip) return null;

  // Strip IPv6 prefix from IPv4-mapped addresses
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }

  return ip.toLowerCase();
};

/**
 * Middleware to check IP reputation before allowing requests
 * Apply this to sensitive routes: register, login, password reset
 */
export const checkIpReputationMiddleware = async (req, res, next) => {
  try {
    const rawIp = req.ip || req.connection?.remoteAddress;
    const ip = normalizeIp(rawIp);

    if (!ip) {
      // No IP available — allow (fail-open)
      return next();
    }

    // Skip check for whitelisted IPs
    if (isWhitelisted(ip)) {
      req.ipReputation = {
        skipped: true,
        reason: "whitelisted",
        confidenceScore: 0,
      };
      return next();
    }

    // Check Redis cache first
    const cacheKey = `ip:reputation:${ip}`;
    let result;

    try {
      const cached = await redis?.get(cacheKey);
      if (cached) {
        result = JSON.parse(cached);
      } else {
        // Cache miss — call API
        result = await checkIpReputation(ip);

        // Cache for 1 hour (3600 seconds)
        await redis?.setex(cacheKey, 3600, JSON.stringify(result));
      }
    } catch (cacheError) {
      // If caching fails, proceed without cache
      result = await checkIpReputation(ip);
    }

    // Attach to request for downstream use (e.g., audit logs)
    req.ipReputation = result;

    // If IP is malicious, block the request
    if (
      result.isMalicious &&
      !result.error &&
      !result.skipped &&
      !result.disabled
    ) {
      const message = getIpBlockMessage(result);

      await logAudit(req, "ip_reputation_blocked", {
        ip,
        confidenceScore: result.confidenceScore,
        isTor: result.isTor,
        isVpn: result.isVpn,
        isProxy: result.isProxy,
        country: result.country,
        isp: result.isp,
        path: req.path,
      });

      console.warn(
        `🚫 BLOCKED malicious IP: ${ip} (score: ${result.confidenceScore}, ` +
          `Tor: ${result.isTor}, VPN: ${result.isVpn}, country: ${result.country})`
      );

      return res
        .status(403)
        .set("Retry-After", "3600") // Try again in 1 hour
        .json({
          success: false,
          message,
          ipBlocked: true,
          reputation: {
            score: result.confidenceScore,
            isTor: result.isTor,
            isVpn: result.isVpn,
            country: result.country,
          },
        });
    }

    // Make threshold configurable
    const suspiciousThreshold = parseInt(
      process.env.IP_SUSPICIOUS_THRESHOLD || "50",
      10
    );

    // If score is moderate (not blocked but suspicious), log for monitoring
    if (result.confidenceScore >= suspiciousThreshold && !result.error) {
      console.warn(
        `⚠️ Suspicious IP: ${ip} (score: ${result.confidenceScore}, country: ${result.country})`
      );
    }

    next();
  } catch (error) {
    console.error("IP reputation middleware error:", error.message);
    // ✅ Fail-open on errors
    next();
  }
};
