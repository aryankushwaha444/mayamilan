import Redis from "ioredis";

// ============ SUPER-SINGLETON ============
// Use globalThis + a flag that persists across hot reloads and module re-evaluations
const REDIS_GLOBAL_KEY = "__MAYA_MILAN_REDIS__";
const CONNECTED_FLAG_KEY = "__MAYA_MILAN_REDIS_CONNECTED__";

if (!globalThis[REDIS_GLOBAL_KEY]) {
  if (process.env.REDIS_URL) {
    console.log("🔌 Creating Redis connection (singleton)...");

    const instance = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: () => false,
      tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
      connectTimeout: 10000,
      keepAlive: true,
      family: 4,
      lazyConnect: false,
    });

    // Log FIRST connect only (across all processes sharing this global)
    instance.on("connect", () => {
      if (!globalThis[CONNECTED_FLAG_KEY]) {
        console.log("✅ Redis connected (singleton)");
        globalThis[CONNECTED_FLAG_KEY] = true;
      }
    });

    // Only log REAL errors (not disconnects/reconnects)
    instance.on("error", (err) => {
      const msg = err?.message || String(err);
      // Silently ignore transient network errors
      const transientErrors = [
        "ECONNRESET",
        "ETIMEDOUT",
        "EPIPE",
        "ECONNREFUSED",
        "Connection is closed",
      ];
      if (transientErrors.some((e) => msg.includes(e))) {
        return; // Silent - ioredis handles these automatically
      }
      console.warn("⚠️ Redis error:", msg);
    });

    // All these are silent - ioredis reconnects automatically
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

// ============ CACHING FUNCTIONS (unchanged) ============

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
