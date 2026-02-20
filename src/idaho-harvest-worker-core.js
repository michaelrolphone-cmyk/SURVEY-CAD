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

function mercatorToLonLat(x, y) {
  const lon = (x / 20037508.34) * 180;
  const latRadians = Math.atan(Math.sinh((Number(y) / 20037508.34) * Math.PI));
  const lat = (latRadians * 180) / Math.PI;
  return { lon, lat };
}

function detectGeometryWkid(geometry = {}) {
  const candidate = geometry?.spatialReference?.latestWkid
    ?? geometry?.spatialReference?.wkid
    ?? geometry?.latestWkid
    ?? geometry?.wkid;
  const wkid = Number(candidate);
  return Number.isInteger(wkid) ? wkid : null;
}

function normalizeGeometryCoord(x, y, wkid = null) {
  const numericX = Number(x);
  const numericY = Number(y);
  if (!Number.isFinite(numericX) || !Number.isFinite(numericY)) return null;

  const isWebMercator = wkid === 102100 || wkid === 3857 || wkid === 102113;
  const likelyWebMercator = (Math.abs(numericX) > 180 || Math.abs(numericY) > 90)
    && Math.abs(numericX) <= 20037508.342789244
    && Math.abs(numericY) <= 20037508.342789244;

  if (isWebMercator || likelyWebMercator) {
    return mercatorToLonLat(numericX, numericY);
  }

  return { lon: numericX, lat: numericY };
}

