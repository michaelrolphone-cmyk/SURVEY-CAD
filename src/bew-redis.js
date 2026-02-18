// bew-redis.js
import Redis from "ioredis";

function hasTlsScheme(url) {
  return typeof url === "string" && url.startsWith("rediss://");
}

function isTruthy(v) {
  return v === "1" || v === "true" || v === "yes";
}

export function createRedisClient({ url } = {}) {
  const resolvedUrl =
    url ||
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    "redis://127.0.0.1:6379/0";

  const useTls = hasTlsScheme(resolvedUrl) || Boolean(process.env.REDIS_TLS_URL);

  // Default SAFE: verify certs.
  // If your provider uses a self-signed chain, set REDIS_TLS_INSECURE=1 on Heroku.
  const rejectUnauthorized = !isTruthy(process.env.REDIS_TLS_INSECURE);

  const redis = new Redis(resolvedUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,

    // critical: don't auto-connect until listeners are attached
    lazyConnect: true,

    ...(useTls
      ? {
          tls: {
            rejectUnauthorized,
          },
        }
      : {}),
  });

  redis.on("error", (err) => {
    console.error("[redis] error:", err?.message || err);
  });

  redis.on("connect", () => {
    console.log("[redis] connected:", resolvedUrl.replace(/:\/\/.*@/, "://***:***@"));
  });

  redis.on("ready", () => {
    console.log("[redis] ready");
  });

  return redis;
}
