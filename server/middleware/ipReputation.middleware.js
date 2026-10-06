import { checkIpReputation, getIpBlockMessage } from "../utils/ipReputation.js";
import { logAudit } from "../utils/auditLogger.js";
import redis from "../utils/cache.js";
import crypto from "crypto";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NODE_ENV = process.env.NODE_ENV || "development";

// Configuration from environment variables
const CONFIG = {
  // Cache TTL in seconds (default: 1 hour)
  cacheTTL: parseInt(process.env.IP_REPUTATION_CACHE_TTL || "3600", 10),

  // Suspicious threshold (default: 50)
  suspiciousThreshold: parseInt(
    process.env.IP_SUSPICIOUS_THRESHOLD || "50",
    10
  ),

  // API timeout in milliseconds (default: 5 seconds)
  apiTimeout: parseInt(process.env.IP_REPUTATION_TIMEOUT || "5000", 10),

  // Max requests per IP per hour to reputation API (default: 10)
  maxRequestsPerHour: parseInt(
    process.env.IP_REPUTATION_MAX_REQUESTS || "10",
    10
  ),

  // Enable/disable IP reputation checking
  enabled: process.env.IP_REPUTATION_ENABLED !== "false",
};

// Trusted IP prefixes (configurable via environment)
const IP_WHITELIST = [
  "66.249.", // Googlebot
  "64.233.", // Google
  "72.14.", // Google
  "209.85.", // Google
  "216.58.", // Google
  "127.0.0.1", // Localhost
  "::1", // IPv6 localhost
  ...(process.env.IP_WHITELIST_ADDITIONAL?.split(",") || []),
];

// ═══════════════════════════════════════════
// CIRCUIT BREAKER STATE
// ═══════════════════════════════════════════
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  state: "CLOSED", // CLOSED, OPEN, HALF_OPEN
  threshold: 5, // Open after 5 failures
  resetTimeout: 60000, // Reset after 60 seconds
};

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Mask IP address for logging (privacy protection)
 */
const maskIp = (ip) => {
  if (!ip) return "unknown";
  if (ip.includes(":")) {
    // IPv6: mask last 4 groups
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + ":****:****";
  }
  // IPv4: mask last octet
  const parts = ip.split(".");
  return parts.slice(0, 3).join(".") + ".*";
};

/**
 * Safe audit logging (fire-and-forget)
 */
const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

/**
 * Check if IP is whitelisted
 */
const isWhitelisted = (ip) => {
  return IP_WHITELIST.some((prefix) => ip.startsWith(prefix));
};

/**
 * Normalize IP address
 */
const normalizeIp = (ip) => {
  if (!ip) return null;

  // Strip IPv6 prefix from IPv4-mapped addresses
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }

  return ip.toLowerCase();
};

/**
 * Check rate limit for IP reputation API calls
 */
const checkRateLimit = async (ip) => {
  if (!redis) return true; // Allow if Redis unavailable

  const rateLimitKey = `ip:reputation:rate:${ip}`;
  const currentCount = await redis.get(rateLimitKey);

  if (currentCount && parseInt(currentCount) >= CONFIG.maxRequestsPerHour) {
    return false; // Rate limit exceeded
  }

  // Increment counter
  await redis.incr(rateLimitKey);
  await redis.expire(rateLimitKey, 3600); // 1 hour TTL

  return true;
};

/**
 * Safe JSON parse with fallback
 */
const safeJsonParse = (str) => {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

/**
 * Check circuit breaker state
 */
const canCallApi = () => {
  if (circuitBreaker.state === "CLOSED") return true;

  if (circuitBreaker.state === "OPEN") {
    // Check if reset timeout has passed
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
      circuitBreaker.state = "HALF_OPEN";
      return true;
    }
    return false;
  }

  // HALF_OPEN: allow one request
  return true;
};

/**
 * Record API call success
 */
const recordSuccess = () => {
  circuitBreaker.failures = 0;
  circuitBreaker.state = "CLOSED";
};

/**
 * Record API call failure
 */
const recordFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.state = "OPEN";
    if (NODE_ENV === "development") {
      console.warn("⚠️  IP reputation circuit breaker OPENED");
    }
  }
};

/**
 * Call IP reputation API with timeout and circuit breaker
 */
const callReputationApi = async (ip, req) => {
  // Check circuit breaker
  if (!canCallApi()) {
    return {
      skipped: true,
      reason: "circuit_breaker_open",
      confidenceScore: 0,
      isMalicious: false,
    };
  }

  // Check rate limit
  const rateLimitOk = await checkRateLimit(ip);
  if (!rateLimitOk) {
    return {
      skipped: true,
      reason: "rate_limit_exceeded",
      confidenceScore: 0,
      isMalicious: false,
    };
  }

  try {
    // Call API with timeout
    const result = await Promise.race([
      checkIpReputation(ip),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("IP reputation API timeout")),
          CONFIG.apiTimeout
        )
      ),
    ]);

    recordSuccess();
    return result;
  } catch (error) {
    recordFailure();

    await safeLogAudit(req, "ip_reputation_api_error", {
      ip: maskIp(ip),
      error: error.message,
    });

    // Fail-open: return neutral result
    return {
      error: true,
      message: error.message,
      confidenceScore: 0,
      isMalicious: false,
    };
  }
};

