import { createClient } from 'redis';

function sanitizeSegment(value = '') {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildResource({ projectId, folderKey, record }) {
  return {
    id: record.id,
    folder: folderKey,
    title: record.originalFileName,
    exportFormat: record.extension,
    reference: {
      type: 'server-upload',
      value: `/api/project-files/download?projectId=${encodeURIComponent(projectId)}&folderKey=${encodeURIComponent(folderKey)}&fileName=${encodeURIComponent(record.storedName)}`,
      resolverHint: 'evidence-desk-upload',
      metadata: {
        fileName: record.originalFileName,
        storedName: record.storedName,
        uploadedAt: record.createdAt,
        updatedAt: record.updatedAt,
        sizeBytes: record.sizeBytes,
      },
    },
  };
}

export class InMemoryEvidenceDeskFileStore {
  constructor() {
    this.records = new Map();
  }

  key(projectId, folderKey, fileName) {
    return `${projectId}::${folderKey}::${fileName}`;
  }

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType }) {
    const timestamp = Date.now();
    const storedName = `${timestamp}-${sanitizeSegment(originalFileName)}`;
    const id = `upload-${sanitizeSegment(originalFileName.replace(/\.[^.]+$/, '')).replace(/_/g, '-')}-${timestamp}`;
    const now = new Date(timestamp).toISOString();
    const record = {
      id,
      projectId,
      folderKey,
      originalFileName,
      storedName,
      extension,
      mimeType,
      sizeBytes: buffer.length,
      createdAt: now,
      updatedAt: now,
      dataBase64: Buffer.from(buffer).toString('base64'),
    };
    this.records.set(this.key(projectId, folderKey, storedName), record);
    return buildResource({ projectId, folderKey, record });
  }

  async getFile(projectId, folderKey, fileName) {
    const record = this.records.get(this.key(projectId, folderKey, fileName));
    if (!record) return null;
    return {
      ...record,
      buffer: Buffer.from(record.dataBase64, 'base64'),
    };
  }

  async updateFile({ projectId, folderKey, fileName, originalFileName, buffer, extension, mimeType }) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    const record = {
      ...existing,
      originalFileName: originalFileName || existing.originalFileName,
      extension: extension || existing.extension,
      mimeType: mimeType || existing.mimeType,
      sizeBytes: buffer.length,
      updatedAt,
      dataBase64: Buffer.from(buffer).toString('base64'),
    };
    this.records.set(this.key(projectId, folderKey, fileName), record);
    return buildResource({ projectId, folderKey, record });
  }

  async deleteFile(projectId, folderKey, fileName) {
    return this.records.delete(this.key(projectId, folderKey, fileName));
  }

  async listFiles(projectId, validFolderKeys = []) {
    const grouped = {};
    for (const folderKey of validFolderKeys) grouped[folderKey] = [];
    for (const record of this.records.values()) {
      if (record.projectId !== projectId) continue;
      if (!grouped[record.folderKey]) grouped[record.folderKey] = [];
      grouped[record.folderKey].push({
        folderKey: record.folderKey,
        fileName: record.storedName,
        title: record.originalFileName,
        sizeBytes: record.sizeBytes,
        uploadedAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }
    for (const values of Object.values(grouped)) values.sort((a, b) => a.fileName.localeCompare(b.fileName));
    const files = Object.values(grouped).flat();
    return { files, filesByFolder: grouped };
  }
}

export class RedisEvidenceDeskFileStore {
  constructor(redis, { prefix = 'surveycad:evidence-desk' } = {}) {
    this.redis = redis;
    this.prefix = prefix;
  }

  metadataKey(projectId, folderKey, fileName) {
    return `${this.prefix}:meta:${projectId}:${folderKey}:${fileName}`;
  }

  binaryKey(projectId, folderKey, fileName) {
    return `${this.prefix}:bin:${projectId}:${folderKey}:${fileName}`;
  }

  folderIndexKey(projectId, folderKey) {
    return `${this.prefix}:index:${projectId}:${folderKey}`;
  }

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType }) {
    const timestamp = Date.now();
    const storedName = `${timestamp}-${sanitizeSegment(originalFileName)}`;
    const id = `upload-${sanitizeSegment(originalFileName.replace(/\.[^.]+$/, '')).replace(/_/g, '-')}-${timestamp}`;
    const now = new Date(timestamp).toISOString();
    const record = {
      id,
      projectId,
      folderKey,
      originalFileName,
      storedName,
      extension,
      mimeType,
      sizeBytes: buffer.length,
      createdAt: now,
      updatedAt: now,
    };

    await this.redis.multi()
      .set(this.metadataKey(projectId, folderKey, storedName), JSON.stringify(record))
      .set(this.binaryKey(projectId, folderKey, storedName), Buffer.from(buffer).toString('base64'))
      .sAdd(this.folderIndexKey(projectId, folderKey), storedName)
      .exec();

    return buildResource({ projectId, folderKey, record });
  }

  async getFile(projectId, folderKey, fileName) {
    const [meta, dataBase64] = await Promise.all([
      this.redis.get(this.metadataKey(projectId, folderKey, fileName)),
      this.redis.get(this.binaryKey(projectId, folderKey, fileName)),
    ]);
    if (!meta || !dataBase64) return null;
    const record = JSON.parse(meta);
    return {
      ...record,
      buffer: Buffer.from(dataBase64, 'base64'),
    };
  }

  async updateFile({ projectId, folderKey, fileName, originalFileName, buffer, extension, mimeType }) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      originalFileName: originalFileName || existing.originalFileName,
      extension: extension || existing.extension,
      mimeType: mimeType || existing.mimeType,
      sizeBytes: buffer.length,
      updatedAt: new Date().toISOString(),
    };
    delete record.buffer;

    await this.redis.multi()
      .set(this.metadataKey(projectId, folderKey, fileName), JSON.stringify(record))
      .set(this.binaryKey(projectId, folderKey, fileName), Buffer.from(buffer).toString('base64'))
      .sAdd(this.folderIndexKey(projectId, folderKey), fileName)
      .exec();

    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }

  async deleteFile(projectId, folderKey, fileName) {
    const removed = await this.redis.multi()
      .del(this.metadataKey(projectId, folderKey, fileName))
      .del(this.binaryKey(projectId, folderKey, fileName))
      .sRem(this.folderIndexKey(projectId, folderKey), fileName)
      .exec();
    return Array.isArray(removed) && removed.some((entry) => Number(entry?.[1] || 0) > 0);
  }

  async listFiles(projectId, validFolderKeys = []) {
    const grouped = {};
    for (const folderKey of validFolderKeys) {
      const names = await this.redis.sMembers(this.folderIndexKey(projectId, folderKey));
      const sorted = names.slice().sort((a, b) => a.localeCompare(b));
      const items = [];
      for (const fileName of sorted) {
        const meta = await this.redis.get(this.metadataKey(projectId, folderKey, fileName));
        if (!meta) continue;
        const parsed = JSON.parse(meta);
        items.push({
          folderKey,
          fileName,
          title: parsed.originalFileName,
          sizeBytes: parsed.sizeBytes,
          uploadedAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
        });
      }
      grouped[folderKey] = items;
    }
    return { files: Object.values(grouped).flat(), filesByFolder: grouped };
  }
}

