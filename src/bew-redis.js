// bew-redis.js
import Redis from "ioredis";

function hasTlsScheme(url) {
  return typeof url === "string" && url.startsWith("rediss://");
}

export function createRedisClient() {
  // Heroku Redis typically sets REDIS_URL.
  // Some stacks/addons also expose REDIS_TLS_URL.
  const url =
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    "redis://127.0.0.1:6379/0";

  const useTls = hasTlsScheme(url) || Boolean(process.env.REDIS_TLS_URL);

  const redis = new Redis(url, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    lazyConnect: false,

    // TLS: ioredis will negotiate TLS automatically for rediss://
    // This block lets you handle environments that require explicit tls options.
    ...(useTls
      ? {
          tls: {
            // Usually NOT needed for Heroku (certs are valid),
            // but if you see CERT_* or UNABLE_TO_VERIFY_* errors,
            // set REDIS_TLS_INSECURE=1 (below) to bypass verification.
            rejectUnauthorized: false
          },
        }
      : {}),
  });

  redis.on("error", (err) => {
    console.error("[redis] error:", err?.message || err);
  });

  redis.on("connect", () => {
    console.log("[redis] connected:", url.replace(/:\/\/.*@/, "://***:***@"));
  });

  return redis;
}
