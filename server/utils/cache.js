import Redis from "ioredis";

// ═══════════════════════════════════════════
// SUPER-SINGLETON (Hot-Reload Safe)
// ═══════════════════════════════════════════
const REDIS_GLOBAL_KEY = "__MAYA_MILAN_REDIS__";
const CONNECTED_FLAG_KEY = "__MAYA_MILAN_REDIS_CONNECTED__";

if (!globalThis[REDIS_GLOBAL_KEY]) {
  if (process.env.REDIS_URL) {
    console.log("🔌 Creating Redis connection (singleton)...");

    const instance = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),

      // ✅ FIX: Reconnect on managed Redis failovers (AWS ElastiCache, Upstash, etc.)
      reconnectOnError: (err) => {
        const targetErrors = ["READONLY", "ECONNRESET", "Connection is closed"];
        if (targetErrors.some((e) => err.message.includes(e))) {
          return true; // Force reconnect
        }
        return false;
      },

      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      connectTimeout: 10000,
      keepAlive: true,
      family: 4, // Force IPv4 to prevent DNS resolution delays
      lazyConnect: false,
    });

    instance.on("connect", () => {
      if (!globalThis[CONNECTED_FLAG_KEY]) {
        console.log("✅ Redis connected (singleton)");
        globalThis[CONNECTED_FLAG_KEY] = true;
      }
    });

    instance.on("error", (err) => {
      const msg = err?.message || String(err);
      const transientErrors = [
        "ECONNRESET",
        "ETIMEDOUT",
        "EPIPE",
        "ECONNREFUSED",
        "Connection is closed",
      ];
      if (transientErrors.some((e) => msg.includes(e))) return; // Silent
      console.warn("⚠️ Redis error:", msg);
    });

    instance.on("close", () => {});
    instance.on("reconnecting", () => {});
    instance.on("end", () => {});

    globalThis[REDIS_GLOBAL_KEY] = instance;
  } else {
    console.log("ℹ️  Redis: no REDIS_URL, caching disabled");
    globalThis[REDIS_GLOBAL_KEY] = null;
  }
}

const redis = globalThis[REDIS_GLOBAL_KEY];

// ═══════════════════════════════════════════
// CACHING MIDDLEWARE
// ═══════════════════════════════════════════

export const cached = (prefix, ttl = 60) => {
  return async (req, res, next) => {
    if (!redis) return next();

    // ✅ ADDED: Validate TTL to prevent accidental long-term caching
    if (ttl < 1 || ttl > 86400) {
      console.warn(`⚠️ Invalid cache TTL: ${ttl}. Using default 60s.`);
      ttl = 60;
    }

    try {
      const userId = req.user?._id?.toString() || "guest";

      // Sort query parameters to ensure ?a=1&b=2 and ?b=2&a=1 hit the same cache
      const sortedQuery = Object.keys(req.query || {})
        .sort()
        .reduce((obj, key) => {
          obj[key] = req.query[key];
          return obj;
        }, {});

      // ✅ ADDED: Sanitize prefix to prevent cache key injection
      const safePrefix = prefix.replace(/[^a-zA-Z0-9_:]/g, "_");

      const cacheKey = `${safePrefix}:${userId}:${JSON.stringify(sortedQuery)}`;

      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        res.set("X-Cache", "HIT");
        try {
          return res.json(JSON.parse(cachedData));
        } catch (parseError) {
          // If cached data is corrupted, delete it and fall through to controller
          redis.del(cacheKey).catch(() => {});
        }
      }

      res.set("X-Cache", "MISS");

      // Intercept response
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const cacheResponse = (data) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(() => {});
        }
      };

      res.json = (data) => {
        cacheResponse(data);
        return originalJson(data);
      };

      // Also intercept res.send() if it's passed an object
      res.send = (data) => {
        if (typeof data === "object" && data !== null) {
          cacheResponse(data);
        }
        return originalSend(data);
      };

      next();
    } catch (err) {
      // Fail-open: if Redis is down, just serve from DB
      next();
    }
  };
};
// ═══════════════════════════════════════════
// CACHE INVALIDATION
// ═══════════════════════════════════════════

export const invalidateCache = async (pattern) => {
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      // ✅ Using SCAN instead of KEYS prevents blocking the Redis event loop
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    console.warn("Cache invalidation error:", err.message);
  }
};

export const invalidateUserCache = async (userId, prefixes = []) => {
  if (!redis || !userId) return;
  const id = userId.toString();
  await Promise.all(
    prefixes.map((prefix) => invalidateCache(`${prefix}:${id}:*`))
  );
};

// ═══════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════

const gracefulShutdown = () => {
  if (redis) {
    redis.quit().catch(() => {});
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export default redis;
