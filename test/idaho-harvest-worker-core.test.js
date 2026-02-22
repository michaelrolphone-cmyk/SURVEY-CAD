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



test('runIdahoHarvestCycle default datasets harvest property lots parcel layer by default', async () => {
  const objectStore = createMemoryObjectStore();
  const layers = [];
  const fetchImpl = async (url) => {
    const layer = new URL(url).pathname.split('/').slice(-2, -1)[0];
    layers.push(layer);
    return { ok: true, json: async () => ({ features: [] }) };
  };

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
  });

  assert.equal(layers[0], '18');
  assert.equal(layers.includes('23'), true);
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
      '23': [
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

  const callTrace = calls.map((c) => `${c.layer}:${c.offset}`);
  assert.equal(callTrace.includes('18:0'), true);
  assert.equal(callTrace.includes('18:1'), true);
  assert.equal(callTrace.includes('23:0'), true);
  assert.equal(callTrace.includes('23:1'), true);
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
    datasets: [{ name: 'parcels', layerId: 23 }],
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
    if (layer === '23') {
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
    datasets: [{ name: 'parcels', layerId: 23 }],
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
  assert.equal(calls.filter((call) => call.endsWith('.pdf')).length, 4);
});

test('runIdahoHarvestCycle builds Ada County CPNF PDF download URLs from instrument numbers', async () => {
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
              OBJECTID: 302,
              INSTRUMENT_NUMBER: '2019-12345',
              NAME: 'CPNF-302',
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
    datasets: [{ name: 'cpnf', layerId: 18, tileZoom: 12 }],
    buckets: {
      default: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  assert.ok(calls.includes('https://gisprod.adacounty.id.gov/apps/acdscpf/CpfPdfs/2019-12345.pdf'));
  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/302.geojson', { bucket: 'cpnfs' });
  assert.equal(cpnfFeature.properties.cpnfPdfKeys.length, 1);
  assert.equal(objectStore.has(cpnfFeature.properties.cpnfPdfKeys[0], { bucket: 'cpnfs' }), true);
});


test('runIdahoHarvestCycle deduplicates CPNF PDF URLs that differ only by extension case', async () => {
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
              OBJECTID: 350,
              // DOC_URL has uppercase .PDF — same Ada County server path the instrument number generates
              DOC_URL: 'https://gisprod.adacounty.id.gov/apps/acdscpf/CpfPdfs/2022-00350.PDF',
              INSTRUMENT_NUMBER: '2022-00350',
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
    datasets: [{ name: 'cpnf', layerId: 18, tileZoom: 12 }],
    buckets: {
      default: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/350.geojson', { bucket: 'cpnfs' });
  // The .PDF attribute URL and the instrument-constructed .pdf URL differ only by extension case — should deduplicate to 1
  assert.equal(cpnfFeature.properties.cpnfPdfKeys.length, 1);
  // The stored key must use a lowercase .pdf extension
  assert.ok(cpnfFeature.properties.cpnfPdfKeys[0].endsWith('.pdf'), 'stored key should have lowercase .pdf extension');
  assert.ok(!cpnfFeature.properties.cpnfPdfKeys[0].endsWith('.PDF'), 'stored key must not have uppercase .PDF extension');
});

test('runIdahoHarvestCycle does not persist CPNF PDF keys when downloads fail', async () => {
  const objectStore = createMemoryObjectStore();
  await objectStore.putObject('surveycad/idaho-harvest/features/id/cpnf/777.geojson', Buffer.from(JSON.stringify({
    type: 'Feature',
    id: 'cpnf:777',
    properties: { dataset: 'cpnf', cpnfPdfKeys: [] },
  })), { bucket: 'cpnfs' });

  const fetchImpl = async (url) => {
    const stringUrl = String(url);
    if (stringUrl.includes('/query?')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: {
              OBJECTID: 777,
              INSTRUMENT_NUMBER: '2020-77777',
              NAME: 'CPNF-777',
            },
            geometry: { x: -116.25, y: 43.65 },
          }],
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'text/plain' }),
      arrayBuffer: async () => Buffer.from('missing'),
    };
  };

  await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    datasets: [{ name: 'cpnf', layerId: 18, tileZoom: 12 }],
    buckets: {
      default: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/777.geojson', { bucket: 'cpnfs' });
  assert.equal(Array.isArray(cpnfFeature.properties.cpnfPdfKeys), false);
  assert.equal(objectStore.writes.some((write) => write.key.includes('/pdfs/id/cpnf/777/')), false);
});


