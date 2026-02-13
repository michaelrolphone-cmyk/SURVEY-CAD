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
