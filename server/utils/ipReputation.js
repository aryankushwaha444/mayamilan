// server/utils/ipReputation.js
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
const CACHE_TTL_SECONDS = 86400;
const memoryCache = new Map();
const MEMORY_CACHE_MAX = 10000;

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

  // Try existing Redis client
  if (redisClient) {
    try {
      const cached = await redisClient.get(key);
      if (cached) return { ...JSON.parse(cached), fromCache: "redis" };
    } catch (err) {
      console.warn("Redis get failed:", err.message);
    }
  }

  // Fallback to memory
  const cached = memoryCache.get(key);
  return cached ? { ...cached, fromCache: "memory" } : null;
};

const cacheResult = async (ip, data) => {
  const key = getCacheKey(ip);

  if (redisClient) {
    try {
      // ioredis uses setex for TTL
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

  // Also store in memory as fallback
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
      clearTimeout(timeoutId);
    } catch (fetchErr) {
      clearTimeout(timeoutId);
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
    const categories = data.reports?.map((r) => r.categories).flat() || [];

    const isTor = categories.includes(18) && score >= 50;
    const isProxy = categories.includes(9) || categories.includes(14);
    const isVpn = isProxy && score >= 50;
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
