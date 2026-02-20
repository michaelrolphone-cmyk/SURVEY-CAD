import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PREFIX = 'surveycad/idaho-harvest';

function toObjectId(feature = {}, objectIdField = 'OBJECTID') {
  const attrs = feature?.attributes || {};
  const value = attrs[objectIdField] ?? attrs[objectIdField.toUpperCase()] ?? attrs[objectIdField.toLowerCase()];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value || '').trim();
}

function normalizeRing(ring = []) {
  const coords = ring
    .filter((coord) => Array.isArray(coord) && coord.length >= 2)
    .map((coord) => [Number(coord[0]), Number(coord[1])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (coords.length < 3) return [];
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return coords;
}

function signedArea(ring = []) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += (ring[i][0] * ring[i + 1][1]) - (ring[i + 1][0] * ring[i][1]);
  }
  return area / 2;
}

function pointInRing(point, ring = []) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function arcgisGeometryToGeoJson(geometry = {}) {
  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    return { type: 'Point', coordinates: [Number(geometry.x), Number(geometry.y)] };
  }

  if (Array.isArray(geometry.paths) && geometry.paths.length) {
    const lines = geometry.paths.map((line) => normalizeRing(line).slice(0, -1)).filter((line) => line.length >= 2);
    if (!lines.length) return null;
    if (lines.length === 1) return { type: 'LineString', coordinates: lines[0] };
    return { type: 'MultiLineString', coordinates: lines };
  }

  if (Array.isArray(geometry.rings) && geometry.rings.length) {
    const rings = geometry.rings.map((ring) => normalizeRing(ring)).filter((ring) => ring.length >= 4);
    if (!rings.length) return null;

    const outers = [];
    const holes = [];
    for (const ring of rings) {
      if (signedArea(ring) < 0) outers.push([ring]);
      else holes.push(ring);
    }

    if (!outers.length) {
      return {
        type: 'Polygon',
        coordinates: [rings[0], ...rings.slice(1)],
      };
    }

    for (const hole of holes) {
      const representative = hole[0];
      const owner = outers.find((poly) => pointInRing(representative, poly[0]));
      if (owner) owner.push(hole);
      else outers[0].push(hole);
    }

    if (outers.length === 1) return { type: 'Polygon', coordinates: outers[0] };
    return { type: 'MultiPolygon', coordinates: outers.map((poly) => [poly[0], ...poly.slice(1)]) };
  }

  return null;
}

export function computeFeatureCenter(feature = {}) {
  const geometry = feature?.geometry || {};
  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    return { lon: Number(geometry.x), lat: Number(geometry.y) };
  }

  const collect = [];
  const scan = (parts = []) => {
    for (const part of parts) {
      if (!Array.isArray(part)) continue;
      for (const coord of part) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) collect.push({ x, y });
      }
    }
  };

  scan(geometry.rings || []);
  scan(geometry.paths || []);
  if (!collect.length) return { lon: null, lat: null };

  const totals = collect.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { lon: totals.x / collect.length, lat: totals.y / collect.length };
}

