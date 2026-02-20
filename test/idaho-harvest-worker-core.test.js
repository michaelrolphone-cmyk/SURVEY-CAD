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

test('arcgisGeometryToGeoJson normalizes Web Mercator geometries to lon/lat', () => {
  const geometry = arcgisGeometryToGeoJson({
    x: -12935580.863206567,
    y: 5406054.57397459,
    spatialReference: { wkid: 3857 },
  });

  assert.equal(geometry.type, 'Point');
  assert.ok(Math.abs(geometry.coordinates[0] - (-116.2023)) < 0.001);
  assert.ok(Math.abs(geometry.coordinates[1] - 43.615) < 0.001);
});

test('computeFeatureCenter normalizes Web Mercator rings to lon/lat center', () => {
  const center = computeFeatureCenter({
    geometry: {
      spatialReference: { wkid: 3857 },
      rings: [[
        [-12935680.863206567, 5405954.57397459],
        [-12935480.863206567, 5405954.57397459],
        [-12935480.863206567, 5406154.57397459],
        [-12935680.863206567, 5406154.57397459],
      ]],
    },
  });

  assert.ok(Math.abs(center.lon - (-116.2023)) < 0.001);
  assert.ok(Math.abs(center.lat - 43.615) < 0.001);
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
  assert.deepEqual(parcelFeature.properties.location, { lon: -116.16, lat: 43.64 });
  assert.equal(Array.isArray(parcelFeature.properties.surveyNumbers), true);

  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/11.geojson', { bucket: 'cpnfs' });
  assert.equal(cpnfFeature.properties.dataset, 'cpnf');

  const tileWrites = objectStore.writes.filter((write) => write.key.includes('/tiles/'));
  assert.ok(tileWrites.length > 0);
  assert.ok(tileWrites.every((write) => write.bucket === 'tile-server'));

  const parcelTileWrites = tileWrites.filter((write) => write.key.includes('/parcels/'));
  assert.equal(parcelTileWrites.length, 23);

  const cpnfTileWrites = tileWrites.filter((write) => write.key.includes('/cpnf/'));
  assert.equal(cpnfTileWrites.length, 1);

  const parcelIndexFeature = index.features.find((feature) => feature.id === 'parcels:1');
  assert.equal(Array.isArray(parcelIndexFeature.properties.tileKeys), true);
  assert.equal(parcelIndexFeature.properties.tileKeys.length, 23);
  assert.equal(parcelIndexFeature.properties.tileKey, parcelIndexFeature.properties.tileKeys[0]);

  assert.deepEqual(calls.map((c) => `${c.layer}:${c.offset}`), ['24:0', '18:0', '24:1', '18:1']);
});

test('runIdahoHarvestCycle includes survey number metadata in tile features', async () => {
  const objectStore = createMemoryObjectStore();
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      features: [{
        attributes: { OBJECTID: 12, ROS: '1234, 1235', SURVEY_NUM: 'A-1' },
        geometry: { x: -116.2, y: 43.6 },
      }],
    }),
  });

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    datasets: [{ name: 'parcels', layerId: 24 }],
  });

  const parcelTileKey = objectStore.writes.find((write) => write.key.includes('/tiles/id/parcels/14/'))?.key;
  assert.ok(parcelTileKey, 'expected a parcel zoom-14 tile write');

  const parcelTile = objectStore.readJson(parcelTileKey, { bucket: 'tile-server' });
  assert.equal(parcelTile.type, 'FeatureCollection');
  assert.deepEqual(parcelTile.features[0].properties.surveyNumbers, ['1234', '1235', 'A-1']);
  assert.deepEqual(parcelTile.features[0].properties.location, { lon: -116.2, lat: 43.6 });
});

test('runIdahoHarvestCycle keeps parcels out of cpnf bucket when default bucket is cpnfs', async () => {
  const objectStore = createMemoryObjectStore();
  const fetchImpl = async (url) => {
    const layer = new URL(url).pathname.split('/').slice(-2, -1)[0];
    if (layer === '24') {
      return {
        ok: true,
        json: async () => ({
          features: [{ attributes: { OBJECTID: 101, PARCEL: 'P-101' }, geometry: { x: -116.2, y: 43.6 } }],
        }),
      };
    }

    return { ok: true, json: async () => ({ features: [] }) };
  };

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    datasets: [{ name: 'parcels', layerId: 24 }],
    buckets: {
      default: 'cpnfs',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  assert.equal(objectStore.has('surveycad/idaho-harvest/features/id/parcels/101.geojson', { bucket: 'tile-server' }), true);
  assert.equal(objectStore.has('surveycad/idaho-harvest/features/id/parcels/101.geojson', { bucket: 'cpnfs' }), false);
});

test('runIdahoHarvestCycle downloads and stores CPNF PDFs in cpnfs bucket', async () => {
  const objectStore = createMemoryObjectStore();
  const calls = [];
  const fetchImpl = async (url) => {
    const stringUrl = String(url);
    calls.push(stringUrl);
    if (stringUrl.includes('/query?')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: {
              OBJECTID: 301,
              DOC_URLS: 'cpf-301-a.pdf; https://example.test/docs/cpf-301-b.pdf',
              NAME: 'CPNF-301',
            },
            geometry: { x: -116.25, y: 43.65 },
          }],
        }),
      };
    }

    return {
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => new Uint8Array(Buffer.from('%PDF-1.4\n%cpnf\n')).buffer,
    };
  };

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    cpnfPdfBaseUrl: 'https://example.test/docs/',
    datasets: [{ name: 'cpnf', layerId: 18, tileZoom: 12 }],
    buckets: {
      default: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/301.geojson', { bucket: 'cpnfs' });
  assert.equal(Array.isArray(cpnfFeature.properties.cpnfPdfKeys), true);
  assert.equal(cpnfFeature.properties.cpnfPdfKeys.length, 2);
  assert.ok(cpnfFeature.properties.cpnfPdfKeys.every((key) => key.includes('/pdfs/id/cpnf/301/')));
  assert.ok(cpnfFeature.properties.cpnfPdfKeys.every((key) => objectStore.has(key, { bucket: 'cpnfs' })));
  assert.equal(calls.filter((call) => call.endsWith('.pdf')).length, 2);
});


test('runIdahoHarvestCycle rotates datasets so cpnf is harvested before parcels finish', async () => {
  const objectStore = createMemoryObjectStore();
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const layer = parsed.pathname.split('/').slice(-2, -1)[0];
    const offset = Number(parsed.searchParams.get('resultOffset') || 0);
    calls.push(`${layer}:${offset}`);

    if (layer === '24') {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: { OBJECTID: offset + 1, PARCEL: `P-${offset + 1}` },
            geometry: { x: -116.2, y: 43.6 },
          }],
        }),
      };
    }

    if (layer === '18') {
      return {
        ok: true,
        json: async () => ({
          features: offset === 0
            ? [{ attributes: { OBJECTID: 99, NAME: 'CPNF-99' }, geometry: { x: -116.1, y: 43.7 } }]
            : [],
        }),
      };
    }

    return { ok: true, json: async () => ({ features: [] }) };
  };

  await runIdahoHarvestCycle({ fetchImpl, objectStore, adaMapServerBaseUrl: 'http://example.test/map', batchSize: 1 });
  await runIdahoHarvestCycle({ fetchImpl, objectStore, adaMapServerBaseUrl: 'http://example.test/map', batchSize: 1 });

  assert.deepEqual(calls, ['24:0', '18:0']);
  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/99.geojson', { bucket: 'cpnfs' });
  assert.equal(cpnfFeature.properties.dataset, 'cpnf');
});
