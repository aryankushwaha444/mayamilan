import { logAudit } from "./auditLogger.js";

// ========================================
// TRY TO LOAD EXISTING REDIS CLIENT
// ========================================
let redisClient = null;

try {
  // Try common locations for your existing Redis singleton
  const cacheModule = await import("../utils/cache.js");
  redisClient =
    cacheModule.redis || cacheModule.default || cacheModule.cache || null;
} catch {
  // Try alternate path
  try {
    const cacheModule = await import("../config/cache.js");
    redisClient =
      cacheModule.redis || cacheModule.default || cacheModule.cache || null;
  } catch {
    console.log("ℹ️  IP reputation: using memory-only cache (Redis not found)");
  }
}

// ========================================
// CONSTANTS
// ========================================
const CACHE_TTL_SECONDS = 86400; // 24 hours
const memoryCache = new Map();
const MEMORY_CACHE_MAX = 10000;

// AbuseIPDB High-Risk Categories (Brute Force, SSH, IoT Target, etc.)
const HIGH_RISK_CATEGORIES = [1, 2, 3, 9, 10, 11, 14, 18, 19, 20, 21, 22, 23];

const SKIP_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd/i,
];

const shouldSkipIp = (ip) => {
  if (!ip || ip === "unknown") return true;
  const cleanIp = ip.replace(/^::ffff:/, "");
  return SKIP_IP_PATTERNS.some((pattern) => pattern.test(cleanIp));
};

const normalizeIp = (ip) => {
  if (!ip) return "unknown";
  return ip.replace(/^::ffff:/, "").trim();
};

const getCacheKey = (ip) => `ip_reputation:${ip}`;

// ========================================
// CACHE HELPERS (uses existing Redis + memory fallback)
// ========================================
const getCachedResult = async (ip) => {
  const key = getCacheKey(ip);

  if (redisClient) {
    try {
      const cached = await redisClient.get(key);
      if (cached) return { ...JSON.parse(cached), fromCache: "redis" };
    } catch (err) {
      console.warn("Redis get failed:", err.message);
    }
  }

  const cached = memoryCache.get(key);
  return cached ? { ...cached, fromCache: "memory" } : null;
};

const cacheResult = async (ip, data) => {
  const key = getCacheKey(ip);

  if (redisClient) {
    try {
      if (typeof redisClient.setex === "function") {
        await redisClient.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
      } else if (typeof redisClient.set === "function") {
        await redisClient.set(
          key,
          JSON.stringify(data),
          "EX",
          CACHE_TTL_SECONDS
        );
      }
    } catch (err) {
      console.warn("Redis set failed:", err.message);
    }
  }

  // Memory fallback with simple FIFO eviction
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, data);
};

// ========================================
// MAIN IP REPUTATION CHECK
// ========================================
export const checkIpReputation = async (rawIp) => {
  const ip = normalizeIp(rawIp);

  try {
    if (shouldSkipIp(ip)) {
      return {
        isMalicious: false,
        confidenceScore: 0,
        isTor: false,
        isVpn: false,
        isProxy: false,
        country: "local",
        categories: [],
        error: null,
        skipped: true,
      };
    }

    if (process.env.ABUSEIPDB_ENABLED !== "true") {
      return {
        isMalicious: false,
        confidenceScore: 0,
        isTor: false,
        isVpn: false,
        isProxy: false,
        country: "unknown",
        categories: [],
        error: null,
        disabled: true,
      };
    }

    const cached = await getCachedResult(ip);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let response;
    try {
      response = await fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(
          ip
        )}&maxAgeInDays=90`,
        {
          headers: {
            Key: process.env.ABUSEIPDB_KEY,
            Accept: "application/json",
          },
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      return {
        isMalicious: false,
        confidenceScore: 0,
        isTor: false,
        isVpn: false,
        isProxy: false,
        country: "unknown",
        categories: [],
        error: `fetch_failed: ${fetchErr.message}`,
      };
    } finally {
      // ✅ FIX: Always clear the timeout to prevent event loop timer leaks
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return {
        isMalicious: false,
        confidenceScore: 0,
        isTor: false,
        isVpn: false,
        isProxy: false,
        country: "unknown",
        categories: [],
        error: `api_error_${response.status}`,
      };
    }

    const json = await response.json();
    const data = json.data;

    if (!data) {
      return {
        isMalicious: false,
        confidenceScore: 0,
        isTor: false,
        isVpn: false,
        isProxy: false,
        country: "unknown",
        categories: [],
        error: "no_data",
      };
    }

    const threshold = parseInt(
      process.env.ABUSEIPDB_BLOCK_THRESHOLD || "75",
      10
    );
    const score = data.abuseConfidenceScore || 0;
    const usageType = (data.usageType || "").toLowerCase();

    // ✅ FIX: Use flatMap and rely on usageType, since the /check endpoint
    // doesn't always return the full reports array to save bandwidth.
    const categories = data.reports?.flatMap((r) => r.categories) || [];

    // ✅ FIX: Check usageType first, as it's always returned by the API
    const isTor = usageType.includes("tor") || categories.includes(18);
    const isProxy =
      usageType.includes("proxy") ||
      categories.includes(9) ||
      categories.includes(14);
    const isVpn =
      usageType.includes("vpn") ||
      categories.includes(17) ||
      (isProxy && score >= 50);

    const hasHighRiskCategory = categories.some((c) =>
      HIGH_RISK_CATEGORIES.includes(c)
    );
    const isMalicious =
      score >= threshold || (hasHighRiskCategory && score >= 50);

    const result = {
      isMalicious,
      confidenceScore: score,
      isTor,
      isVpn,
      isProxy,
      country: data.countryCode || "unknown",
      isp: data.isp || "unknown",
      domain: data.domain || "unknown",
      usageType: data.usageType || "unknown",
      totalReports: data.totalReports || 0,
      categories,
      error: null,
    };

    await cacheResult(ip, result);
    return result;
  } catch (error) {
    console.error("IP reputation check failed:", error.message);
    return {
      isMalicious: false,
      confidenceScore: 0,
      isTor: false,
      isVpn: false,
      isProxy: false,
      country: "unknown",
      categories: [],
      error: error.message,
    };
  }
};

export const getIpBlockMessage = (result) => {
  if (result.isTor)
    return "Access from TOR networks is not allowed for security reasons.";
  if (result.isVpn)
    return "Please disable your VPN or proxy to continue. We restrict anonymized connections for security.";
  if (result.isProxy)
    return "Proxied connections are not allowed. Please use a direct internet connection.";
  return `Your IP address has been flagged for suspicious activity (${result.confidenceScore}% confidence). Please contact support if this is an error.`;
};

export const clearIpCache = async (ip) => {
  const key = getCacheKey(ip);
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {
      console.warn("Redis delete failed:", err.message);
    }
  }
  memoryCache.delete(key);
};

export const getCacheStats = () => ({
  redisAvailable: !!redisClient,
  memoryCacheSize: memoryCache.size,
});
