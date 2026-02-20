import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  arcgisGeometryToGeoJson,
  computeFeatureCenter,
  createMinioObjectStore,
  runIdahoHarvestCycle,
} from '../src/idaho-harvest-worker-core.js';

function createMemoryObjectStore() {
  const store = new Map();
  const writes = [];
  return {
    async getObject(key, { bucket = 'default' } = {}) {
      const scoped = `${bucket}:${key}`;
      if (!store.has(scoped)) throw new Error('not found');
      return store.get(scoped);
    },
    async putObject(key, body, { bucket = 'default' } = {}) {
      const scoped = `${bucket}:${key}`;
      writes.push({ bucket, key });
      store.set(scoped, Buffer.from(body));
    },
    readJson(key, { bucket = 'default' } = {}) {
      return JSON.parse(store.get(`${bucket}:${key}`).toString('utf8'));
    },
    has(key, { bucket = 'default' } = {}) {
      return store.has(`${bucket}:${key}`);
    },
    writes,
  };
}

test('arcgisGeometryToGeoJson converts ArcGIS rings to Polygon GeoJSON', () => {
  const geometry = arcgisGeometryToGeoJson({
    rings: [[[-116.2, 43.6], [-116.1, 43.6], [-116.1, 43.7], [-116.2, 43.7], [-116.2, 43.6]]],
  });
  assert.equal(geometry.type, 'Polygon');
  assert.equal(Array.isArray(geometry.coordinates[0]), true);
});

test('computeFeatureCenter supports ring geometries', () => {
  const center = computeFeatureCenter({ geometry: { rings: [[[0, 0], [2, 0], [2, 2], [0, 2]]] } });
  assert.equal(center.lon, 1);
  assert.equal(center.lat, 1);
});

test('createMinioObjectStore uses MinIO bucket-aware getObject/putObject', async () => {
  const calls = [];
  const minioClient = {
    async getObject(bucket, key) {
      calls.push({ type: 'get', bucket, key });
      return Readable.from([Buffer.from('{"ok":true}')]);
    },
    async putObject(bucket, key, body, size, meta) {
      calls.push({ type: 'put', bucket, key, size, meta, body: Buffer.from(body).toString('utf8') });
    },
  };

  const store = createMinioObjectStore({ minioClient, defaultBucket: 'tile-server' });
  const payload = await store.getObject('x.json');
  assert.equal(payload.toString('utf8'), '{"ok":true}');

  await store.putObject('y.json', Buffer.from('hello'), { bucket: 'cpnfs', contentType: 'application/json' });

  assert.deepEqual(calls[0], { type: 'get', bucket: 'tile-server', key: 'x.json' });
  assert.equal(calls[1].type, 'put');
  assert.equal(calls[1].bucket, 'cpnfs');
  assert.equal(calls[1].key, 'y.json');
  assert.equal(calls[1].size, 5);
  assert.equal(calls[1].meta['Content-Type'], 'application/json');
});

test('runIdahoHarvestCycle stores cpnf in cpnfs bucket and tiles/index/checkpoints in tile-server bucket', async () => {
  const objectStore = createMemoryObjectStore();
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const layer = parsed.pathname.split('/').slice(-2, -1)[0];
    const offset = Number(parsed.searchParams.get('resultOffset') || 0);
    calls.push({ layer, offset });

    const records = {
      '24': [
        {
          attributes: { OBJECTID: 1, PARCEL: 'R1' },
          geometry: { rings: [[[-116.2, 43.6], [-116.1, 43.6], [-116.1, 43.7], [-116.2, 43.7], [-116.2, 43.6]]] },
        },
      ],
      '18': [
        { attributes: { OBJECTID: 11, NAME: 'CPNF-11' }, geometry: { x: -116.4, y: 43.8 } },
      ],
    };

    const source = records[layer] || [];
    const features = source.slice(offset, offset + 1);
    return { ok: true, json: async () => ({ features }) };
  };

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    buckets: {
      default: 'tile-server',
      parcels: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });
  await runIdahoHarvestCycle({ fetchImpl, objectStore, adaMapServerBaseUrl: 'http://example.test/map', batchSize: 1, buckets: { default: 'tile-server', parcels: 'tile-server', cpnf: 'cpnfs', tiles: 'tile-server', indexes: 'tile-server', checkpoints: 'tile-server' } });
  await runIdahoHarvestCycle({ fetchImpl, objectStore, adaMapServerBaseUrl: 'http://example.test/map', batchSize: 1, buckets: { default: 'tile-server', parcels: 'tile-server', cpnf: 'cpnfs', tiles: 'tile-server', indexes: 'tile-server', checkpoints: 'tile-server' } });
  await runIdahoHarvestCycle({ fetchImpl, objectStore, adaMapServerBaseUrl: 'http://example.test/map', batchSize: 1, buckets: { default: 'tile-server', parcels: 'tile-server', cpnf: 'cpnfs', tiles: 'tile-server', indexes: 'tile-server', checkpoints: 'tile-server' } });

  const index = objectStore.readJson('surveycad/idaho-harvest/indexes/id-master-index.geojson', { bucket: 'tile-server' });
  assert.equal(index.type, 'FeatureCollection');
  assert.equal(index.complete, true);

  const parcelFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/parcels/1.geojson', { bucket: 'tile-server' });
  assert.equal(parcelFeature.type, 'Feature');

  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/11.geojson', { bucket: 'cpnfs' });
  assert.equal(cpnfFeature.properties.dataset, 'cpnf');

  const tileWrites = objectStore.writes.filter((write) => write.key.includes('/tiles/'));
  assert.ok(tileWrites.length > 0);
  assert.ok(tileWrites.every((write) => write.bucket === 'tile-server'));

  assert.deepEqual(calls.map((c) => `${c.layer}:${c.offset}`), ['24:0', '24:1', '18:0', '18:1']);
});
