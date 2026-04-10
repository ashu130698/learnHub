import Redis from "ioredis";
import { env } from "./env";

//Single REdis client instance - import this wherever you need redis
// Never create multiple clients; it wastes connections
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    //Wait longer between each retry: 50ms, 100ms, 200ms... max 2000ms
    const delay = Math.min(times * 50, 2000);
    console.log("Redis reconnecting... attempt ${times} (${delay}ms delay)");
    return delay;
  },
  lazyConnect: true, // dont connect until first command is sent
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error:", err.message));

// ─────────────────────────────────────────────────────────────
// getOrSet: the cache-aside pattern
//
// How it works:
// 1. Check Redis for cached data
// 2. If found (cache hit) → return it immediately, skip DB
// 3. If not found (cache miss) → run fetcher (DB query), store result in Redis, return it
//
// Every resolver that needs caching will use this function
// ─────────────────────────────────────────────────────────────

export async function getOrSet<T>(
  key: string, // Redis key, e.g. "modules:list"
  fetcher: () => Promise<T>, // function that queries the DB if cache misses
  ttlSeconds: number, // how long to cache the result
): Promise<T> {
  const cached = await redis.get(key);

  if (cached) {
    // Cache hit — parse JSON string back into object and return
    return JSON.parse(cached) as T;
  }

  // Cache miss — run the DB query
  const data = await fetcher();

  // Store in Redis as JSON string with expiry
  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);

  return data;
}

// Delete all keys matching a pattern
// Used when data changes and we need to clear stale cache
// Example: invalidatePattern('modules:*') clears all module cache entries
export async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(
      `Cache invalidated: ${keys.length} key(s) matching "${pattern}"`,
    );
  }
}

export default redis;