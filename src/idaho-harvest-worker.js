import SurveyCadClient from './survey-api.js';
import { createS3FetchClient } from './evidence-desk-file-store.js';
import { runIdahoHarvestCycle } from './idaho-harvest-worker-core.js';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_RANDOM_DELAY_MIN_MS = 2 * 60 * 1000;
const DEFAULT_RANDOM_DELAY_MAX_MS = 10 * 60 * 1000;
const DEFAULT_IDAHO_HARVEST_PARCEL_LAYER = 23;
const DEFAULT_IDAHO_HARVEST_CPNF_LAYER = 18;

// Ada County gisprod portal — same source RecordQuarry uses to discover the CP&F layer.
const DEFAULT_ADA_CPF_PORTAL_BASE = 'https://gisprod.adacounty.id.gov/arcgis';
const DEFAULT_ADA_CPF_WEBMAP_ITEM_ID = '019521c7932442f0b4b581f641cbf236';

// Discovers the Ada County CP&F point layer URL from the gisprod ArcGIS portal, mirroring
// the same discovery logic used by RecordQuarry in the browser.  Returns the full layer
// service URL (suitable for appending "/query") or null when discovery fails.
async function discoverCpnfLayerUrl({ fetchImpl, portalBaseUrl, webmapItemId }) {
  const itemDataUrl = `${String(portalBaseUrl).replace(/\/+$/, '')}/sharing/rest/content/items/${webmapItemId}/data?f=json`;
  let webmap;
  try {
    const response = await fetchImpl(itemDataUrl);
    if (!response.ok) return null;
    webmap = await response.json();
  } catch {
    return null;
  }

  const candidates = [];
  function walk(entries) {
    for (const entry of (entries || [])) {
      if (entry?.url) candidates.push(String(entry.url).trim());
      if (entry?.layers) walk(entry.layers);
    }
  }
  walk(webmap?.operationalLayers);

  function hasInstrumentField(fields = []) {
    return (fields || []).some(
      (f) => /instr|instrument/i.test(f.name || '') || /instr|instrument/i.test(f.alias || ''),
    );
  }

  for (const candidateUrl of candidates) {
    const baseUrl = String(candidateUrl).replace(/[?#].*$/, '').replace(/\/+$/, '');
    let meta;
    try {
      const metaResp = await fetchImpl(`${baseUrl}?f=json`);
      if (!metaResp.ok) continue;
      meta = await metaResp.json();
    } catch {
      continue;
    }

    // Direct point layer with instrument field — use it as-is.
    if (/esriGeometryPoint/i.test(meta?.geometryType || '') && hasInstrumentField(meta?.fields || [])) {
      return baseUrl;
    }

    // Map service — check each sublayer.
    for (const layer of (meta?.layers || [])) {
      const layerUrl = `${baseUrl}/${layer.id}`;
      try {
        const layerMetaResp = await fetchImpl(`${layerUrl}?f=json`);
        if (!layerMetaResp.ok) continue;
        const layerMeta = await layerMetaResp.json();
        if (/esriGeometryPoint/i.test(layerMeta?.geometryType || '') && hasInstrumentField(layerMeta?.fields || [])) {
          return layerUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function parseLayerList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0);
}

function parseMapServerLayerCatalog(payload = {}) {
  const layers = Array.isArray(payload?.layers) ? payload.layers : [];
  return layers
    .map((layer) => ({
      layerId: Number(layer?.id),
      name: String(layer?.name || '').trim(),
    }))
    .filter((layer) => Number.isInteger(layer.layerId) && layer.layerId >= 0);
}

function findLayerIdsByName(catalog = [], matcher = () => false) {
  return catalog
    .filter((layer) => matcher(layer.name))
    .map((layer) => layer.layerId);
}

export async function resolveHarvestDatasets({
  fetchImpl,
  adaMapServerBaseUrl,
  env = process.env,
}) {
  // Guard against callers that pass undefined (e.g. client.fetchImpl when the client
  // does not expose a fetchImpl property).
  const resolvedFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;

  const explicitParcelLayers = parseLayerList(env.IDAHO_HARVEST_PARCEL_LAYERS);
  const explicitCpnfLayers = parseLayerList(env.IDAHO_HARVEST_CPNF_LAYERS);
  const fallbackParcelLayers = explicitParcelLayers.length
    ? explicitParcelLayers
    : [Number(env.IDAHO_HARVEST_PARCEL_LAYER || DEFAULT_IDAHO_HARVEST_PARCEL_LAYER)];
  const fallbackCpnfLayers = explicitCpnfLayers.length
    ? explicitCpnfLayers
    : [Number(env.IDAHO_HARVEST_CPNF_LAYER || DEFAULT_IDAHO_HARVEST_CPNF_LAYER)];

  const metadataUrl = `${String(adaMapServerBaseUrl || '').replace(/\/+$/, '')}?f=json`;
  let catalog = [];
  try {
    const response = await resolvedFetch(metadataUrl);
    if (response.ok) {
      catalog = parseMapServerLayerCatalog(await response.json());
    }
  } catch {
    catalog = [];
  }

  const discoveredParcelLayers = explicitParcelLayers.length
    ? explicitParcelLayers
    : findLayerIdsByName(catalog, (name) => /parcel/i.test(name));
  const discoveredCpnfLayers = explicitCpnfLayers.length
    ? explicitCpnfLayers
    : findLayerIdsByName(catalog, (name) => /(cp\s*&\s*f|cpnf|corner)/i.test(name));

  const parcelLayers = discoveredParcelLayers.length ? discoveredParcelLayers : fallbackParcelLayers;
  const cpnfLayers = discoveredCpnfLayers.length ? discoveredCpnfLayers : fallbackCpnfLayers;

  // Discover the real CP&F feature layer URL from the Ada County gisprod portal —
  // the same way RecordQuarry does it in the browser.  The assessor's map server
  // (adaMapServerBaseUrl) has subdivisions at layer 18, not CP&F records, so we
  // cannot rely on it for CPNF queries.
  const portalBaseUrl = String(env.ADA_CPF_PORTAL_BASE || DEFAULT_ADA_CPF_PORTAL_BASE);
  const webmapItemId = String(env.ADA_CPF_WEBMAP_ITEM_ID || DEFAULT_ADA_CPF_WEBMAP_ITEM_ID);
  let cpnfServiceUrl = null;
  try {
    cpnfServiceUrl = await discoverCpnfLayerUrl({ fetchImpl: resolvedFetch, portalBaseUrl, webmapItemId });
  } catch {
    cpnfServiceUrl = null;
  }

  return [
    ...parcelLayers.map((layerId) => ({ name: `parcels-layer-${layerId}`, layerId })),
    ...cpnfLayers.map((layerId) => ({
      name: `cpnf-layer-${layerId}`,
      layerId,
      ...(cpnfServiceUrl ? { serviceUrl: cpnfServiceUrl } : {}),
    })),
  ];
}

function randomIntBetween(minInclusive, maxInclusive, randomFn = Math.random) {
  const min = Math.ceil(Number(minInclusive));
  const max = Math.floor(Number(maxInclusive));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max <= min) return min;
  return Math.floor(randomFn() * (max - min + 1)) + min;
}

export function resolveInterBatchDelayMs(env = process.env, randomFn = Math.random) {
  const randomEnabled = String(env.IDAHO_HARVEST_RANDOM_DELAY_ENABLED || '1') !== '0';
  if (!randomEnabled) {
    return Math.max(0, Number(env.IDAHO_HARVEST_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS));
  }

  const minMs = Math.max(0, Number(env.IDAHO_HARVEST_RANDOM_DELAY_MIN_MS || DEFAULT_RANDOM_DELAY_MIN_MS));
  const maxMs = Math.max(minMs, Number(env.IDAHO_HARVEST_RANDOM_DELAY_MAX_MS || DEFAULT_RANDOM_DELAY_MAX_MS));
  return randomIntBetween(minMs, maxMs, randomFn);
}

function areWorkersEnabled(env = process.env) {
  return String(env.WORKERS_ENABLED || '1').trim().toLowerCase() !== 'false'
    && String(env.WORKERS_ENABLED || '1').trim() !== '0';
}

export function createIdahoHarvestObjectStoreFromEnv(env = process.env, createS3Client = createS3FetchClient) {
  const endpoint = String(env.STACKHERO_MINIO_HOST || '').trim();
  const accessKeyId = String(env.STACKHERO_MINIO_ACCESS_KEY || '').trim();
  const secretAccessKey = String(env.STACKHERO_MINIO_SECRET_KEY || '').trim();
  const port = Number(env.STACKHERO_MINIO_PORT || 443);
  const useSSL = String(env.STACKHERO_MINIO_USE_SSL || 'true') !== 'false';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing MinIO configuration. STACKHERO_MINIO_HOST, STACKHERO_MINIO_ACCESS_KEY, and STACKHERO_MINIO_SECRET_KEY are required.');
  }

  const region = String(env.STACKHERO_MINIO_REGION || 'us-east-1');
  const forcePathStyle = String(env.STACKHERO_MINIO_FORCE_PATH_STYLE || 'true') !== 'false';
  const protocol = useSSL ? 'https' : 'http';
  const baseEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${protocol}://${endpoint}${port ? `:${port}` : ''}`;

  const clients = new Map();
  const getClient = (bucket = 'tile-server') => {
    const bucketName = String(bucket || 'tile-server');
    if (!clients.has(bucketName)) {
      clients.set(bucketName, createS3Client({
        endpoint: baseEndpoint,
        bucket: bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        forcePathStyle,
      }));
    }
    return clients.get(bucketName);
  };

  return {
    async getObject(key, { bucket = 'tile-server' } = {}) {
      return getClient(bucket).getObject(key);
    },
    async putObject(key, body, { contentType = 'application/octet-stream', bucket = 'tile-server' } = {}) {
      await getClient(bucket).putObject(key, body, { contentType });
    },
  };
}

export async function runIdahoHarvestWorker({
  env = process.env,
  client = new SurveyCadClient(),
  store = null,
  sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  randomFn = Math.random,
} = {}) {
  if (!areWorkersEnabled(env)) return;

  const resolvedStore = store || createIdahoHarvestObjectStoreFromEnv(env);
  let shuttingDown = false;

  const sigtermHandler = () => {
    shuttingDown = true;
  };
  process.on('SIGTERM', sigtermHandler);

  try {
    const datasets = await resolveHarvestDatasets({
      fetchImpl: client.fetchImpl,
      adaMapServerBaseUrl: client.config.adaMapServer,
      env,
    });

    while (!shuttingDown) {
      const result = await runIdahoHarvestCycle({
        fetchImpl: client.fetchImpl,
        objectStore: resolvedStore,
        adaMapServerBaseUrl: client.config.adaMapServer,
        batchSize: Number(env.IDAHO_HARVEST_BATCH_SIZE || 100),
        cpnfPdfBaseUrl: String(env.IDAHO_HARVEST_CPNF_PDF_BASE_URL || ''),
        datasets,
        buckets: {
          default: String(env.IDAHO_HARVEST_MINIO_DEFAULT_BUCKET || 'tile-server'),
          parcels: String(env.IDAHO_HARVEST_MINIO_PARCELS_BUCKET || 'tile-server'),
          cpnf: String(env.IDAHO_HARVEST_MINIO_CPNF_BUCKET || 'cpnfs'),
          tiles: String(env.IDAHO_HARVEST_MINIO_TILE_BUCKET || 'tile-server'),
          indexes: String(env.IDAHO_HARVEST_MINIO_INDEX_BUCKET || 'tile-server'),
          checkpoints: String(env.IDAHO_HARVEST_MINIO_CHECKPOINT_BUCKET || 'tile-server'),
        },
      });

      if (result.done) return;
      const delayMs = resolveInterBatchDelayMs(env, randomFn);
      await sleepFn(delayMs);
    }
  } finally {
    process.off('SIGTERM', sigtermHandler);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').toString()) {
  runIdahoHarvestWorker().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(`idaho-harvest-worker failed: ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
