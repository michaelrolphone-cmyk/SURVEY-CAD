import test from 'node:test';
import assert from 'node:assert/strict';
import { RedisLocalStorageSyncStore, createRedisLocalStorageSyncStore } from '../src/redis-localstorage-sync-store.js';

class FakeRedisClient {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.connected = false;
    this.quitCalled = false;
  }

  async connect() {
    this.connected = true;
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async set(key, value) {
    this.map.set(key, value);
    return 'OK';
  }

  async quit() {
    this.quitCalled = true;
  }
}

test('redis localstorage sync store hydrates from redis and persists differential updates', async () => {
  const key = 'survey-cad:localstorage-sync:state';
  const redisClient = new FakeRedisClient({
    [key]: JSON.stringify({
      version: 3,
      snapshot: { activeProject: 'hartman' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  });

  const store = new RedisLocalStorageSyncStore({ redisClient, redisKey: key });
  await store.ready();

  const before = await store.getState();
  assert.equal(before.version, 3);
  assert.equal(before.snapshot.activeProject, 'hartman');

  const result = await store.applyDifferential({
    baseChecksum: before.checksum,
    operations: [{ type: 'set', key: 'activeProject', value: 'boise' }],
  });

  assert.equal(result.status, 'applied');

  const persisted = JSON.parse(redisClient.map.get(key));
  assert.equal(persisted.version, 4);
  assert.equal(persisted.snapshot.activeProject, 'boise');
});


test('redis localstorage sync store exposes the shared redis client for other stores', async () => {
  const redisClient = new FakeRedisClient();
  const store = new RedisLocalStorageSyncStore({ redisClient });
  await store.ready();

  assert.equal(store.getRedisClient(), redisClient);
  await store.close();
});

test('createRedisLocalStorageSyncStore returns null without REDIS_URL', async () => {
  const store = await createRedisLocalStorageSyncStore({ redisUrl: '' });
  assert.equal(store, null);
});

test('createRedisLocalStorageSyncStore can use injected redis client factory', async () => {
  const fakeClient = new FakeRedisClient();
  const store = await createRedisLocalStorageSyncStore({
    redisUrl: 'redis://localhost:6379',
    createClient: () => fakeClient,
  });

  assert.ok(store);
  assert.equal(fakeClient.connected, true);

  const syncResult = await store.syncIncoming({ version: 1, snapshot: { room: 'shared' } });
  assert.equal(syncResult.status, 'server-updated');

  await store.close();
  assert.equal(fakeClient.quitCalled, true);
});


test('createRedisLocalStorageSyncStore retries until redis connect succeeds', async () => {
  let attempt = 0;
  const createClient = () => ({
    async connect() {
      attempt += 1;
      if (attempt < 3) {
        throw new Error('connect not ready');
      }
    },
    async get() {
      return null;
    },
    async set() {
      return 'OK';
    },
    async quit() {
      return undefined;
    },
    async disconnect() {
      return undefined;
    },
  });

  const store = await createRedisLocalStorageSyncStore({
    redisUrl: 'redis://localhost:6379',
    redisConnectMaxWaitMs: 200,
    redisConnectRetryDelayMs: 10,
    createClient,
  });

  assert.ok(store);
  assert.equal(attempt, 3);
  await store.close();
});

test('createRedisLocalStorageSyncStore configures tls options for rediss urls', async () => {
  let receivedOptions;
  const fakeClient = new FakeRedisClient();

  const store = await createRedisLocalStorageSyncStore({
    redisUrl: 'rediss://example.com:6379',
    redisTlsRejectUnauthorized: false,
    createClient: (options) => {
      receivedOptions = options;
      return fakeClient;
    },
  });

  assert.ok(store);
  assert.equal(receivedOptions.url, 'rediss://example.com:6379');
  assert.equal(receivedOptions.socket.tls, true);
  assert.equal(receivedOptions.socket.rejectUnauthorized, false);

  await store.close();
});

test('createRedisLocalStorageSyncStore throws after retry window is exhausted', async () => {
  await assert.rejects(
    () => createRedisLocalStorageSyncStore({
      redisUrl: 'redis://localhost:6379',
      redisConnectMaxWaitMs: 80,
      redisConnectRetryDelayMs: 10,
      createClient: () => ({
        async connect() {
          throw new Error('still down');
        },
        async disconnect() {
          return undefined;
        },
      }),
    }),
    /Unable to initialize Redis localstorage sync store after/,
  );
});
