import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceDeskFileStore,
  InMemoryEvidenceDeskFileStore,
  RedisEvidenceDeskFileStore,
  S3EvidenceDeskFileStore,
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

class FakeS3 {
  constructor() {
    this.objects = new Map();
  }

  async getObject(key) {
    return this.objects.get(key) || null;
  }

  async putObject(key, body) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
    this.objects.set(key, buffer);
  }

  async deleteObject(key) {
    this.objects.delete(key);
  }

  async listObjects(prefix = '') {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix));
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
    pointNumber: '17',
  });

  const fileName = created.reference.metadata.storedName;
  const loaded = await store.getFile('proj-1', 'drawings', fileName);
  assert.equal(loaded.buffer.toString(), 'abc');
  assert.equal(loaded.pointNumber, '17');

  const updated = await store.updateFile({
    projectId: 'proj-1',
    folderKey: 'drawings',
    fileName,
    originalFileName: 'plan-rev1.dxf',
    extension: 'dxf',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('xyz'),
    pointNumber: '18',
  });
  assert.equal(updated.reference.metadata.fileName, 'plan-rev1.dxf');
  assert.equal(updated.reference.metadata.pointNumber, '18');

  const metadataUpdated = await store.updateFileMetadata('proj-1', 'drawings', fileName, { pointNumber: '19' });
  assert.equal(metadataUpdated.reference.metadata.pointNumber, '19');

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
    pointNumber: '88',
  });

  const fileName = created.reference.metadata.storedName;
  const fetched = await store.getFile('proj-2', 'deeds', fileName);
  assert.equal(fetched.buffer.toString(), 'deed-content');
  assert.equal(fetched.pointNumber, '88');

  const list = await store.listFiles('proj-2', ['deeds', 'drawings']);
  assert.equal(list.filesByFolder.deeds.length, 1);
  assert.equal(list.filesByFolder.deeds[0].pointNumber, '88');
  assert.equal(list.filesByFolder.drawings.length, 0);

  await store.deleteFile('proj-2', 'deeds', fileName);
  const afterDelete = await store.listFiles('proj-2', ['deeds']);
  assert.equal(afterDelete.files.length, 0);
});

test('s3 evidence desk store supports file CRUD and thumbnail caching', async () => {
  const s3 = new FakeS3();
  const store = new S3EvidenceDeskFileStore(s3, { bucket: 'survey-foundry', prefix: 'test/evidence' });

  const created = await store.createFile({
    projectId: 'proj-s3',
    folderKey: 'photos',
    originalFileName: 'capture.jpg',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('jpeg-data'),
    thumbnailBuffer: Buffer.from('thumb-data'),
    thumbnailMimeType: 'image/png',
  });

  const fileName = created.reference.metadata.storedName;
  const loaded = await store.getFile('proj-s3', 'photos', fileName);
  assert.equal(loaded.buffer.toString(), 'jpeg-data');
  assert.equal(loaded.thumbnailBuffer.toString(), 'thumb-data');

  await store.writeCachedPdfThumbnail('pdf-key', Buffer.from('pdf-thumb'));
  const thumb = await store.readCachedPdfThumbnail('pdf-key');
  assert.equal(thumb.toString(), 'pdf-thumb');

  const list = await store.listFiles('proj-s3', ['photos']);
  assert.equal(list.filesByFolder.photos.length, 1);

  const moved = await store.moveFile('proj-s3', 'photos', fileName, 'deeds');
  assert.equal(moved.folder, 'deeds');

  const deleted = await store.deleteFile('proj-s3', 'deeds', fileName);
  assert.equal(deleted, true);
});

test('createEvidenceDeskFileStore prefers configured S3 object storage over redis', async () => {
  const sharedRedis = new FakeRedis();
  const s3 = new FakeS3();
  const result = await createEvidenceDeskFileStore({
    redisClient: sharedRedis,
    s3Client: s3,
    s3Config: { bucket: 'survey-foundry', prefix: 'test/evidence', region: 'us-east-1' },
  });

  assert.equal(result.type, 's3');
  assert.equal(result.redisClient, null);
});

test('createEvidenceDeskFileStore detects Stackhero MinIO env keys and defaults bucket', async () => {
  const originalEnv = { ...process.env };
  process.env.STACKHERO_MINIO_HOST = 'minio.stackhero.network';
  process.env.STACKHERO_MINIO_ACCESS_KEY = 'access-key';
  process.env.STACKHERO_MINIO_SECRET_KEY = 'secret-key';
  delete process.env.EVIDENCE_DESK_S3_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO;
  delete process.env.EVIDENCE_DESK_S3_BUCKET;

  try {
    const result = await createEvidenceDeskFileStore({
      redisClient: new FakeRedis(),
      s3Client: new FakeS3(),
    });

    assert.equal(result.type, 's3');
    assert.equal(result.redisClient, null);
    assert.equal(result.store.bucket, 'survey-foundry');
  } finally {
    process.env = originalEnv;
  }
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
    s3Config: null,
  });

  assert.equal(result.type, 'memory');
  assert.equal(result.redisClient, null);
  assert.equal(quitCalled, true);
});

test('createEvidenceDeskFileStore returns quickly when redis quit hangs after connect timeout', async () => {
  let disconnectCalled = false;
  const hangingClient = {
    on() {},
    connect: () => new Promise(() => {}),
    disconnect: () => { disconnectCalled = true; },
    quit: () => new Promise(() => {}),
  };

  const startedAt = Date.now();
  const result = await createEvidenceDeskFileStore({
    redisUrl: 'redis://example.invalid:6379',
    connectTimeoutMs: 5,
    disconnectTimeoutMs: 10,
    createRedisClient: () => hangingClient,
    s3Config: null,
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.type, 'memory');
  assert.equal(disconnectCalled, true);
  assert.ok(elapsedMs < 500, `fallback should return quickly, got ${elapsedMs}ms`);
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
    s3Config: null,
  });

  assert.equal(connected, true);
  assert.equal(result.type, 'redis');
  assert.equal(result.redisClient, connectedClient);
});

test('redis evidence desk store maps redis maxmemory OOM errors to HTTP 507 semantics', async () => {
  const redis = new FakeRedis();
  redis.multi = () => ({
    set: () => redis.multi(),
    sAdd: () => redis.multi(),
    del: () => redis.multi(),
    sRem: () => redis.multi(),
    exec: async () => {
      throw new Error("OOM command not allowed when used memory > 'maxmemory'.");
    },
  });

  const store = new RedisEvidenceDeskFileStore(redis);

  await assert.rejects(
    () => store.createFile({
      projectId: 'proj-oom',
      folderKey: 'drawings',
      originalFileName: 'overflow.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('x'),
    }),
    (error) => {
      assert.equal(error.status, 507);
      assert.match(error.message, /storage is full/i);
      return true;
    },
  );
});
