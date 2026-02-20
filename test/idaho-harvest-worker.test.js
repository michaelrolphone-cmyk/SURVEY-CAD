import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIdahoHarvestObjectStoreFromEnv,
  resolveInterBatchDelayMs,
  runIdahoHarvestWorker,
} from '../src/idaho-harvest-worker.js';

function createMemoryObjectStore() {
  const map = new Map();
  return {
    async getObject(key, { bucket = 'default' } = {}) {
      const scoped = `${bucket}:${key}`;
      if (!map.has(scoped)) throw new Error('not found');
      return map.get(scoped);
    },
    async putObject(key, body, { bucket = 'default' } = {}) {
      map.set(`${bucket}:${key}`, Buffer.from(body));
    },
  };
}

test('createIdahoHarvestObjectStoreFromEnv throws when MinIO env vars are missing', () => {
  assert.throws(
    () => createIdahoHarvestObjectStoreFromEnv({}),
    /Missing MinIO configuration/,
  );
});

test('createIdahoHarvestObjectStoreFromEnv creates per-bucket S3 clients and routes get/put', async () => {
  const calls = [];
  const createS3Client = (config) => ({
    async getObject(key) {
      calls.push({ type: 'get', bucket: config.bucket, key, endpoint: config.endpoint });
      return Buffer.from('ok');
    },
    async putObject(key, body, options = {}) {
      calls.push({ type: 'put', bucket: config.bucket, key, contentType: options.contentType, body: Buffer.from(body).toString('utf8') });
    },
  });

  const store = createIdahoHarvestObjectStoreFromEnv({
    STACKHERO_MINIO_HOST: 'minio.example.com',
    STACKHERO_MINIO_ACCESS_KEY: 'ak',
    STACKHERO_MINIO_SECRET_KEY: 'sk',
    STACKHERO_MINIO_PORT: '443',
    STACKHERO_MINIO_USE_SSL: 'true',
  }, createS3Client);

  const payload = await store.getObject('a.geojson', { bucket: 'tile-server' });
  assert.equal(payload.toString('utf8'), 'ok');
  await store.putObject('b.geojson', Buffer.from('x'), { bucket: 'cpnfs', contentType: 'application/geo+json' });

  assert.deepEqual(calls[0], {
    type: 'get',
    bucket: 'tile-server',
    key: 'a.geojson',
    endpoint: 'https://minio.example.com:443',
  });
  assert.deepEqual(calls[1], {
    type: 'put',
    bucket: 'cpnfs',
    key: 'b.geojson',
    contentType: 'application/geo+json',
    body: 'x',
  });
});

test('resolveInterBatchDelayMs returns random 2-10 minute delay when enabled', () => {
  const delay = resolveInterBatchDelayMs({
    IDAHO_HARVEST_RANDOM_DELAY_ENABLED: '1',
    IDAHO_HARVEST_RANDOM_DELAY_MIN_MS: '120000',
    IDAHO_HARVEST_RANDOM_DELAY_MAX_MS: '600000',
  }, () => 0.5);

  assert.equal(delay, 360000);
});

test('resolveInterBatchDelayMs returns fixed poll interval when random delay disabled', () => {
  const delay = resolveInterBatchDelayMs({
    IDAHO_HARVEST_RANDOM_DELAY_ENABLED: '0',
    IDAHO_HARVEST_POLL_INTERVAL_MS: '2500',
  }, () => 0.75);

  assert.equal(delay, 2500);
});

test('runIdahoHarvestWorker uses randomized delay between non-complete batches', async () => {
  const store = createMemoryObjectStore();
  let calls = 0;
  const fakeClient = {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          json: async () => ({
            features: [{ attributes: { OBJECTID: 1 }, geometry: { x: -116.2, y: 43.6 } }],
          }),
        };
      }
      return { ok: true, json: async () => ({ features: [] }) };
    },
    config: {
      adaMapServer: 'http://example.test/map/24',
    },
  };

  const sleeps = [];
  await runIdahoHarvestWorker({
    env: {
      IDAHO_HARVEST_BATCH_SIZE: '100',
      IDAHO_HARVEST_MINIO_DEFAULT_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_PARCELS_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_CPNF_BUCKET: 'cpnfs',
      IDAHO_HARVEST_MINIO_TILE_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_INDEX_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_CHECKPOINT_BUCKET: 'tile-server',
      IDAHO_HARVEST_RANDOM_DELAY_ENABLED: '1',
      IDAHO_HARVEST_RANDOM_DELAY_MIN_MS: '120000',
      IDAHO_HARVEST_RANDOM_DELAY_MAX_MS: '600000',
    },
    client: fakeClient,
    store,
    randomFn: () => 0,
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.deepEqual(sleeps, [120000]);
});