function buildLayerQueryUrl(baseUrl, layerId, params = {}) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/${layerId}/query`);
  url.searchParams.set('f', 'json');
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function lonLatToTile(lon, lat, zoom = 14) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  const normalizedLon = ((Number(lon) + 180) / 360);
  const z = Number(zoom);
  const scale = 2 ** z;
  const x = Math.floor(normalizedLon * scale);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2 * scale);
  return { z, x, y };
}

function toGeoJsonFeature(feature = {}, { id, dataset }) {
  return {
    type: 'Feature',
    id: `${dataset}:${id}`,
    geometry: arcgisGeometryToGeoJson(feature?.geometry || {}),
    properties: {
      dataset,
      objectId: id,
      ...(feature?.attributes || {}),
    },
  };
}

async function readJsonObject(store, key, fallback = null) {
  try {
    const payload = await store.getObject(key);
    if (!payload) return fallback;
    return JSON.parse(Buffer.from(payload).toString('utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonObject(store, key, payload) {
  await store.putObject(key, Buffer.from(JSON.stringify(payload, null, 2)), { contentType: 'application/geo+json; charset=utf-8' });
}

async function readJsonObjectInBucket(store, bucket, key, fallback = null) {
  try {
    const payload = await store.getObject(key, { bucket });
    if (!payload) return fallback;
    return JSON.parse(Buffer.from(payload).toString('utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonObjectInBucket(store, bucket, key, payload) {
  await store.putObject(key, Buffer.from(JSON.stringify(payload, null, 2)), { contentType: 'application/geo+json; charset=utf-8', bucket });
}

export async function runIdahoHarvestCycle({
  fetchImpl = fetch,
  objectStore,
  adaMapServerBaseUrl,
  batchSize = 100,
  prefix = DEFAULT_PREFIX,
  stateAbbr = 'ID',
  datasets = [
    { name: 'parcels', layerId: 24, tileZoom: 14 },
    { name: 'cpnf', layerId: 18, tileZoom: 12 },
  ],
  buckets = {
    default: 'tile-server',
    parcels: 'tile-server',
    cpnf: 'cpnfs',
    tiles: 'tile-server',
    indexes: 'tile-server',
    checkpoints: 'tile-server',
  },
}) {
  if (!objectStore) throw new Error('objectStore is required');
  const bucketFor = (kind, datasetName = '') => {
    if (datasetName && buckets?.[datasetName]) return buckets[datasetName];
    if (kind && buckets?.[kind]) return buckets[kind];
    return buckets?.default || null;
  };

  const checkpointBucket = bucketFor('checkpoints');
  const indexBucket = bucketFor('indexes');

  const checkpointKey = `${prefix}/checkpoints/${stateAbbr.toLowerCase()}.json`;
  const indexKey = `${prefix}/indexes/${stateAbbr.toLowerCase()}-master-index.geojson`;

  const checkpoint = await readJsonObjectInBucket(objectStore, checkpointBucket, checkpointKey, {
    state: stateAbbr,
    nextDatasetIndex: 0,
    datasets: Object.fromEntries(datasets.map((dataset) => [dataset.name, { offset: 0, done: false }])),
  });

  const datasetCount = datasets.length;
  const rawNextDatasetIndex = Number(checkpoint?.nextDatasetIndex);
  const nextDatasetIndex = Number.isInteger(rawNextDatasetIndex) && rawNextDatasetIndex >= 0
    ? (datasetCount ? (rawNextDatasetIndex % datasetCount) : 0)
    : 0;

  const indexDoc = await readJsonObjectInBucket(objectStore, indexBucket, indexKey, {
    type: 'FeatureCollection',
    state: stateAbbr,
    generatedAt: new Date().toISOString(),
    features: [],
  });

  const priorIndexFeatures = Array.isArray(indexDoc?.features)
    ? indexDoc.features
    : Array.isArray(indexDoc?.items)
      ? indexDoc.items.map((item) => ({
        type: 'Feature',
        id: `${item.dataset}:${item.objectId}`,
        geometry: {
          type: 'Point',
          coordinates: [Number(item.lon), Number(item.lat)],
        },
        properties: {
          dataset: item.dataset,
          objectId: item.objectId,
          key: item.key,
          tileKey: item.tileKey || null,
        },
      }))
      : [];

  const indexByKey = new Map(priorIndexFeatures
    .filter((feature) => feature?.properties?.dataset != null && feature?.properties?.objectId != null)
    .map((feature) => [`${feature.properties.dataset}:${feature.properties.objectId}`, feature]));

  const tileDocuments = new Map();
  const getTileDoc = async (tileKey) => {
    if (tileDocuments.has(tileKey)) return tileDocuments.get(tileKey);
    const tileBucket = bucketFor('tiles');
    const doc = await readJsonObjectInBucket(objectStore, tileBucket, tileKey, { type: 'FeatureCollection', features: [] });
    tileDocuments.set(tileKey, doc && doc.type === 'FeatureCollection' ? doc : { type: 'FeatureCollection', features: [] });
    return tileDocuments.get(tileKey);
  };

  let changed = false;

  const datasetOrder = datasets.map((_, index) => (nextDatasetIndex + index) % (datasetCount || 1));

  for (const datasetIndex of datasetOrder) {
    const dataset = datasets[datasetIndex];
    const state = checkpoint.datasets[dataset.name] || { offset: 0, done: false };
    if (state.done) continue;

    const queryUrl = buildLayerQueryUrl(adaMapServerBaseUrl, dataset.layerId, {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: 4326,
      orderByFields: 'OBJECTID ASC',
      resultOffset: state.offset,
      resultRecordCount: Math.max(1, Number(batchSize) || 100),
    });

    const response = await fetchImpl(queryUrl);
    if (!response.ok) throw new Error(`Harvest query failed for ${dataset.name}: HTTP ${response.status}`);
    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];

    if (!features.length) {
      checkpoint.datasets[dataset.name] = { ...state, done: true };
      changed = true;
      continue;
    }

    for (const feature of features) {
      const objectId = toObjectId(feature);
      if (objectId === '') continue;

      const geojsonFeature = toGeoJsonFeature(feature, { id: objectId, dataset: dataset.name });
      const featureKey = `${prefix}/features/${stateAbbr.toLowerCase()}/${dataset.name}/${encodeURIComponent(String(objectId))}.geojson`;
      const featureBucket = bucketFor('features', dataset.name);
      await writeJsonObjectInBucket(objectStore, featureBucket, featureKey, geojsonFeature);

      const center = computeFeatureCenter(feature);
      const hasCenter = Number.isFinite(center.lon) && Number.isFinite(center.lat);
      const tile = hasCenter ? lonLatToTile(center.lon, center.lat, Number(dataset.tileZoom || 14)) : null;
      const tileKey = tile
        ? `${prefix}/tiles/${stateAbbr.toLowerCase()}/${dataset.name}/${tile.z}/${tile.x}/${tile.y}.geojson`
        : null;

      if (tileKey) {
        const tileDoc = await getTileDoc(tileKey);
        const featureId = `${dataset.name}:${objectId}`;
        tileDoc.features = (Array.isArray(tileDoc.features) ? tileDoc.features : []).filter((existing) => String(existing?.id || '') !== featureId);
        tileDoc.features.push(geojsonFeature);
      }

      indexByKey.set(`${dataset.name}:${objectId}`, {
        type: 'Feature',
        id: `${dataset.name}:${objectId}`,
        geometry: hasCenter ? { type: 'Point', coordinates: [center.lon, center.lat] } : null,
        properties: {
          dataset: dataset.name,
          objectId,
          key: featureKey,
          tileKey,
        },
      });
    }

    checkpoint.datasets[dataset.name] = {
      offset: Number(state.offset || 0) + features.length,
      done: false,
      updatedAt: new Date().toISOString(),
    };
    checkpoint.nextDatasetIndex = datasetCount ? ((datasetIndex + 1) % datasetCount) : 0;
    changed = true;
    break;
  }

  if (!changed) return { done: true, checkpoint, indexKey };

  for (const [tileKey, tileDoc] of tileDocuments.entries()) {
    const ordered = (Array.isArray(tileDoc.features) ? tileDoc.features : [])
      .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    const tileBucket = bucketFor('tiles');
    await writeJsonObjectInBucket(objectStore, tileBucket, tileKey, { type: 'FeatureCollection', features: ordered });
  }

  const nextFeatures = [...indexByKey.values()]
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
  const allDone = datasets.every((dataset) => checkpoint.datasets[dataset.name]?.done);

  await writeJsonObjectInBucket(objectStore, indexBucket, indexKey, {
    type: 'FeatureCollection',
    state: stateAbbr,
    generatedAt: new Date().toISOString(),
    complete: allDone,
    features: nextFeatures,
  });
  await writeJsonObjectInBucket(objectStore, checkpointBucket, checkpointKey, checkpoint);

  return { done: allDone, checkpoint, indexKey };
}

export function createFileObjectStore(rootDir) {
  const root = path.resolve(String(rootDir || '.data/object-store'));
  return {
    async getObject(key) {
      return readFile(path.join(root, key));
    },
    async putObject(key, body) {
      const fullPath = path.join(root, key);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, body);
    },
  };
}

export function createMinioObjectStore({
  minioClient,
  defaultBucket = 'tile-server',
}) {
  if (!minioClient) throw new Error('minioClient is required');

  return {
    async getObject(key, { bucket = defaultBucket } = {}) {
      const stream = await minioClient.getObject(bucket, key);
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
    async putObject(key, body, { contentType = 'application/octet-stream', bucket = defaultBucket } = {}) {
      await minioClient.putObject(bucket, key, body, Buffer.byteLength(body), { 'Content-Type': contentType });
    },
  };
}
