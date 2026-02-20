import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdahoHarvestObjectStoreFromEnv, runIdahoHarvestWorker } from '../src/idaho-harvest-worker.js';

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

test('runIdahoHarvestWorker can run one cycle with injected store/client', async () => {
  const store = createMemoryObjectStore();
  const fakeClient = {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const layer = parsed.pathname.split('/').slice(-2, -1)[0];
      const offset = Number(parsed.searchParams.get('resultOffset') || 0);
      if (layer === '24' && offset === 0) {
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
      adaMapServer: 'http://example.test/map',
    },
  };

  await runIdahoHarvestWorker({
    env: {
      IDAHO_HARVEST_BATCH_SIZE: '100',
      IDAHO_HARVEST_MINIO_DEFAULT_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_PARCELS_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_CPNF_BUCKET: 'cpnfs',
      IDAHO_HARVEST_MINIO_TILE_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_INDEX_BUCKET: 'tile-server',
      IDAHO_HARVEST_MINIO_CHECKPOINT_BUCKET: 'tile-server',
    },
    client: fakeClient,
    store,
  });
});
