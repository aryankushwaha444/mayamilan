import Redis from "ioredis";

// ============ GLOBAL SINGLETON ============
if (!globalThis.__REDIS_INSTANCE__) {
  if (process.env.REDIS_URL) {
    console.log("🔌 Creating Redis connection (singleton)...");

    globalThis.__REDIS_INSTANCE__ = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: () => false, // Don't auto-reconnect on error
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      connectTimeout: 10000,
      keepAlive: true,
      family: 4,
      lazyConnect: false,
    });

    // Track connection state globally
    globalThis.__REDIS_HAS_CONNECTED__ = false;

    globalThis.__REDIS_INSTANCE__.on("connect", () => {
      if (!globalThis.__REDIS_HAS_CONNECTED__) {
        console.log("✅ Redis connected");
        globalThis.__REDIS_HAS_CONNECTED__ = true;
      }
      // Silent on reconnects
    });

    globalThis.__REDIS_INSTANCE__.on("error", (err) => {
      // Only log non-transient errors
      const msg = err?.message || String(err);
      if (
        !msg.includes("ECONNRESET") &&
        !msg.includes("ETIMEDOUT") &&
        !msg.includes("ECONNREFUSED")
      ) {
        console.warn("⚠️ Redis error:", msg);
      }
    });

    globalThis.__REDIS_INSTANCE__.on("close", () => {
      // Silent - ioredis will auto-reconnect
    });

    globalThis.__REDIS_INSTANCE__.on("reconnecting", () => {
      // Silent
    });

    globalThis.__REDIS_INSTANCE__.on("end", () => {
      // Silent
    });
  } else {
    console.log("ℹ️  Redis: no REDIS_URL, caching disabled");
    globalThis.__REDIS_INSTANCE__ = null;
  }
}

const redis = globalThis.__REDIS_INSTANCE__;

// ============ CACHING FUNCTIONS ============

export const cached = (prefix, ttl = 60) => {
  return async (req, res, next) => {
    if (!redis) return next();

    try {
      const userId = req.user?._id?.toString() || "guest";
      const queryString = JSON.stringify(req.query || {});
      const cacheKey = `${prefix}:${userId}:${queryString}`;

      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode < 400) {
          redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(() => {});
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      next();
    }
  };
};

export const invalidateCache = async (pattern) => {
  if (!redis) return;
  try {
    let cursor = "0";
    do {
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

process.on("SIGTERM", () => redis?.quit().catch(() => {}));
process.on("SIGINT", () => redis?.quit().catch(() => {}));

export default redis;
