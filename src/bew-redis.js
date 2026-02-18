// bew-redis.js
import Redis from "ioredis";

function hasTlsScheme(url) {
  return typeof url === "string" && url.startsWith("rediss://");
}

function isTruthy(v) {
  if (v === undefined || v === null || v === "") return false;
  const normalized = String(v).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalsey(v) {
  if (v === undefined || v === null || v === "") return false;
  const normalized = String(v).trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

function resolveRedisTlsRejectUnauthorized() {
  // Preferred env for direct control.
  if (process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== undefined) {
    if (isTruthy(process.env.REDIS_TLS_REJECT_UNAUTHORIZED)) return true;
    if (isFalsey(process.env.REDIS_TLS_REJECT_UNAUTHORIZED)) return false;
  }

  // Backward compatibility for existing deploys.
  if (process.env.REDIS_TLS_INSECURE !== undefined) {
    if (isTruthy(process.env.REDIS_TLS_INSECURE)) return false;
    if (isFalsey(process.env.REDIS_TLS_INSECURE)) return true;
  }

  // Heroku-style Redis commonly uses self-signed cert chains.
  return false;
}

export function createRedisClient({ url, RedisCtor = Redis } = {}) {
  const resolvedUrl =
    url ||
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    "redis://127.0.0.1:6379/0";

  const useTls = hasTlsScheme(resolvedUrl) || Boolean(process.env.REDIS_TLS_URL);

  const rejectUnauthorized = resolveRedisTlsRejectUnauthorized();

  const redis = new RedisCtor(resolvedUrl, {
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
