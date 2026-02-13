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
}

export async function createRedisLocalStorageSyncStore({
  redisUrl = process.env.REDIS_URL,
  redisKey = process.env.LOCALSTORAGE_SYNC_REDIS_KEY || DEFAULT_REDIS_KEY,
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
  const redisClient = clientFactory({ url: redisUrl });
  await redisClient.connect();
  const store = new RedisLocalStorageSyncStore({ redisClient, redisKey });
  await store.ready();
  return store;
}