test('runIdahoHarvestCycle rotates datasets so cpnf is harvested before parcels finish', async () => {
  const objectStore = createMemoryObjectStore();
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const layer = parsed.pathname.split('/').slice(-2, -1)[0];
    const offset = Number(parsed.searchParams.get('resultOffset') || 0);
    calls.push(`${layer}:${offset}`);

    if (layer === '23') {
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

  assert.equal(calls.includes('18:0'), true);
  assert.equal(calls.includes('23:0'), true);
  const cpnfFeature = objectStore.readJson('surveycad/idaho-harvest/features/id/cpnf/99.geojson', { bucket: 'cpnfs' });
  assert.equal(cpnfFeature.properties.dataset, 'cpnf');
});

test('runIdahoHarvestCycle scrapes CPNF PDFs from instrument number when dataset is named cpnf-layer-N', async () => {
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
              OBJECTID: 401,
              INSTRUMENT_NUMBER: '2021-00401',
              NAME: 'CPNF-401',
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
    datasets: [{ name: 'cpnf-layer-18', layerId: 18, tileZoom: 12 }],
    buckets: {
      default: 'tile-server',
      cpnf: 'cpnfs',
      tiles: 'tile-server',
      indexes: 'tile-server',
      checkpoints: 'tile-server',
    },
  });

  assert.ok(calls.includes('https://gisprod.adacounty.id.gov/apps/acdscpf/CpfPdfs/2021-00401.pdf'));
  assert.ok(objectStore.writes.some((write) => write.key.includes('/pdfs/id/cpnf-layer-18/401/') && write.bucket === 'cpnfs'));
});

test('runIdahoHarvestCycle scrapes cpnf PDFs even when map dataset checkpoint is already complete', async () => {
  const objectStore = createMemoryObjectStore();
  const checkpointKey = 'surveycad/idaho-harvest/checkpoints/id.json';

  await objectStore.putObject(checkpointKey, Buffer.from(JSON.stringify({
    state: 'ID',
    nextDatasetIndex: 0,
    datasets: {
      cpnf: { offset: 5, done: true },
    },
    cpnfPdfScrape: { offset: 0, done: false },
  })), { bucket: 'tile-server' });

  const fetchImpl = async (url) => {
    const stringUrl = String(url);
    if (stringUrl.includes('/query?')) {
      const offset = Number(new URL(stringUrl).searchParams.get('resultOffset') || 0);
      if (offset > 0) return { ok: true, json: async () => ({ features: [] }) };
      return {
        ok: true,
        json: async () => ({
          features: [{
            attributes: { OBJECTID: 500, DOC_URL: 'https://example.test/cpnf-500.pdf' },
            geometry: { x: -116.2, y: 43.6 },
          }],
        }),
      };
    }

    return {
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => Buffer.from('%PDF-1.4 cpnf 500'),
    };
  };

  const first = await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    datasets: [{ name: 'cpnf', layerId: 18 }],
  });
  assert.equal(first.done, false);
  assert.equal(objectStore.has('surveycad/idaho-harvest/pdfs/id/cpnf/500/1-cpnf-500.pdf', { bucket: 'cpnfs' }), true);

  const second = await runIdahoHarvestCycle({
    fetchImpl,
    objectStore,
    adaMapServerBaseUrl: 'http://example.test/map',
    batchSize: 1,
    datasets: [{ name: 'cpnf', layerId: 18 }],
  });
  assert.equal(second.done, true);
});
