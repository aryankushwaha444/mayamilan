import Redis from "ioredis";

// ============ SINGLETON PATTERN ============
// Ensures only ONE Redis connection exists per process
let redisInstance = null;

function getRedis() {
  if (!process.env.REDIS_URL) {
    return null; // No Redis URL = skip caching entirely
  }

  if (!redisInstance) {
    redisInstance = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        // Exponential backoff: 50ms, 100ms, 200ms, 400ms... max 2s
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true; // Reconnect on read-only errors
        }
        return false;
      },
      // TLS for Upstash
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      // Connection timeout
      connectTimeout: 10000,
      // Keep alive
      keepAlive: true,
      // Don't auto-subscribe (saves resources)
      lazyConnect: false,
    });

    // Connection event handlers
    redisInstance.on("connect", () => {
      console.log("✅ Redis connected");
    });

    redisInstance.on("error", (err) => {
      // Only log real errors, not transient disconnects
      if (err.message && !err.message.includes("ECONNRESET")) {
        console.warn("⚠️ Redis error:", err.message);
      }
    });

    redisInstance.on("close", () => {
      // Silent reconnect (ioredis handles it automatically)
    });

    redisInstance.on("reconnecting", () => {
      // Silent reconnect
    });
  }

  return redisInstance;
}

// Get the singleton instance
const redis = getRedis();

// ============ CACHING FUNCTIONS ============

/**
 * Caches the JSON response of a route for `ttl` seconds.
 */
export const cached = (prefix, ttl = 60) => {
  return async (req, res, next) => {
    if (!redis) return next(); // Redis unavailable → skip cache

    try {
      const userId = req.user?._id?.toString() || "guest";
      const queryString = JSON.stringify(req.query || {});
      const cacheKey = `${prefix}:${userId}:${queryString}`;

      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode < 400) {
          redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(() => {});
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.warn("Cache middleware error:", err.message);
      next(); // Fail open
    }
  };
};

/**
 * Invalidate cache entries matching a pattern.
 */
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
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.warn("Cache invalidation error:", err.message);
  }
};

/**
 * Invalidate cache for a specific user across multiple prefixes.
 */
export const invalidateUserCache = async (userId, prefixes = []) => {
  if (!redis || !userId) return;
  const id = userId.toString();
  await Promise.all(
    prefixes.map((prefix) => invalidateCache(`${prefix}:${id}:*`))
  );
};

// Graceful shutdown
process.on("SIGTERM", () => {
  if (redis) {
    redis.quit().catch(() => {});
  }
});

process.on("SIGINT", () => {
  if (redis) {
    redis.quit().catch(() => {});
  }
});

export default redis;
