import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PREFIX = 'surveycad/idaho-harvest';
const DEFAULT_CPNF_PDF_DOWNLOAD_BASE = 'https://gisprod.adacounty.id.gov/apps/acdscpf/CpfPdfs/';

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

// Like buildLayerQueryUrl but supports a pre-resolved serviceUrl (full layer endpoint).
// When serviceUrl is provided it is used directly; otherwise falls back to baseUrl/layerId.
function buildDatasetQueryUrl(baseUrl, layerId, serviceUrl, params = {}) {
  const base = serviceUrl
    ? `${String(serviceUrl).replace(/\/+$/, '')}/query`
    : `${String(baseUrl).replace(/\/+$/, '')}/${layerId}/query`;
  const url = new URL(base);
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

function extractInstrumentNumbers(attributes = {}) {
  const values = [];
  for (const [rawKey, rawValue] of Object.entries(attributes || {})) {
    const key = String(rawKey || '');
    if (!/(instrument|inst(?:rument)?\b|doc(?:ument)?\s*(?:no|num|number))/i.test(key)) continue;
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    values.push(rawValue);
  }

  return [...new Set(values
    .flatMap((value) => String(value)
      .split(/[,;|]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)))];
}

function normalizePdfUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\.pdf$/i, '.pdf');
    return parsed.toString();
  } catch {
    return url;
  }
}

function resolveCpnfPdfUrls(attributes = {}, { baseUrl = '' } = {}) {
  const pdfUrls = extractPdfUrls(attributes, { baseUrl });
  const instrumentUrls = extractInstrumentNumbers(attributes).map((instrumentNumber) => {
    const normalizedInstrument = String(instrumentNumber || '').trim();
    if (!normalizedInstrument) return null;
    return `${DEFAULT_CPNF_PDF_DOWNLOAD_BASE}${encodeURIComponent(normalizedInstrument)}.pdf`;
  }).filter(Boolean);

  return [...new Set([...pdfUrls, ...instrumentUrls].map(normalizePdfUrl))];
}

