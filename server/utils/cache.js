import Redis from "ioredis";

// Connect to Redis (falls back gracefully if unavailable)
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
    })
  : null;

// Handle connection errors silently (don't crash the app)
if (redis) {
  redis.on("error", (err) => console.warn("Redis error:", err.message));
  redis.on("connect", () => console.log("✅ Redis connected"));
}

/**
 * Caches the JSON response of a route for `ttl` seconds.
 * Cache key is built from: prefix + user ID + query params.
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

      // Intercept res.json to cache the response before sending
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode < 400) {
          redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(() => {});
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.warn("Cache error, falling back to DB:", err.message);
      next(); // Fail open — always serve data, even without cache
    }
  };
};

/**
 * Invalidate cache entries matching a pattern.
 * Use after mutations (post, like, match, etc.)
 */
export const invalidateCache = async (pattern) => {
  if (!redis) return;
  try {
    // Use SCAN instead of KEYS (non-blocking, production-safe)
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
 * Most common use case: when a user posts/likes/matches.
 */
export const invalidateUserCache = async (userId, prefixes = []) => {
  if (!redis || !userId) return;
  const id = userId.toString();
  await Promise.all(
    prefixes.map((prefix) => invalidateCache(`${prefix}:${id}:*`))
  );
};

export default redis;
