import SurveyCadClient from './survey-api.js';
import { createS3FetchClient } from './evidence-desk-file-store.js';
import { runIdahoHarvestCycle } from './idaho-harvest-worker-core.js';

const POLL_INTERVAL_MS = Number(process.env.IDAHO_HARVEST_POLL_INTERVAL_MS || 1000);

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

export async function runIdahoHarvestWorker({ env = process.env, client = new SurveyCadClient(), store = null } = {}) {
  const resolvedStore = store || createIdahoHarvestObjectStoreFromEnv(env);
  let shuttingDown = false;

  const sigtermHandler = () => {
    shuttingDown = true;
  };
  process.on('SIGTERM', sigtermHandler);

  try {
    while (!shuttingDown) {
      const result = await runIdahoHarvestCycle({
        fetchImpl: client.fetchImpl,
        objectStore: resolvedStore,
        adaMapServerBaseUrl: client.config.adaMapServer,
        batchSize: Number(env.IDAHO_HARVEST_BATCH_SIZE || 100),
        datasets: [
          { name: 'parcels', layerId: Number(env.IDAHO_HARVEST_PARCEL_LAYER || 24) },
          { name: 'cpnf', layerId: Number(env.IDAHO_HARVEST_CPNF_LAYER || 18) },
        ],
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
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, POLL_INTERVAL_MS)));
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