// ═══════════════════════════════════════════
// MAIN MIDDLEWARE
// ═══════════════════════════════════════════

/**
 * Middleware to check IP reputation before allowing requests.
 * Apply this to sensitive routes: register, login, password reset.
 *
 * Features:
 * - Whitelisted IPs bypass checks
 * - Redis caching with TTL
 * - Circuit breaker for API failures
 * - Rate limiting on API calls
 * - Configurable thresholds
 * - Fail-open on errors
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 *
 * @example
 * // Apply to sensitive routes
 * router.post('/register', checkIpReputationMiddleware, register);
 * router.post('/login', checkIpReputationMiddleware, login);
 */
export const checkIpReputationMiddleware = async (req, res, next) => {
  // Skip if disabled
  if (!CONFIG.enabled) {
    return next();
  }

  // Generate request ID if not present
  if (!req.requestId) {
    req.requestId = crypto.randomUUID();
  }

  try {
    const rawIp = req.ip || req.connection?.remoteAddress;
    const ip = normalizeIp(rawIp);

    // No IP available — allow (fail-open)
    if (!ip) {
      req.ipReputation = {
        skipped: true,
        reason: "no_ip_available",
        confidenceScore: 0,
        isMalicious: false,
      };
      return next();
    }

    // Skip check for whitelisted IPs
    if (isWhitelisted(ip)) {
      req.ipReputation = {
        skipped: true,
        reason: "whitelisted",
        confidenceScore: 0,
        isMalicious: false,
      };
      return next();
    }

    // Check Redis cache first
    const cacheKey = `ip:reputation:${ip}`;
    let result;

    try {
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          result = safeJsonParse(cached);
        }
      }

      // Cache miss — call API
      if (!result) {
        result = await callReputationApi(ip, req);

        // Cache successful results (not errors or skipped)
        if (result && !result.error && !result.skipped && redis) {
          await redis.setex(cacheKey, CONFIG.cacheTTL, JSON.stringify(result));
        }
      }
    } catch (cacheError) {
      // If caching fails, proceed without cache
      result = await callReputationApi(ip, req);
    }

    // Attach to request for downstream use
    req.ipReputation = result;

    // ═══════════════════════════════════════════
    // BLOCK MALICIOUS IPs
    // ═══════════════════════════════════════════
    if (result.isMalicious && !result.error && !result.skipped) {
      const message = getIpBlockMessage(result);

      await safeLogAudit(req, "ip_reputation_blocked", {
        ip: maskIp(ip), // ✅ Masked for privacy
        confidenceScore: result.confidenceScore,
        isTor: result.isTor,
        isVpn: result.isVpn,
        isProxy: result.isProxy,
        country: result.country,
        isp: result.isp,
        path: req.path,
        method: req.method,
        requestId: req.requestId,
      });

      return res
        .status(403)
        .set("Retry-After", CONFIG.cacheTTL.toString())
        .json({
          success: false,
          message,
          ipBlocked: true,
          code: "IP_BLOCKED",
          requestId: req.requestId,
          reputation: {
            score: result.confidenceScore,
            isTor: result.isTor,
            isVpn: result.isVpn,
            country: result.country,
          },
        });
    }

    // ═══════════════════════════════════════════
    // LOG SUSPICIOUS IPs (for monitoring)
    // ═══════════════════════════════════════════
    if (
      result.confidenceScore >= CONFIG.suspiciousThreshold &&
      !result.error &&
      !result.skipped
    ) {
      await safeLogAudit(req, "ip_reputation_suspicious", {
        ip: maskIp(ip),
        confidenceScore: result.confidenceScore,
        country: result.country,
        path: req.path,
        method: req.method,
      });
    }

    next();
  } catch (error) {
    // Log error in development only
    if (NODE_ENV === "development") {
      console.error("IP reputation middleware error:", error.message);
    }

    await safeLogAudit(req, "ip_reputation_middleware_error", {
      error: error.name,
      requestId: req.requestId,
    });

    // ✅ Fail-open on errors
    next();
  }
};

// ═══════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════

/**
 * Get current circuit breaker state (for monitoring)
 */
export const getCircuitBreakerState = () => ({
  state: circuitBreaker.state,
  failures: circuitBreaker.failures,
  lastFailure: circuitBreaker.lastFailure,
});

/**
 * Reset circuit breaker (for testing or manual intervention)
 */
export const resetCircuitBreaker = () => {
  circuitBreaker.failures = 0;
  circuitBreaker.lastFailure = null;
  circuitBreaker.state = "CLOSED";
};

/**
 * Update configuration at runtime
 */
export const updateConfig = (newConfig) => {
  Object.assign(CONFIG, newConfig);
};

export default checkIpReputationMiddleware;
