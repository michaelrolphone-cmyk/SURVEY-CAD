import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIdahoHarvestObjectStoreFromEnv,
  resolveInterBatchDelayMs,
  runIdahoHarvestWorker,
  resolveHarvestDatasets,
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
  let queryCalls = 0;
  const fakeClient = {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get('f') === 'json' && !parsed.pathname.endsWith('/query')) {
        return {
          ok: true,
          json: async () => ({ layers: [{ id: 23, name: 'Parcel Lots' }, { id: 18, name: 'CP&F Records' }] }),
        };
      }
      queryCalls += 1;
      if (queryCalls === 1) {
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


test('runIdahoHarvestWorker exits immediately when WORKERS_ENABLED is false', async () => {
  const store = createMemoryObjectStore();
  let fetchCalls = 0;
  const fakeClient = {
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ features: [] }) };
    },
    config: {
      adaMapServer: 'http://example.test/map/24',
    },
  };

  await runIdahoHarvestWorker({
    env: {
      WORKERS_ENABLED: 'false',
    },
    client: fakeClient,
    store,
  });

  assert.equal(fetchCalls, 0);
});

test('resolveHarvestDatasets discovers all parcel and cpnf-like layers from map metadata', async () => {
  const datasets = await resolveHarvestDatasets({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        layers: [
          { id: 18, name: 'CP&F Records' },
          { id: 23, name: 'Parcel Lots' },
          { id: 24, name: 'Parcel Polygons' },
          { id: 25, name: 'Corner Monuments' },
          { id: 30, name: 'Road Centerlines' },
        ],
      }),
    }),
    adaMapServerBaseUrl: 'http://example.test/map',
    env: {},
  });

  assert.deepEqual(datasets, [
    { name: 'parcels-layer-23', layerId: 23 },
    { name: 'parcels-layer-24', layerId: 24 },
    { name: 'cpnf-layer-18', layerId: 18 },
    { name: 'cpnf-layer-25', layerId: 25 },
  ]);
});

test('runIdahoHarvestWorker scrapes all discovered parcel/cpnf layers', async () => {
  const store = createMemoryObjectStore();
  const queriedLayers = [];
  const fakeClient = {
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get('f') === 'json' && !parsed.pathname.endsWith('/query')) {
        return {
          ok: true,
          json: async () => ({
            layers: [
              { id: 18, name: 'CP&F Records' },
              { id: 23, name: 'Parcel Lots' },
              { id: 24, name: 'Parcel Polygons' },
            ],
          }),
        };
      }
      const layer = parsed.pathname.split('/').slice(-2, -1)[0];
      queriedLayers.push(layer);
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

  assert.deepEqual(queriedLayers, ['23', '24', '18']);
});