export function arcgisGeometryToGeoJson(geometry = {}) {
  const wkid = detectGeometryWkid(geometry);

  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    const normalized = normalizeGeometryCoord(geometry.x, geometry.y, wkid);
    if (!normalized) return null;
    return { type: 'Point', coordinates: [normalized.lon, normalized.lat] };
  }

  if (Array.isArray(geometry.paths) && geometry.paths.length) {
    const lines = geometry.paths
      .map((line) => normalizeRing(line)
        .map((coord) => normalizeGeometryCoord(coord[0], coord[1], wkid))
        .filter(Boolean)
        .map((coord) => [coord.lon, coord.lat])
        .slice(0, -1))
      .filter((line) => line.length >= 2);
    if (!lines.length) return null;
    if (lines.length === 1) return { type: 'LineString', coordinates: lines[0] };
    return { type: 'MultiLineString', coordinates: lines };
  }

  if (Array.isArray(geometry.rings) && geometry.rings.length) {
    const rings = geometry.rings
      .map((ring) => normalizeRing(ring)
        .map((coord) => normalizeGeometryCoord(coord[0], coord[1], wkid))
        .filter(Boolean)
        .map((coord) => [coord.lon, coord.lat]))
      .filter((ring) => ring.length >= 4);
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
  const wkid = detectGeometryWkid(geometry);
  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    return normalizeGeometryCoord(geometry.x, geometry.y, wkid) || { lon: null, lat: null };
  }

  const collect = [];
  const scan = (parts = []) => {
    for (const part of parts) {
      if (!Array.isArray(part)) continue;
      for (const coord of part) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const normalized = normalizeGeometryCoord(coord[0], coord[1], wkid);
        if (normalized) collect.push({ x: normalized.lon, y: normalized.lat });
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

function resolveTileZoomLevels(dataset = {}) {
  if (Array.isArray(dataset.tileZoomLevels) && dataset.tileZoomLevels.length) {
    return [...new Set(dataset.tileZoomLevels
      .map((zoom) => Number(zoom))
      .filter((zoom) => Number.isInteger(zoom) && zoom >= 0 && zoom <= 22))]
      .sort((a, b) => a - b);
  }

  if (dataset.name === 'parcels') {
    return Array.from({ length: 23 }, (_, zoom) => zoom);
  }

  const fallback = Number(dataset.tileZoom ?? 14);
  return [Number.isInteger(fallback) && fallback >= 0 ? fallback : 14];
}

function extractSurveyNumbers(attributes = {}) {
  const values = [];
  for (const [rawKey, rawValue] of Object.entries(attributes || {})) {
    const key = String(rawKey || '');
    if (!/(^ros$|survey|record.*survey|ros.*(no|num|number))/i.test(key)) continue;
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    values.push(rawValue);
  }

  return [...new Set(values
    .flatMap((value) => String(value)
      .split(/[,;|/]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)))];
}

function extractPdfUrls(attributes = {}, { baseUrl = '' } = {}) {
  const urls = [];
  const normalizedBase = String(baseUrl || '').trim();
  const addValue = (value) => {
    if (value === null || value === undefined) return;
    const raw = String(value).trim();
    if (!raw) return;
    const candidates = raw.split(/[\s,;|]+/).map((entry) => entry.trim()).filter(Boolean);
    for (const candidate of candidates) {
      if (!/\.pdf($|[?#])/i.test(candidate)) continue;
      try {
        urls.push(new URL(candidate).toString());
        continue;
      } catch {
        if (!normalizedBase) continue;
      }

      try {
        urls.push(new URL(candidate, normalizedBase).toString());
      } catch {
        // ignore malformed URL values
      }
    }
  };

  for (const [rawKey, rawValue] of Object.entries(attributes || {})) {
    const key = String(rawKey || '');
    if (!/(pdf|file|url|link|document|doc)/i.test(key)) continue;
    addValue(rawValue);
  }

  return [...new Set(urls)];
}

function buildPdfObjectKey({ prefix, stateAbbr, dataset, objectId, pdfUrl, index }) {
  const parsed = new URL(pdfUrl);
  const fileName = path.basename(parsed.pathname || '') || `document-${index + 1}.pdf`;
  return `${prefix}/pdfs/${stateAbbr.toLowerCase()}/${dataset}/${encodeURIComponent(String(objectId))}/${index + 1}-${encodeURIComponent(fileName)}`;
}

function toGeoJsonFeature(feature = {}, { id, dataset, center }) {
  const attributes = feature?.attributes || {};
  const surveyNumbers = extractSurveyNumbers(attributes);
  return {
    type: 'Feature',
    id: `${dataset}:${id}`,
    geometry: arcgisGeometryToGeoJson(feature?.geometry || {}),
    properties: {
      dataset,
      objectId: id,
      surveyNumbers,
      location: Number.isFinite(center?.lon) && Number.isFinite(center?.lat)
        ? { lon: center.lon, lat: center.lat }
        : null,
      ...attributes,
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
  cpnfPdfBaseUrl = '',
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
  const DATASET_BUCKET_FALLBACKS = {
    parcels: 'tile-server',
    cpnf: 'cpnfs',
    subdivisions: 'cpnfs',
    subdivision: 'cpnfs',
  };
  const bucketFor = (kind, datasetName = '') => {
    if (datasetName && buckets?.[datasetName]) return buckets[datasetName];
    const fallbackBucket = DATASET_BUCKET_FALLBACKS[String(datasetName || '').toLowerCase()];
    if (fallbackBucket) return fallbackBucket;
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
      const attributes = feature?.attributes || {};

      const center = computeFeatureCenter(feature);
      const hasCenter = Number.isFinite(center.lon) && Number.isFinite(center.lat);
      const geojsonFeature = toGeoJsonFeature(feature, {
        id: objectId,
        dataset: dataset.name,
        center: hasCenter ? center : null,
      });
      const featureKey = `${prefix}/features/${stateAbbr.toLowerCase()}/${dataset.name}/${encodeURIComponent(String(objectId))}.geojson`;
      const featureBucket = bucketFor('features', dataset.name);

      const pdfKeys = [];
      if (String(dataset.name).toLowerCase() === 'cpnf') {
        const pdfUrls = extractPdfUrls(attributes, { baseUrl: cpnfPdfBaseUrl });
        for (const [pdfIndex, pdfUrl] of pdfUrls.entries()) {
          const pdfResponse = await fetchImpl(pdfUrl);
          if (!pdfResponse.ok) continue;
          const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
          if (!pdfBuffer.length) continue;
          const pdfKey = buildPdfObjectKey({
            prefix,
            stateAbbr,
            dataset: dataset.name,
            objectId,
            pdfUrl,
            index: pdfIndex,
          });
          await objectStore.putObject(pdfKey, pdfBuffer, {
            contentType: pdfResponse.headers?.get?.('content-type') || 'application/pdf',
            bucket: featureBucket,
          });
          pdfKeys.push(pdfKey);
        }
      }

      if (pdfKeys.length) {
        geojsonFeature.properties.cpnfPdfKeys = pdfKeys;
      }

      await writeJsonObjectInBucket(objectStore, featureBucket, featureKey, geojsonFeature);

      const tileKeys = hasCenter
        ? resolveTileZoomLevels(dataset).map((zoom) => {
          const tile = lonLatToTile(center.lon, center.lat, zoom);
          return `${prefix}/tiles/${stateAbbr.toLowerCase()}/${dataset.name}/${tile.z}/${tile.x}/${tile.y}.geojson`;
        })
        : [];

      for (const tileKey of tileKeys) {
        const tileDoc = await getTileDoc(tileKey);
        const featureId = `${dataset.name}:${objectId}`;
        tileDoc.features = (Array.isArray(tileDoc.features) ? tileDoc.features : [])
          .filter((existing) => String(existing?.id || '') !== featureId);
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
          tileKey: tileKeys[0] || null,
          tileKeys,
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
