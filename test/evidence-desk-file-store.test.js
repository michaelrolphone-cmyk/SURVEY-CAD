import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceDeskFileStore,
  InMemoryEvidenceDeskFileStore,
  RedisEvidenceDeskFileStore,
} from '../src/evidence-desk-file-store.js';

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.sets = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
    return 'OK';
  }

  async sAdd(key, value) {
    const set = this.sets.get(key) || new Set();
    set.add(value);
    this.sets.set(key, set);
    return 1;
  }

  async sRem(key, value) {
    const set = this.sets.get(key);
    if (!set) return 0;
    const existed = set.delete(value);
    if (!set.size) this.sets.delete(key);
    return existed ? 1 : 0;
  }

  async sMembers(key) {
    return [...(this.sets.get(key) || new Set())];
  }

  async del(key) {
    return this.values.delete(key) ? 1 : 0;
  }

  multi() {
    const ops = [];
    const tx = {
      set: (key, value) => { ops.push(() => this.set(key, value)); return tx; },
      sAdd: (key, value) => { ops.push(() => this.sAdd(key, value)); return tx; },
      sRem: (key, value) => { ops.push(() => this.sRem(key, value)); return tx; },
      del: (key) => { ops.push(() => this.del(key)); return tx; },
      exec: async () => {
        const out = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return tx;
  }
}

test('in-memory evidence desk store supports create/read/update/delete/list', async () => {
  const store = new InMemoryEvidenceDeskFileStore();
  const created = await store.createFile({
    projectId: 'proj-1',
    folderKey: 'drawings',
    originalFileName: 'plan.dxf',
    extension: 'dxf',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('abc'),
  });

  const fileName = created.reference.metadata.storedName;
  const loaded = await store.getFile('proj-1', 'drawings', fileName);
  assert.equal(loaded.buffer.toString(), 'abc');

  const updated = await store.updateFile({
    projectId: 'proj-1',
    folderKey: 'drawings',
    fileName,
    originalFileName: 'plan-rev1.dxf',
    extension: 'dxf',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('xyz'),
  });
  assert.equal(updated.reference.metadata.fileName, 'plan-rev1.dxf');

  const list = await store.listFiles('proj-1', ['drawings']);
  assert.equal(list.files.length, 1);
  assert.equal(list.filesByFolder.drawings.length, 1);

  const deleted = await store.deleteFile('proj-1', 'drawings', fileName);
  assert.equal(deleted, true);
  assert.equal(await store.getFile('proj-1', 'drawings', fileName), null);
});

test('redis evidence desk store indexes files by folder', async () => {
  const redis = new FakeRedis();
  const store = new RedisEvidenceDeskFileStore(redis);

  const created = await store.createFile({
    projectId: 'proj-2',
    folderKey: 'deeds',
    originalFileName: 'deed.pdf',
    extension: 'pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('deed-content'),
  });

  const fileName = created.reference.metadata.storedName;
  const fetched = await store.getFile('proj-2', 'deeds', fileName);
  assert.equal(fetched.buffer.toString(), 'deed-content');

  const list = await store.listFiles('proj-2', ['deeds', 'drawings']);
  assert.equal(list.filesByFolder.deeds.length, 1);
  assert.equal(list.filesByFolder.drawings.length, 0);

  await store.deleteFile('proj-2', 'deeds', fileName);
  const afterDelete = await store.listFiles('proj-2', ['deeds']);
  assert.equal(afterDelete.files.length, 0);
});

test('createEvidenceDeskFileStore falls back to in-memory when redis connect stalls', async () => {
  let quitCalled = false;
  const neverConnectingClient = {
    on() {},
    connect: () => new Promise(() => {}),
    quit: async () => { quitCalled = true; },
  };

  const result = await createEvidenceDeskFileStore({
    redisUrl: 'redis://example.invalid:6379',
    connectTimeoutMs: 5,
    createRedisClient: () => neverConnectingClient,
  });

  assert.equal(result.type, 'memory');
  assert.equal(result.redisClient, null);
  assert.equal(quitCalled, true);
});

test('createEvidenceDeskFileStore uses redis when connection succeeds', async () => {
  const redis = new FakeRedis();
  let connected = false;
  const connectedClient = {
    ...redis,
    on() {},
    connect: async () => { connected = true; },
    quit: async () => {},
  };

  const result = await createEvidenceDeskFileStore({
    redisUrl: 'redis://localhost:6379',
    createRedisClient: () => connectedClient,
  });

  assert.equal(connected, true);
  assert.equal(result.type, 'redis');
  assert.equal(result.redisClient, connectedClient);
});
