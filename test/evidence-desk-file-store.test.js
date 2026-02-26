import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidenceDeskFileStore,
  InMemoryEvidenceDeskFileStore,
  purgeLegacyRedisBinaryKeys,
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

  async del(...keys) {
    let removed = 0;
    for (const key of keys) {
      if (this.values.delete(key)) removed += 1;
    }
    return removed;
  }

  async unlink(...keys) {
    return this.del(...keys);
  }

  async scan(cursor = '0', { MATCH: matchPattern = '*', COUNT: count = 10 } = {}) {
    const escaped = String(matchPattern).replace(/[|\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    const allKeys = [...this.values.keys()].filter((key) => regex.test(key)).sort();
    const start = Number(cursor) || 0;
    const next = allKeys.slice(start, start + Number(count || 10));
    const nextCursor = start + next.length >= allKeys.length ? '0' : String(start + next.length);
    return [nextCursor, next];
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

test('createEvidenceDeskFileStore supports Stackhero root key env vars', async () => {
  const originalEnv = { ...process.env };
  process.env.STACKHERO_MINIO_HOST = 's3.stackhero.network';
  process.env.STACKHERO_MINIO_ROOT_ACCESS_KEY = 'root-access';
  process.env.STACKHERO_MINIO_ROOT_SECRET_KEY = 'root-secret';
  delete process.env.STACKHERO_MINIO_ACCESS_KEY;
  delete process.env.STACKHERO_MINIO_SECRET_KEY;
  delete process.env.EVIDENCE_DESK_S3_ENDPOINT;
  delete process.env.EVIDENCE_DESK_S3_ACCESS_KEY_ID;
  delete process.env.EVIDENCE_DESK_S3_SECRET_ACCESS_KEY;
  delete process.env.EVIDENCE_DESK_S3_REGION;
  delete process.env.EVIDENCE_DESK_S3_BUCKET;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO;

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

test('createEvidenceDeskFileStore uses path-style requests for Stackhero MinIO host config', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const requests = [];

  process.env.STACKHERO_MINIO_HOST = 'minio.stackhero.network';
  process.env.STACKHERO_MINIO_ACCESS_KEY = 'access-key';
  process.env.STACKHERO_MINIO_SECRET_KEY = 'secret-key';
  process.env.STACKHERO_MINIO_BUCKET = 'survey-foundry';
  delete process.env.EVIDENCE_DESK_S3_FORCE_PATH_STYLE;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO_FORCE_PATH_STYLE;
  delete process.env.STACKHERO_MINIO_FORCE_PATH_STYLE;
  delete process.env.EVIDENCE_DESK_S3_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO;

  global.fetch = async (url) => {
    requests.push(String(url));
    return {
      status: 200,
      arrayBuffer: async () => new Uint8Array().buffer,
    };
  };

  try {
    const result = await createEvidenceDeskFileStore({ redisClient: null, s3Client: null });
    assert.equal(result.type, 's3');

    await result.store.createFile({
      projectId: 'proj-stackhero',
      folderKey: 'photos',
      originalFileName: 'stackhero-test.txt',
      buffer: Buffer.from('hello stackhero', 'utf8'),
      extension: 'txt',
      mimeType: 'text/plain',
    });

    assert.ok(requests.length > 0, 'expected at least one signed S3 request');
    const uploadRequest = requests.find((entry) => entry.includes('stackhero-test.txt')) || requests[0];
    assert.match(uploadRequest, /^https:\/\/minio\.stackhero\.network\/survey-foundry\//, 'Stackhero host config should use path-style bucket URL');
    assert.doesNotMatch(uploadRequest, /^https:\/\/survey-foundry\.minio\.stackhero\.network\//, 'bucket-prefixed host should not be used unless explicitly configured');
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test('createEvidenceDeskFileStore respects Stackhero MinIO port and SSL env keys', async () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const requests = [];

  process.env.STACKHERO_MINIO_HOST = 'minio.stackhero.network';
  process.env.STACKHERO_MINIO_ACCESS_KEY = 'access-key';
  process.env.STACKHERO_MINIO_SECRET_KEY = 'secret-key';
  process.env.STACKHERO_MINIO_BUCKET = 'survey-foundry';
  process.env.STACKHERO_MINIO_PORT = '9000';
  process.env.STACKHERO_MINIO_USE_SSL = 'false';
  delete process.env.EVIDENCE_DESK_S3_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO_URL;
  delete process.env.AH_S3_OBJECT_STORAGE_STACKHERO;

  global.fetch = async (url) => {
    requests.push(String(url));
    return {
      status: 200,
      arrayBuffer: async () => new Uint8Array().buffer,
    };
  };

  try {
    const result = await createEvidenceDeskFileStore({ redisClient: null, s3Client: null });
    assert.equal(result.type, 's3');

    await result.store.createFile({
      projectId: 'proj-stackhero-port',
      folderKey: 'photos',
      originalFileName: 'stackhero-port-test.txt',
      buffer: Buffer.from('hello stackhero port', 'utf8'),
      extension: 'txt',
      mimeType: 'text/plain',
    });

    assert.ok(requests.length > 0, 'expected at least one signed S3 request');
    const uploadRequest = requests.find((entry) => entry.includes('stackhero-port-test.txt')) || requests[0];
    assert.match(uploadRequest, /^http:\/\/minio\.stackhero\.network:9000\/survey-foundry\//, 'Stackhero MinIO port + SSL env keys should shape endpoint protocol and port');
  } finally {
    global.fetch = originalFetch;
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


test('purgeLegacyRedisBinaryKeys removes legacy redis binary + thumbnail keys', async () => {
  const redis = new FakeRedis();
  await redis.set('surveycad:evidence-desk:bin:proj-1:drawings:legacy.pdf', 'AA==');
  await redis.set('surveycad:evidence-desk:thumb:proj-1:drawings:legacy.pdf', 'BB==');
  await redis.set('surveycad:evidence-desk:meta:proj-1:drawings:legacy.pdf', '{"ok":true}');

  const result = await purgeLegacyRedisBinaryKeys({ redis });

  assert.equal(result.matchedKeys, 2);
  assert.equal(result.deletedKeys, 2);
  assert.equal(await redis.get('surveycad:evidence-desk:meta:proj-1:drawings:legacy.pdf'), '{"ok":true}');
  assert.equal(await redis.get('surveycad:evidence-desk:bin:proj-1:drawings:legacy.pdf'), null);
  assert.equal(await redis.get('surveycad:evidence-desk:thumb:proj-1:drawings:legacy.pdf'), null);
});

test('createEvidenceDeskFileStore runs legacy redis binary cleanup when using s3/minio', async () => {
  const redis = new FakeRedis();
  const s3 = new FakeS3();
  await redis.set('surveycad:evidence-desk:bin:proj-2:drawings:migrated.pdf', 'AA==');
  await redis.set('surveycad:evidence-desk:thumb:proj-2:drawings:migrated.pdf', 'BB==');

  const result = await createEvidenceDeskFileStore({
    redisClient: redis,
    s3Client: s3,
    s3Config: { bucket: 'survey-foundry', prefix: 'test/evidence', region: 'us-east-1' },
  });

  assert.equal(result.type, 's3');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await redis.get('surveycad:evidence-desk:bin:proj-2:drawings:migrated.pdf'), null);
  assert.equal(await redis.get('surveycad:evidence-desk:thumb:proj-2:drawings:migrated.pdf'), null);
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
