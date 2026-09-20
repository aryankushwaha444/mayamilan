import { checkIpReputation, getIpBlockMessage } from "../utils/ipReputation.js";
import { logAudit } from "../utils/auditLogger.js";

/**
 * Middleware to check IP reputation before allowing requests
 * Apply this to sensitive routes: register, login, password reset
 */
export const checkIpReputationMiddleware = async (req, res, next) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress;

    if (!ip) {
      // No IP available — allow (fail-open)
      return next();
    }

    const result = await checkIpReputation(ip);

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

      return res.status(403).json({
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

    // If score is moderate (not blocked but suspicious), log for monitoring
    if (result.confidenceScore >= 50 && !result.error) {
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
