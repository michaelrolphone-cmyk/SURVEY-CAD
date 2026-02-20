import { LocalStorageSyncStore } from './localstorage-sync-store.js';

const DEFAULT_REDIS_KEY = 'survey-cad:localstorage-sync:state';

function safeStateFromRedis(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      version: parsed.version,
      snapshot: parsed.snapshot,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return {};
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRedisClientOptions(redisUrl, tlsRejectUnauthorized) {
  const options = { url: redisUrl };
  if (typeof redisUrl === 'string' && redisUrl.startsWith('rediss://')) {
    options.socket = {
      tls: true,
      rejectUnauthorized: tlsRejectUnauthorized,
    };
  }
  return options;
}

export class RedisLocalStorageSyncStore {
  #key;

  #redis;

  #store;

  #ready;

  constructor({ redisClient, redisKey = DEFAULT_REDIS_KEY, initialState = {} } = {}) {
    if (!redisClient) {
      throw new Error('redisClient is required.');
    }

    this.#redis = redisClient;
    this.#key = redisKey;
    this.#store = new LocalStorageSyncStore(initialState);
    this.#ready = this.#hydrate();
  }

  async #hydrate() {
    const raw = await this.#redis.get(this.#key);
    const cachedState = safeStateFromRedis(raw);
    this.#store = new LocalStorageSyncStore(cachedState);
  }

  async ready() {
    await this.#ready;
    console.log("Redis is Ready");
  }

  async getState() {
    await this.#ready;
    return this.#store.getState();
  }

  async #persist() {
    const state = this.#store.getState();
    await this.#redis.set(this.#key, JSON.stringify(state));
  }

  async syncIncoming(payload = {}) {
    await this.#ready;
    const result = this.#store.syncIncoming(payload);
    if (result.status === 'server-updated' || result.status === 'in-sync') {
      await this.#persist();
    }
    return result;
  }

  async applyDifferential(payload = {}) {
    await this.#ready;
    const result = this.#store.applyDifferential(payload);
    if (result.status === 'applied') {
      await this.#persist();
    }
    return result;
  }

  async applyDifferentialBatch(payload = {}) {
    await this.#ready;
    const result = this.#store.applyDifferentialBatch(payload);
    if (result.status === 'applied') {
      await this.#persist();
    }
    return result;
  }

  async close() {
    if (typeof this.#redis.quit === 'function') {
      await this.#redis.quit();
    }
  }

  getRedisClient() {
    return this.#redis;
  }
}

export async function createRedisLocalStorageSyncStore({
  redisUrl = process.env.REDIS_URL,
  redisKey = process.env.LOCALSTORAGE_SYNC_REDIS_KEY || DEFAULT_REDIS_KEY,
  redisConnectMaxWaitMs = Number(process.env.REDIS_CONNECT_MAX_WAIT_MS) || 15000,
  redisConnectRetryDelayMs = Number(process.env.REDIS_CONNECT_RETRY_DELAY_MS) || 750,
  redisTlsRejectUnauthorized = parseBoolean(process.env.REDIS_TLS_REJECT_UNAUTHORIZED, false),
  createClient,
} = {}) {
  if (!redisUrl) {
    return null;
  }

  const resolveClientFactory = async () => {
    if (createClient) return createClient;
    const redisModule = await import('redis');
    return redisModule.createClient;
  };

  const clientFactory = await resolveClientFactory();
  const maxWaitMs = Math.max(redisConnectMaxWaitMs, 0);
  const retryDelayMs = Math.max(redisConnectRetryDelayMs, 50);
  const startedAt = Date.now();
  const redisClientOptions = buildRedisClientOptions(redisUrl, redisTlsRejectUnauthorized);

  let attempt = 0;
  let lastError;

  while ((Date.now() - startedAt) <= maxWaitMs) {
    attempt += 1;
    const redisClient = clientFactory(redisClientOptions);

    try {
      if (typeof redisClient.on === 'function') {
        redisClient.on('error', (err) => {
          console.error(`Redis client error: ${err?.message || err}`);
        });
      }
      await redisClient.connect();
      const store = new RedisLocalStorageSyncStore({ redisClient, redisKey });
      await store.ready();
      return store;
    } catch (err) {
      lastError = err;
      if (typeof redisClient.disconnect === 'function') {
        await redisClient.disconnect().catch(() => {});
      } else if (typeof redisClient.quit === 'function') {
        await redisClient.quit().catch(() => {});
      }
    }

    if ((Date.now() - startedAt) >= maxWaitMs) {
      break;
    }

    await wait(retryDelayMs);
  }

  const errorMessage = lastError?.message || String(lastError || 'unknown redis connection error');
  throw new Error(`Unable to initialize Redis localstorage sync store after ${attempt} attempt(s): ${errorMessage}`);
}
