// bew-redis.js
import Redis from "ioredis";

function redactRedisUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return String(url || "");
  }
}

function isRediss(url) {
  return typeof url === "string" && url.startsWith("rediss://");
}

function envTruthy(v) {
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Creates and CONNECTS a Redis client suitable for Heroku.
 * - Prefers REDIS_TLS_URL when present.
 * - Uses lazyConnect so we can attach error listeners BEFORE connecting.
 * - Optionally disables TLS verification with REDIS_TLS_INSECURE=1 (only if you must).
 */
export async function createRedisClient() {
  // Prefer TLS url if available (common on Heroku / Redis add-ons).
  const url =
    process.env.REDIS_TLS_URL ||
    process.env.REDIS_URL ||
    "redis://127.0.0.1:6379/0";

  const tlsWanted = isRediss(url);
  const tlsInsecure = envTruthy(process.env.REDIS_TLS_INSECURE);

  // If the provider gives a redis:// URL but requires TLS, you should set REDIS_TLS_URL.
  // This guard makes that failure obvious instead of “mystery TLS errors”.
  if (!tlsWanted && process.env.REDIS_TLS_URL && process.env.REDIS_URL === url) {
    console.warn(
      "[redis] REDIS_TLS_URL is set but REDIS_URL was selected; using REDIS_TLS_URL is recommended."
    );
  }

  let hostname = null;
  try {
    hostname = new URL(url).hostname || null;
  } catch {}

  const redis = new Redis(url, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,

    // Critical: avoid “unhandled error event” races by connecting AFTER listeners are attached.
    lazyConnect: true,

    // Reasonable defaults for dyno networking.
    connectTimeout: 10_000,
    keepAlive: 10_000,

    // TLS options only when using rediss://
    ...(tlsWanted
      ? {
          tls: {
            // If you are truly on Heroku Redis, you typically want verification ON.
            // If you’re seeing “self-signed certificate…” from your add-on/provider,
            // set REDIS_TLS_INSECURE=1 to bypass verification.
            rejectUnauthorized: !tlsInsecure,

            // Some providers require SNI; make it explicit.
            ...(hostname ? { servername: hostname } : {}),
          },
        }
      : {}),
  });

  // ALWAYS attach error handler before connecting.
  redis.on("error", (err) => {
    console.error("[redis] error:", err?.message || err);
  });

  redis.on("connect", () => {
    console.log("[redis] connect:", redactRedisUrl(url));
  });

  redis.on("ready", () => {
    console.log("[redis] ready");
  });

  redis.on("reconnecting", (ms) => {
    console.warn("[redis] reconnecting in", ms, "ms");
  });

  redis.on("end", () => {
    console.warn("[redis] connection ended");
  });

  // Connect + verify with a ping so callers can fail fast and fall back cleanly.
  await redis.connect();
  await redis.ping();

  return redis;
}