export async function createEvidenceDeskFileStore({
  redisUrl = process.env.REDIS_URL,
  redisClient = null,
  createRedisClient = createClient,
  connectTimeoutMs = Number(process.env.EVIDENCE_DESK_REDIS_CONNECT_TIMEOUT_MS || 3000),
  disconnectTimeoutMs = Number(process.env.EVIDENCE_DESK_REDIS_DISCONNECT_TIMEOUT_MS || 250),
} = {}) {
  if (redisClient) {
    return { store: new RedisEvidenceDeskFileStore(redisClient), redisClient, type: 'redis-shared' };
  }
  if (!redisUrl) {
    return { store: new InMemoryEvidenceDeskFileStore(), redisClient: null, type: 'memory' };
  }

  let client = null;
  try {
    client = createRedisClient({ url: redisUrl });
    client.on?.('error', () => {});
    if (Number.isFinite(connectTimeoutMs) && connectTimeoutMs > 0) {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Redis connect timed out after ${connectTimeoutMs}ms`)), connectTimeoutMs);
        }),
      ]);
    } else {
      await client.connect();
    }
    return { store: new RedisEvidenceDeskFileStore(client), redisClient: client, type: 'redis' };
  } catch {
    const safeDisconnect = async () => {
      if (!client) return;
      if (typeof client.disconnect === 'function') {
        client.disconnect();
        return;
      }
      if (typeof client.quit === 'function') {
        await client.quit();
      }
    };

    try {
      if (Number.isFinite(disconnectTimeoutMs) && disconnectTimeoutMs > 0) {
        await Promise.race([
          safeDisconnect(),
          new Promise((resolve) => {
            setTimeout(resolve, disconnectTimeoutMs);
          }),
        ]);
      } else {
        await safeDisconnect();
      }
    } catch {}

    return { store: new InMemoryEvidenceDeskFileStore(), redisClient: null, type: 'memory' };
  }
}