function buildPdfObjectKey({ prefix, stateAbbr, dataset, objectId, pdfUrl, index }) {
  const parsed = new URL(pdfUrl);
  const rawFileName = path.basename(parsed.pathname || '') || `document-${index + 1}.pdf`;
  const fileName = rawFileName.replace(/\.pdf$/i, '.pdf');
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
    { name: 'parcels', layerId: 23, tileZoom: 14 },
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
    const normalizedDatasetName = String(datasetName || '').toLowerCase();
    if (datasetName && buckets?.[datasetName]) return buckets[datasetName];
    if (normalizedDatasetName.startsWith('parcels')) return buckets?.parcels || DATASET_BUCKET_FALLBACKS.parcels;
    if (normalizedDatasetName.startsWith('cpnf')) return buckets?.cpnf || DATASET_BUCKET_FALLBACKS.cpnf;
    const fallbackBucket = DATASET_BUCKET_FALLBACKS[normalizedDatasetName];
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
    cpnfPdfScrape: {
      offset: 0,
      done: false,
    },
  });

  if (!checkpoint.cpnfPdfScrape || typeof checkpoint.cpnfPdfScrape !== 'object') {
    checkpoint.cpnfPdfScrape = { offset: 0, done: false };
  }

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

  const cpnfDataset = datasets.find((dataset) => String(dataset?.name || '').toLowerCase().startsWith('cpnf'));
  const cpnfPdfState = checkpoint.cpnfPdfScrape || { offset: 0, done: false };

  if (cpnfDataset && !cpnfPdfState.done) {
    const pdfQueryUrl = buildDatasetQueryUrl(adaMapServerBaseUrl, cpnfDataset.layerId, cpnfDataset.serviceUrl, {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'false',
      orderByFields: 'OBJECTID ASC',
      resultOffset: Number(cpnfPdfState.offset || 0),
      resultRecordCount: Math.max(1, Number(batchSize) || 100),
    });

    const pdfQueryResponse = await fetchImpl(pdfQueryUrl);
    if (!pdfQueryResponse.ok) throw new Error(`Harvest PDF query failed for ${cpnfDataset.name}: HTTP ${pdfQueryResponse.status}`);
    const pdfQueryPayload = await pdfQueryResponse.json();
    const pdfFeatures = Array.isArray(pdfQueryPayload?.features) ? pdfQueryPayload.features : [];
    const cpnfBucket = bucketFor('features', cpnfDataset.name);

    if (!pdfFeatures.length) {
      checkpoint.cpnfPdfScrape = {
        ...cpnfPdfState,
        done: true,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    } else {
      for (const feature of pdfFeatures) {
        const objectId = toObjectId(feature);
        if (objectId === '') continue;
        const attributes = feature?.attributes || {};
        const pdfUrls = resolveCpnfPdfUrls(attributes, { baseUrl: cpnfPdfBaseUrl });
        if (!pdfUrls.length) continue;

        const featureKey = `${prefix}/features/${stateAbbr.toLowerCase()}/${cpnfDataset.name}/${encodeURIComponent(String(objectId))}.geojson`;
        const existingFeature = await readJsonObjectInBucket(objectStore, cpnfBucket, featureKey, null);
        const existingKeys = Array.isArray(existingFeature?.properties?.cpnfPdfKeys)
          ? existingFeature.properties.cpnfPdfKeys
          : [];

        const nextKeys = [...existingKeys];
        for (const [pdfIndex, pdfUrl] of pdfUrls.entries()) {
          const pdfKey = buildPdfObjectKey({
            prefix,
            stateAbbr,
            dataset: cpnfDataset.name,
            objectId,
            pdfUrl,
            index: pdfIndex,
          });

          const pdfResponse = await fetchImpl(pdfUrl);
          if (!pdfResponse.ok) continue;
          const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
          if (!pdfBuffer.length) continue;
          await objectStore.putObject(pdfKey, pdfBuffer, {
            contentType: pdfResponse.headers?.get?.('content-type') || 'application/pdf',
            bucket: cpnfBucket,
          });
          if (!nextKeys.includes(pdfKey)) nextKeys.push(pdfKey);
        }

        if (existingFeature && nextKeys.length) {
          existingFeature.properties = existingFeature.properties || {};
          existingFeature.properties.cpnfPdfKeys = [...new Set(nextKeys)];
          await writeJsonObjectInBucket(objectStore, cpnfBucket, featureKey, existingFeature);
        }
      }

      checkpoint.cpnfPdfScrape = {
        offset: Number(cpnfPdfState.offset || 0) + pdfFeatures.length,
        done: false,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }
  }

  const datasetOrder = datasets.map((_, index) => (nextDatasetIndex + index) % (datasetCount || 1));

  for (const datasetIndex of datasetOrder) {
    const dataset = datasets[datasetIndex];
    const state = checkpoint.datasets[dataset.name] || { offset: 0, done: false };
    if (state.done) continue;

    const queryUrl = buildDatasetQueryUrl(adaMapServerBaseUrl, dataset.layerId, dataset.serviceUrl, {
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
      if (String(dataset.name).toLowerCase().startsWith('cpnf')) {
        const pdfUrls = resolveCpnfPdfUrls(attributes, { baseUrl: cpnfPdfBaseUrl });
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
  const cpnfPdfDone = !cpnfDataset || checkpoint.cpnfPdfScrape?.done;

  await writeJsonObjectInBucket(objectStore, indexBucket, indexKey, {
    type: 'FeatureCollection',
    state: stateAbbr,
    generatedAt: new Date().toISOString(),
    complete: allDone && cpnfPdfDone,
    features: nextFeatures,
  });
  await writeJsonObjectInBucket(objectStore, checkpointBucket, checkpointKey, checkpoint);

  return { done: allDone && cpnfPdfDone, checkpoint, indexKey };
}

// -------------------------------------------------------------------------------------------------
// Ada County Assessor — Directory Listing Scrapers (Apache-style autoindex)
//
// Records of Survey base:
//   https://adacountyassessor.org/docs/recordsofsurvey/
//
// Subdivision Plats base:
//   https://adacountyassessor.org/docs/subdivisionplats/
//
// These scrapers are additive: they do NOT change the Idaho ArcGIS harvest pipeline.
// They persist their own checkpoints in the destination bucket under:
//
//   <prefix>/_meta/ros-scrape-state.json
//   <prefix>/_meta/subdivision-plats-scrape-state.json
//
// Object keys preserve the on-site relative path beneath the base directory.
// -------------------------------------------------------------------------------------------------

const DEFAULT_ROS_BASE_URL = 'https://adacountyassessor.org/docs/recordsofsurvey/';
const DEFAULT_ROS_PREFIX = 'adacounty/recordsofsurvey';
const DEFAULT_ROS_BUCKET = 'records-of-survey';

const DEFAULT_SUBDIVISION_PLATS_BASE_URL = 'https://adacountyassessor.org/docs/subdivisionplats/';
const DEFAULT_SUBDIVISION_PLATS_PREFIX = 'adacounty/subdivisionplats';
const DEFAULT_SUBDIVISION_PLATS_BUCKET = 'subdivision-plats';

function dirNormalizeTrailingSlash(url) {
  const str = String(url || '').trim();
  if (!str) return str;
  return str.endsWith('/') ? str : `${str}/`;
}

function dirDecodeHtmlEntities(input) {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function dirExtractHrefLinksFromHtml(html = '') {
  const text = String(html || '');
  const hrefs = [];

  // Double-quoted href
  const re1 = /<a\s+[^>]*href\s*=\s*"([^"]+)"/gi;
  for (let match = re1.exec(text); match; match = re1.exec(text)) {
    hrefs.push(dirDecodeHtmlEntities(match[1]));
  }

  // Single-quoted href
  const re2 = /<a\s+[^>]*href\s*=\s*'([^']+)'/gi;
  for (let match = re2.exec(text); match; match = re2.exec(text)) {
    hrefs.push(dirDecodeHtmlEntities(match[1]));
  }

  return [...new Set(hrefs)].filter(Boolean);
}

function dirIsParentDirectoryHref(href) {
  const h = String(href || '').trim();
  return h === '../' || h === '..' || h.startsWith('?') || h === '#';
}

function dirIsDirectoryUrl(url) {
  try {
    return new URL(url).pathname.endsWith('/');
  } catch {
    return false;
  }
}

function dirIsFileUrl(url) {
  try {
    return !new URL(url).pathname.endsWith('/');
  } catch {
    return false;
  }
}

function dirContentTypeFromUrl(url, fallback = 'application/octet-stream') {
  const pathname = (() => {
    try { return new URL(url).pathname || ''; } catch { return ''; }
  })();
  const ext = path.extname(pathname).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.htm' || ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.xml') return 'application/xml; charset=utf-8';
  return fallback;
}

function dirBuildRelativePath(fileUrl, basePathname) {
  try {
    const u = new URL(fileUrl);
    const filePath = decodeURIComponent(u.pathname || '').replace(/^\/+/, '');
    const basePath = decodeURIComponent(String(basePathname || '')).replace(/^\/+/, '');
    if (basePath && filePath.startsWith(basePath)) {
      const rel = filePath.slice(basePath.length).replace(/^\/+/, '');
      return rel || path.basename(filePath);
    }
    return filePath;
  } catch {
    return String(fileUrl || '').replace(/^\/+/, '');
  }
}

function dirParseApacheIndex({ html, directoryUrl, rootUrl }) {
  const base = dirNormalizeTrailingSlash(directoryUrl);
  const root = dirNormalizeTrailingSlash(rootUrl);

  let rootObj;
  try { rootObj = new URL(root); } catch { rootObj = null; }

  const hrefs = dirExtractHrefLinksFromHtml(html);

  const dirs = [];
  const files = [];

  for (const href of hrefs) {
    if (dirIsParentDirectoryHref(href)) continue;

    let abs;
    try {
      abs = new URL(href, base).toString();
    } catch {
      continue;
    }

    // Constrain to within root (same origin + pathname prefix).
    try {
      const u = new URL(abs);
      if (rootObj && u.origin !== rootObj.origin) continue;
      if (rootObj && !u.pathname.startsWith(rootObj.pathname)) continue;
    } catch {
      continue;
    }

    if (dirIsDirectoryUrl(abs)) dirs.push(dirNormalizeTrailingSlash(abs));
    else if (dirIsFileUrl(abs)) files.push(abs);
  }

  const byPath = (a, b) => {
    try { return new URL(a).pathname.localeCompare(new URL(b).pathname); } catch { return String(a).localeCompare(String(b)); }
  };

  return {
    dirs: [...new Set(dirs)].sort(byPath),
    files: [...new Set(files)].sort(byPath),
  };
}

async function dirFetchText(fetchImpl, url, { retries = 3 } = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const resp = await fetchImpl(url, { method: 'GET', headers: { 'user-agent': 'surveyfoundry-directory-scraper/1.0' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt > retries) break;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr;
}

async function dirFetchBinary(fetchImpl, url, { retries = 3 } = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const resp = await fetchImpl(url, { method: 'GET', headers: { 'user-agent': 'surveyfoundry-directory-scraper/1.0' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      return { resp, buf };
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt > retries) break;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

async function dirReadJsonStateInBucket(store, bucket, key, fallback = null) {
  try {
    const payload = await store.getObject(key, { bucket });
    if (!payload) return fallback;
    return JSON.parse(Buffer.from(payload).toString('utf8'));
  } catch {
    return fallback;
  }
}

async function dirWriteJsonStateInBucket(store, bucket, key, payload) {
  await store.putObject(key, Buffer.from(JSON.stringify(payload, null, 2)), {
    contentType: 'application/json; charset=utf-8',
    bucket,
  });
}

async function dirPutObjectVerified(objectStore, objectKey, body, { contentType, bucket, retries = 2 } = {}) {
  let attempt = 0;
  let lastErr = null;
  while (attempt <= retries) {
    try {
      const res = await objectStore.putObject(objectKey, body, { contentType, bucket });

      // Some stores return a fetch Response; enforce ok=true.
      if (res && typeof res.ok === 'boolean' && !res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch { detail = ''; }
        throw new Error(`PUT ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
      }

      return;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt > retries) break;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

async function runApacheDirectoryScrapeCycle({
  fetchImpl = fetch,
  objectStore,
  baseUrl,
  prefix,
  bucket,
  batchSize = 25,
  requestDelayMs = 0,
  metaFileName,
} = {}) {
  if (!objectStore) throw new Error('objectStore is required');

  const rootUrl = dirNormalizeTrailingSlash(baseUrl);
  const rootPathname = (() => {
    try { return dirNormalizeTrailingSlash(new URL(rootUrl).pathname); } catch { return '/'; }
  })();

  const normalizedPrefix = String(prefix || '').replace(/\/+$/, '');
  const metaKey = `${normalizedPrefix}/_meta/${metaFileName}`;

  const checkpoint = await dirReadJsonStateInBucket(objectStore, bucket, metaKey, {
    version: 1,
    baseUrl: rootUrl,
    rootPathname,
    prefix: normalizedPrefix,
    bucket,
    done: false,
    queue: [rootUrl],
    seenDirs: { [rootUrl]: true },
    current: null,
    stats: { filesUploaded: 0, bytesUploaded: 0, lastFileUrl: null, lastObjectKey: null, lastDirUrl: null },
    lastError: null,
    lastErrorAt: null,
    updatedAt: new Date().toISOString(),
  });

  // If config changed, reset traversal but keep cumulative stats.
  if (String(checkpoint.baseUrl || '') !== rootUrl
    || String(checkpoint.prefix || '') !== normalizedPrefix
    || String(checkpoint.bucket || '') !== String(bucket || '')) {
    checkpoint.baseUrl = rootUrl;
    checkpoint.rootPathname = rootPathname;
    checkpoint.prefix = normalizedPrefix;
    checkpoint.bucket = bucket;
    checkpoint.done = false;
    checkpoint.queue = [rootUrl];
    checkpoint.seenDirs = { [rootUrl]: true };
    checkpoint.current = null;
    checkpoint.lastError = null;
    checkpoint.lastErrorAt = null;
  }

  if (checkpoint.done) return { done: true, checkpointKey: metaKey, stats: checkpoint.stats };

  // Re-seed the root each cycle so newly added folders appear without reset.
  try {
    const rootHtml = await dirFetchText(fetchImpl, rootUrl);
    const parsedRoot = dirParseApacheIndex({ html: rootHtml, directoryUrl: rootUrl, rootUrl });
    checkpoint.queue = Array.isArray(checkpoint.queue) ? checkpoint.queue : [];
    checkpoint.seenDirs = checkpoint.seenDirs && typeof checkpoint.seenDirs === 'object' ? checkpoint.seenDirs : {};

    for (const dirUrl of parsedRoot.dirs) {
      const normalizedDir = dirNormalizeTrailingSlash(dirUrl);
      if (checkpoint.seenDirs[normalizedDir]) continue;
      checkpoint.seenDirs[normalizedDir] = true;
      checkpoint.queue.push(normalizedDir);
    }
  } catch {
    // ignore root fetch failures; continue with existing queue
  }

  let remaining = Math.max(1, Number(batchSize) || 25);
  const delayMs = Math.max(0, Number(requestDelayMs) || 0);

  while (remaining > 0) {
    if (!checkpoint.current) {
      checkpoint.queue = Array.isArray(checkpoint.queue) ? checkpoint.queue : [];
      const nextDir = checkpoint.queue.shift();
      if (!nextDir) {
        checkpoint.done = true;
        checkpoint.updatedAt = new Date().toISOString();
        await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);
        return { done: true, checkpointKey: metaKey, stats: checkpoint.stats };
      }
      checkpoint.current = { dirUrl: dirNormalizeTrailingSlash(nextDir), fileIndex: 0 };
    }

    const dirUrl = dirNormalizeTrailingSlash(checkpoint.current.dirUrl);

    let html;
    try {
      html = await dirFetchText(fetchImpl, dirUrl);
    } catch (err) {
      checkpoint.lastError = String(err?.stack || err?.message || err);
      checkpoint.lastErrorAt = new Date().toISOString();
      checkpoint.stats.lastDirUrl = dirUrl;
      checkpoint.updatedAt = new Date().toISOString();
      await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);
      throw err;
    }

    const parsed = dirParseApacheIndex({ html, directoryUrl: dirUrl, rootUrl });

    // Enqueue discovered subdirectories (recursive crawl).
    checkpoint.queue = Array.isArray(checkpoint.queue) ? checkpoint.queue : [];
    checkpoint.seenDirs = checkpoint.seenDirs && typeof checkpoint.seenDirs === 'object' ? checkpoint.seenDirs : {};
    for (const subdir of parsed.dirs) {
      const normalizedSubdir = dirNormalizeTrailingSlash(subdir);
      if (checkpoint.seenDirs[normalizedSubdir]) continue;
      checkpoint.seenDirs[normalizedSubdir] = true;
      checkpoint.queue.push(normalizedSubdir);
    }

    const files = parsed.files;
    let idx = Math.max(0, Number(checkpoint.current.fileIndex) || 0);

    if (idx >= files.length) {
      checkpoint.current = null;
      checkpoint.updatedAt = new Date().toISOString();
      await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);
      continue;
    }

    while (remaining > 0 && idx < files.length) {
      const fileUrl = files[idx];
      const rel = dirBuildRelativePath(fileUrl, checkpoint.rootPathname);
      const objectKey = `${normalizedPrefix}/${rel}`.replace(/\/+/g, '/');

      let buf;
      try {
        const fetched = await dirFetchBinary(fetchImpl, fileUrl);
        buf = fetched.buf;
        const contentType = fetched.resp.headers?.get?.('content-type') || dirContentTypeFromUrl(fileUrl);
        await dirPutObjectVerified(objectStore, objectKey, buf, { contentType, bucket, retries: 2 });
      } catch (err) {
        checkpoint.lastError = String(err?.stack || err?.message || err);
        checkpoint.lastErrorAt = new Date().toISOString();
        checkpoint.stats = checkpoint.stats || {};
        checkpoint.stats.lastFileUrl = fileUrl;
        checkpoint.stats.lastObjectKey = objectKey;
        checkpoint.stats.lastDirUrl = dirUrl;
        checkpoint.updatedAt = new Date().toISOString();
        await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);
        throw err;
      }

      checkpoint.stats = checkpoint.stats || {};
      checkpoint.stats.filesUploaded = Number(checkpoint.stats.filesUploaded || 0) + 1;
      checkpoint.stats.bytesUploaded = Number(checkpoint.stats.bytesUploaded || 0) + Number(buf.byteLength || buf.length || 0);
      checkpoint.stats.lastFileUrl = fileUrl;
      checkpoint.stats.lastObjectKey = objectKey;
      checkpoint.stats.lastDirUrl = dirUrl;

      idx += 1;
      checkpoint.current.fileIndex = idx;
      checkpoint.lastError = null;
      checkpoint.lastErrorAt = null;
      checkpoint.updatedAt = new Date().toISOString();

      await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);

      remaining -= 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    if (checkpoint.current && checkpoint.current.fileIndex >= files.length) {
      checkpoint.current = null;
    }
  }

  checkpoint.updatedAt = new Date().toISOString();
  await dirWriteJsonStateInBucket(objectStore, bucket, metaKey, checkpoint);
  return { done: false, checkpointKey: metaKey, stats: checkpoint.stats };
}

export async function runRosScrapeCycle({
  fetchImpl = fetch,
  objectStore,
  baseUrl = DEFAULT_ROS_BASE_URL,
  prefix = DEFAULT_ROS_PREFIX,
  bucket = DEFAULT_ROS_BUCKET,
  batchSize = 25,
  requestDelayMs = 0,
} = {}) {
  return runApacheDirectoryScrapeCycle({
    fetchImpl,
    objectStore,
    baseUrl,
    prefix,
    bucket,
    batchSize,
    requestDelayMs,
    metaFileName: 'ros-scrape-state.json',
  });
}

export async function runSubdivisionPlatsScrapeCycle({
  fetchImpl = fetch,
  objectStore,
  baseUrl = DEFAULT_SUBDIVISION_PLATS_BASE_URL,
  prefix = DEFAULT_SUBDIVISION_PLATS_PREFIX,
  bucket = DEFAULT_SUBDIVISION_PLATS_BUCKET,
  batchSize = 25,
  requestDelayMs = 0,
} = {}) {
  return runApacheDirectoryScrapeCycle({
    fetchImpl,
    objectStore,
    baseUrl,
    prefix,
    bucket,
    batchSize,
    requestDelayMs,
    metaFileName: 'subdivision-plats-scrape-state.json',
  });
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
