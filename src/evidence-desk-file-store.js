import { createClient } from 'redis';
import { createHash, createHmac } from 'node:crypto';

function sanitizeSegment(value = '') {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildImageThumbnailPath(projectId, folderKey, storedName) {
  return `/api/project-files/image-thumbnail?projectId=${encodeURIComponent(projectId)}&folderKey=${encodeURIComponent(folderKey)}&fileName=${encodeURIComponent(storedName)}`;
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
        rosNumber: record.rosNumber || null,
        pointNumber: record.pointNumber || null,
        thumbnailUrl: record.thumbnailBase64 ? buildImageThumbnailPath(projectId, folderKey, record.storedName) : null,
      },
    },
  };
}

function normalizeRedisStorageError(error, fallbackMessage) {
  const message = String(error?.message || '');
  if (/OOM command not allowed when used memory > 'maxmemory'\./i.test(message)) {
    const normalized = new Error(fallbackMessage || 'Upload storage is full. Please retry after cleanup or increase Redis maxmemory.');
    normalized.status = 507;
    normalized.cause = error;
    return normalized;
  }
  return error;
}

function sanitizeStorageSegment(value = '') {
  return encodeURIComponent(String(value || '').trim());
}

function parseEnvUrl(urlRaw = '') {
  const value = String(urlRaw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return {
      endpoint: `${parsed.protocol}//${parsed.host}`,
      accessKeyId: decodeURIComponent(parsed.username || ''),
      secretAccessKey: decodeURIComponent(parsed.password || ''),
      region: parsed.searchParams.get('region') || '',
      bucket: parsed.searchParams.get('bucket') || '',
      forcePathStyle: ['1', 'true', 'yes'].includes(String(parsed.searchParams.get('forcePathStyle') || '').toLowerCase()),
    };
  } catch {
    return null;
  }
}

function resolveS3ConfigFromEnv(env = process.env) {
  const stackheroMinioHost = String(env.STACKHERO_MINIO_HOST || '').trim();
  const stackheroMinioEndpoint = stackheroMinioHost
    ? `${stackheroMinioHost.startsWith('http://') || stackheroMinioHost.startsWith('https://') ? '' : 'https://'}${stackheroMinioHost}`
    : '';
  const stackheroUrl = env.EVIDENCE_DESK_S3_URL
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_URL
    || env.AH_S3_OBJECT_STORAGE_STACKHERO
    || stackheroMinioEndpoint
    || env.S3_URL;
  const fromUrl = parseEnvUrl(stackheroUrl) || {};

  const bucket = String(
    env.EVIDENCE_DESK_S3_BUCKET
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_BUCKET
    || env.STACKHERO_MINIO_BUCKET
    || fromUrl.bucket
    || (stackheroUrl ? 'survey-foundry' : '')
    || '',
  ).trim();
  const endpoint = String(
    env.EVIDENCE_DESK_S3_ENDPOINT
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_ENDPOINT
    || env.AWS_ENDPOINT_URL_S3
    || env.AWS_ENDPOINT_URL
    || stackheroMinioEndpoint
    || fromUrl.endpoint
    || '',
  ).trim();
  const accessKeyId = String(
    env.EVIDENCE_DESK_S3_ACCESS_KEY_ID
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_ACCESS_KEY_ID
    || env.STACKHERO_MINIO_ROOT_ACCESS_KEY
    || env.STACKHERO_MINIO_ACCESS_KEY
    || env.AWS_ACCESS_KEY_ID
    || fromUrl.accessKeyId
    || '',
  ).trim();
  const secretAccessKey = String(
    env.EVIDENCE_DESK_S3_SECRET_ACCESS_KEY
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_SECRET_ACCESS_KEY
    || env.STACKHERO_MINIO_ROOT_SECRET_KEY
    || env.STACKHERO_MINIO_SECRET_KEY
    || env.AWS_SECRET_ACCESS_KEY
    || fromUrl.secretAccessKey
    || '',
  ).trim();
  const region = String(
    env.EVIDENCE_DESK_S3_REGION
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_REGION
    || env.STACKHERO_MINIO_REGION
    || env.AWS_REGION
    || env.AWS_DEFAULT_REGION
    || fromUrl.region
    || 'us-east-1',
  ).trim();
  const prefix = String(env.EVIDENCE_DESK_S3_PREFIX || 'surveycad/evidence-desk').trim().replace(/^\/+|\/+$/g, '');
  const forcePathStyle = ['1', 'true', 'yes'].includes(String(
    env.EVIDENCE_DESK_S3_FORCE_PATH_STYLE
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_FORCE_PATH_STYLE
    || env.STACKHERO_MINIO_FORCE_PATH_STYLE
    || (stackheroMinioEndpoint ? 'true' : '')
    || (fromUrl.forcePathStyle ? 'true' : ''),
  ).toLowerCase());
  const sessionToken = String(
    env.EVIDENCE_DESK_S3_SESSION_TOKEN
    || env.AH_S3_OBJECT_STORAGE_STACKHERO_SESSION_TOKEN
    || env.AWS_SESSION_TOKEN
    || '',
  ).trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, endpoint, accessKeyId, secretAccessKey, region, prefix, forcePathStyle, sessionToken };
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function encodeRfc3986(value = '') {
  return encodeURIComponent(String(value || '')).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQuery(query = {}) {
  const pairs = [];
  for (const [key, rawValue] of Object.entries(query || {})) {
    if (rawValue === undefined || rawValue === null) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) pairs.push([encodeRfc3986(key), encodeRfc3986(value)]);
    } else {
      pairs.push([encodeRfc3986(key), encodeRfc3986(rawValue)]);
    }
  }
  pairs.sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function parseXmlTagValues(xml = '', tagName = '') {
  const values = [];
  const regex = new RegExp(`<${tagName}>([\s\S]*?)<\/${tagName}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"));
  }
  return values;
}

function createS3FetchClient({ endpoint, bucket, region = 'us-east-1', accessKeyId, secretAccessKey, sessionToken = '', forcePathStyle = true, fetchImpl = fetch }) {
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Incomplete S3 config: endpoint, bucket, access key, and secret are required.');
  }
  const endpointUrl = new URL(endpoint);

  async function signedRequest(method, key, { body = null, contentType = '', query = {} } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const objectPath = key ? `/${key.split('/').map(encodeRfc3986).join('/')}` : '/';
    const basePath = forcePathStyle ? `/${encodeRfc3986(bucket)}${objectPath}` : objectPath;
    const canonicalUri = basePath.replace(/%2F/g, '/');
    const requestQuery = { ...query };
    const canonicalQuery = buildCanonicalQuery(requestQuery);

    const host = forcePathStyle ? endpointUrl.host : `${encodeRfc3986(bucket)}.${endpointUrl.host}`;
    const payload = body == null ? '' : (Buffer.isBuffer(body) ? body : Buffer.from(body));
    const payloadHash = sha256Hex(payload);

    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (sessionToken) headers['x-amz-security-token'] = sessionToken;
    if (contentType) headers['content-type'] = contentType;

    const canonicalHeaders = Object.entries(headers)
      .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')])
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v}\n`)
      .join('');
    const signedHeaders = Object.keys(headers)
      .map((keyName) => keyName.toLowerCase())
      .sort()
      .join(';');

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const requestHeaders = {
      Authorization: authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
    };

    const targetUrl = new URL(endpointUrl.toString());
    targetUrl.hostname = forcePathStyle ? endpointUrl.hostname : `${bucket}.${endpointUrl.hostname}`;
    targetUrl.port = endpointUrl.port;
    targetUrl.pathname = canonicalUri;
    targetUrl.search = canonicalQuery;

    const response = await fetchImpl(targetUrl.toString(), {
      method,
      headers: requestHeaders,
      body: payload.length ? payload : undefined,
    });
    const responseBuffer = Buffer.from(await response.arrayBuffer());
    return { status: response.status, body: responseBuffer };
  }

  return {
    async getObject(key) {
      const response = await signedRequest('GET', key);
      if (response.status === 404) return null;
      if (response.status >= 400) throw new Error(`S3 GET failed (${response.status}) for key ${key}`);
      return response.body;
    },
    async putObject(key, body, { contentType = '' } = {}) {
      const response = await signedRequest('PUT', key, { body, contentType });
      if (response.status >= 400) throw new Error(`S3 PUT failed (${response.status}) for key ${key}`);
    },
    async deleteObject(key) {
      const response = await signedRequest('DELETE', key);
      if (response.status >= 400 && response.status !== 404) throw new Error(`S3 DELETE failed (${response.status}) for key ${key}`);
    },
    async listObjects(prefix = '') {
      const response = await signedRequest('GET', '', { query: { 'list-type': '2', prefix } });
      if (response.status >= 400) throw new Error(`S3 LIST failed (${response.status}) for prefix ${prefix}`);
      const xml = response.body.toString('utf8');
      return parseXmlTagValues(xml, 'Key');
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

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
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
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      createdAt: now,
      updatedAt: now,
      dataBase64: Buffer.from(buffer).toString('base64'),
      thumbnailBase64: thumbnailBuffer ? Buffer.from(thumbnailBuffer).toString('base64') : null,
      thumbnailMimeType: thumbnailMimeType || null,
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
      thumbnailBuffer: record.thumbnailBase64 ? Buffer.from(record.thumbnailBase64, 'base64') : null,
    };
  }

  async updateFile({ projectId, folderKey, fileName, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    const record = {
      ...existing,
      originalFileName: originalFileName || existing.originalFileName,
      extension: extension || existing.extension,
      mimeType: mimeType || existing.mimeType,
      sizeBytes: buffer.length,
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      updatedAt,
      dataBase64: Buffer.from(buffer).toString('base64'),
      thumbnailBase64: thumbnailBuffer ? Buffer.from(thumbnailBuffer).toString('base64') : null,
      thumbnailMimeType: thumbnailMimeType || null,
    };
    delete record.thumbnailBuffer;
    this.records.set(this.key(projectId, folderKey, fileName), record);
    return buildResource({ projectId, folderKey, record });
  }

  async deleteFile(projectId, folderKey, fileName) {
    return this.records.delete(this.key(projectId, folderKey, fileName));
  }

  async updateFileMetadata(projectId, folderKey, fileName, { rosNumber, pointNumber } = {}) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };
    if (rosNumber !== undefined) record.rosNumber = String(rosNumber || '').trim() || null;
    if (pointNumber !== undefined) record.pointNumber = String(pointNumber || '').trim() || null;
    delete record.buffer;
    delete record.thumbnailBuffer;
    this.records.set(this.key(projectId, folderKey, fileName), record);
    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }


  async moveFile(projectId, sourceFolderKey, fileName, targetFolderKey) {
    if (!projectId || !sourceFolderKey || !fileName || !targetFolderKey) return null;
    if (sourceFolderKey === targetFolderKey) return this.getFile(projectId, sourceFolderKey, fileName).then((record) => {
      if (!record) return null;
      return buildResource({ projectId, folderKey: sourceFolderKey, record: { ...record, storedName: fileName } });
    });

    const sourceKey = this.key(projectId, sourceFolderKey, fileName);
    const record = this.records.get(sourceKey);
    if (!record) return null;

    const updatedRecord = {
      ...record,
      folderKey: targetFolderKey,
      updatedAt: new Date().toISOString(),
    };
    this.records.delete(sourceKey);
    this.records.set(this.key(projectId, targetFolderKey, fileName), updatedRecord);
    return buildResource({ projectId, folderKey: targetFolderKey, record: { ...updatedRecord, storedName: fileName } });
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
        rosNumber: record.rosNumber || null,
        pointNumber: record.pointNumber || null,
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

  thumbnailBinaryKey(projectId, folderKey, fileName) {
    return `${this.prefix}:thumb:${projectId}:${folderKey}:${fileName}`;
  }

  folderIndexKey(projectId, folderKey) {
    return `${this.prefix}:index:${projectId}:${folderKey}`;
  }

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
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
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      createdAt: now,
      updatedAt: now,
      thumbnailMimeType: thumbnailMimeType || null,
    };

    const write = this.redis.multi()
      .set(this.metadataKey(projectId, folderKey, storedName), JSON.stringify(record))
      .set(this.binaryKey(projectId, folderKey, storedName), Buffer.from(buffer).toString('base64'))
      .sAdd(this.folderIndexKey(projectId, folderKey), storedName);
    if (thumbnailBuffer) write.set(this.thumbnailBinaryKey(projectId, folderKey, storedName), Buffer.from(thumbnailBuffer).toString('base64'));
    try {
      await write.exec();
    } catch (error) {
      throw normalizeRedisStorageError(error, 'Upload storage is full. Could not store project file.');
    }

    return buildResource({ projectId, folderKey, record });
  }

  async getFile(projectId, folderKey, fileName) {
    const [meta, dataBase64, thumbnailBase64] = await Promise.all([
      this.redis.get(this.metadataKey(projectId, folderKey, fileName)),
      this.redis.get(this.binaryKey(projectId, folderKey, fileName)),
      this.redis.get(this.thumbnailBinaryKey(projectId, folderKey, fileName)),
    ]);
    if (!meta || !dataBase64) return null;
    const record = JSON.parse(meta);
    return {
      ...record,
      buffer: Buffer.from(dataBase64, 'base64'),
      thumbnailBuffer: thumbnailBase64 ? Buffer.from(thumbnailBase64, 'base64') : null,
      thumbnailBase64: thumbnailBase64 || null,
    };
  }

  async updateFile({ projectId, folderKey, fileName, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      originalFileName: originalFileName || existing.originalFileName,
      extension: extension || existing.extension,
      mimeType: mimeType || existing.mimeType,
      sizeBytes: buffer.length,
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      updatedAt: new Date().toISOString(),
      thumbnailMimeType: thumbnailMimeType || null,
    };
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;

    const write = this.redis.multi()
      .set(this.metadataKey(projectId, folderKey, fileName), JSON.stringify(record))
      .set(this.binaryKey(projectId, folderKey, fileName), Buffer.from(buffer).toString('base64'))
      .sAdd(this.folderIndexKey(projectId, folderKey), fileName);
    if (thumbnailBuffer) {
      write.set(this.thumbnailBinaryKey(projectId, folderKey, fileName), Buffer.from(thumbnailBuffer).toString('base64'));
    } else {
      write.del(this.thumbnailBinaryKey(projectId, folderKey, fileName));
    }
    try {
      await write.exec();
    } catch (error) {
      throw normalizeRedisStorageError(error, 'Upload storage is full. Could not update project file.');
    }

    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }

  async deleteFile(projectId, folderKey, fileName) {
    let removed;
    try {
      removed = await this.redis.multi()
        .del(this.metadataKey(projectId, folderKey, fileName))
        .del(this.binaryKey(projectId, folderKey, fileName))
        .del(this.thumbnailBinaryKey(projectId, folderKey, fileName))
        .sRem(this.folderIndexKey(projectId, folderKey), fileName)
        .exec();
    } catch (error) {
      throw normalizeRedisStorageError(error, 'Upload storage is full. Could not delete project file.');
    }
    return Array.isArray(removed) && removed.some((entry) => Number(entry?.[1] || 0) > 0);
  }

  async updateFileMetadata(projectId, folderKey, fileName, { rosNumber, pointNumber } = {}) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };
    if (rosNumber !== undefined) record.rosNumber = String(rosNumber || '').trim() || null;
    if (pointNumber !== undefined) record.pointNumber = String(pointNumber || '').trim() || null;
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;

    try {
      await this.redis.set(this.metadataKey(projectId, folderKey, fileName), JSON.stringify(record));
    } catch (error) {
      throw normalizeRedisStorageError(error, 'Upload storage is full. Could not update project file metadata.');
    }
    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }


  async moveFile(projectId, sourceFolderKey, fileName, targetFolderKey) {
    if (!projectId || !sourceFolderKey || !fileName || !targetFolderKey) return null;
    if (sourceFolderKey === targetFolderKey) {
      const existing = await this.getFile(projectId, sourceFolderKey, fileName);
      if (!existing) return null;
      return buildResource({ projectId, folderKey: sourceFolderKey, record: { ...existing, storedName: fileName } });
    }

    const existing = await this.getFile(projectId, sourceFolderKey, fileName);
    if (!existing) return null;

    const record = {
      ...existing,
      folderKey: targetFolderKey,
      updatedAt: new Date().toISOString(),
    };
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;

    const write = this.redis.multi()
      .set(this.metadataKey(projectId, targetFolderKey, fileName), JSON.stringify(record))
      .set(this.binaryKey(projectId, targetFolderKey, fileName), Buffer.from(existing.buffer).toString('base64'))
      .sAdd(this.folderIndexKey(projectId, targetFolderKey), fileName)
      .del(this.metadataKey(projectId, sourceFolderKey, fileName))
      .del(this.binaryKey(projectId, sourceFolderKey, fileName))
      .del(this.thumbnailBinaryKey(projectId, sourceFolderKey, fileName))
      .sRem(this.folderIndexKey(projectId, sourceFolderKey), fileName);
    if (existing.thumbnailBuffer) {
      write.set(this.thumbnailBinaryKey(projectId, targetFolderKey, fileName), Buffer.from(existing.thumbnailBuffer).toString('base64'));
    } else {
      write.del(this.thumbnailBinaryKey(projectId, targetFolderKey, fileName));
    }
    try {
      await write.exec();
    } catch (error) {
      throw normalizeRedisStorageError(error, 'Upload storage is full. Could not move project file.');
    }

    return buildResource({ projectId, folderKey: targetFolderKey, record: { ...record, storedName: fileName } });
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
          rosNumber: parsed.rosNumber || null,
          pointNumber: parsed.pointNumber || null,
          uploadedAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
        });
      }
      grouped[folderKey] = items;
    }
    return { files: Object.values(grouped).flat(), filesByFolder: grouped };
  }
}

export class S3EvidenceDeskFileStore {
  constructor(s3Client, { bucket, prefix = 'surveycad/evidence-desk' } = {}) {
    if (!s3Client) throw new Error('S3 client required');
    if (!bucket) throw new Error('S3 bucket required');
    this.s3 = s3Client;
    this.bucket = bucket;
    this.prefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
  }

  buildKey(kind, projectId, folderKey, fileName) {
    return `${this.prefix}/${kind}/${sanitizeStorageSegment(projectId)}/${sanitizeStorageSegment(folderKey)}/${sanitizeStorageSegment(fileName)}`;
  }

  metadataKey(projectId, folderKey, fileName) {
    return `${this.buildKey('meta', projectId, folderKey, fileName)}.json`;
  }

  binaryKey(projectId, folderKey, fileName) {
    return this.buildKey('bin', projectId, folderKey, fileName);
  }

  thumbnailBinaryKey(projectId, folderKey, fileName) {
    return this.buildKey('thumb', projectId, folderKey, fileName);
  }

  pdfThumbnailCacheKey(cacheKey) {
    return `${this.prefix}/pdf-thumb/${sanitizeStorageSegment(cacheKey)}.png`;
  }

  async readJson(key) {
    try {
      const raw = await this.s3.getObject(key);
      return JSON.parse(raw.toString('utf8'));
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async getFile(projectId, folderKey, fileName) {
    const record = await this.readJson(this.metadataKey(projectId, folderKey, fileName));
    if (!record) return null;
    let data;
    try {
      data = await this.s3.getObject(this.binaryKey(projectId, folderKey, fileName));
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
    let thumbnailBuffer = null;
    try {
      thumbnailBuffer = await this.s3.getObject(this.thumbnailBinaryKey(projectId, folderKey, fileName));
    } catch (error) {
      if (!(error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404)) throw error;
    }
    return {
      ...record,
      buffer: data,
      thumbnailBuffer,
      thumbnailBase64: thumbnailBuffer ? thumbnailBuffer.toString('base64') : null,
    };
  }

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
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
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      createdAt: now,
      updatedAt: now,
      thumbnailMimeType: thumbnailMimeType || null,
    };
    await this.s3.putObject(this.metadataKey(projectId, folderKey, storedName), JSON.stringify(record), { contentType: 'application/json; charset=utf-8' });
    await this.s3.putObject(this.binaryKey(projectId, folderKey, storedName), buffer, { contentType: mimeType || 'application/octet-stream' });
    if (thumbnailBuffer) {
      await this.s3.putObject(this.thumbnailBinaryKey(projectId, folderKey, storedName), thumbnailBuffer, { contentType: thumbnailMimeType || 'image/png' });
    }
    return buildResource({ projectId, folderKey, record });
  }

  async updateFile({ projectId, folderKey, fileName, originalFileName, buffer, extension, mimeType, rosNumber = '', pointNumber = '', thumbnailBuffer = null, thumbnailMimeType = null }) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      originalFileName: originalFileName || existing.originalFileName,
      extension: extension || existing.extension,
      mimeType: mimeType || existing.mimeType,
      sizeBytes: buffer.length,
      rosNumber: String(rosNumber || '').trim() || null,
      pointNumber: String(pointNumber || '').trim() || null,
      updatedAt: new Date().toISOString(),
      thumbnailMimeType: thumbnailMimeType || null,
    };
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;
    await this.s3.putObject(this.metadataKey(projectId, folderKey, fileName), JSON.stringify(record), { contentType: 'application/json; charset=utf-8' });
    await this.s3.putObject(this.binaryKey(projectId, folderKey, fileName), buffer, { contentType: mimeType || 'application/octet-stream' });
    if (thumbnailBuffer) {
      await this.s3.putObject(this.thumbnailBinaryKey(projectId, folderKey, fileName), thumbnailBuffer, { contentType: thumbnailMimeType || 'image/png' });
    } else {
      await this.s3.deleteObject(this.thumbnailBinaryKey(projectId, folderKey, fileName));
    }
    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }

  async deleteFile(projectId, folderKey, fileName) {
    await Promise.all([
      this.s3.deleteObject(this.metadataKey(projectId, folderKey, fileName)),
      this.s3.deleteObject(this.binaryKey(projectId, folderKey, fileName)),
      this.s3.deleteObject(this.thumbnailBinaryKey(projectId, folderKey, fileName)),
    ]);
    return true;
  }

  async updateFileMetadata(projectId, folderKey, fileName, { rosNumber, pointNumber } = {}) {
    const existing = await this.getFile(projectId, folderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };
    if (rosNumber !== undefined) record.rosNumber = String(rosNumber || '').trim() || null;
    if (pointNumber !== undefined) record.pointNumber = String(pointNumber || '').trim() || null;
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;
    await this.s3.putObject(this.metadataKey(projectId, folderKey, fileName), JSON.stringify(record), { contentType: 'application/json; charset=utf-8' });
    return buildResource({ projectId, folderKey, record: { ...record, storedName: fileName } });
  }

  async moveFile(projectId, sourceFolderKey, fileName, targetFolderKey) {
    if (!projectId || !sourceFolderKey || !fileName || !targetFolderKey) return null;
    if (sourceFolderKey === targetFolderKey) {
      const existing = await this.getFile(projectId, sourceFolderKey, fileName);
      if (!existing) return null;
      return buildResource({ projectId, folderKey: sourceFolderKey, record: { ...existing, storedName: fileName } });
    }
    const existing = await this.getFile(projectId, sourceFolderKey, fileName);
    if (!existing) return null;
    const record = {
      ...existing,
      folderKey: targetFolderKey,
      updatedAt: new Date().toISOString(),
    };
    delete record.buffer;
    delete record.thumbnailBuffer;
    delete record.thumbnailBase64;
    await this.s3.putObject(this.metadataKey(projectId, targetFolderKey, fileName), JSON.stringify(record), { contentType: 'application/json; charset=utf-8' });
    await this.s3.putObject(this.binaryKey(projectId, targetFolderKey, fileName), existing.buffer, { contentType: existing.mimeType || 'application/octet-stream' });
    if (existing.thumbnailBuffer) {
      await this.s3.putObject(this.thumbnailBinaryKey(projectId, targetFolderKey, fileName), existing.thumbnailBuffer, { contentType: existing.thumbnailMimeType || 'image/png' });
    }
    await this.deleteFile(projectId, sourceFolderKey, fileName);
    return buildResource({ projectId, folderKey: targetFolderKey, record: { ...record, storedName: fileName } });
  }

  async listFiles(projectId, validFolderKeys = []) {
    const grouped = {};
    for (const folderKey of validFolderKeys) grouped[folderKey] = [];
    const prefix = `${this.prefix}/meta/${sanitizeStorageSegment(projectId)}/`;
    let continuationToken;
    do {
      const keys = await this.s3.listObjects(prefix);
      for (const key of keys) {
        if (!key.endsWith('.json')) continue;
        const record = await this.readJson(key);
        if (!record) continue;
        if (!grouped[record.folderKey]) grouped[record.folderKey] = [];
        grouped[record.folderKey].push({
          folderKey: record.folderKey,
          fileName: record.storedName,
          title: record.originalFileName,
          sizeBytes: record.sizeBytes,
          rosNumber: record.rosNumber || null,
          pointNumber: record.pointNumber || null,
          uploadedAt: record.createdAt,
          updatedAt: record.updatedAt,
        });
      }
      continuationToken = undefined;
    } while (continuationToken);
    for (const values of Object.values(grouped)) values.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return { files: Object.values(grouped).flat(), filesByFolder: grouped };
  }

  async readCachedPdfThumbnail(cacheKey) {
    try {
      return await this.s3.getObject(this.pdfThumbnailCacheKey(cacheKey));
    } catch (error) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async writeCachedPdfThumbnail(cacheKey, pngBuffer) {
    await this.s3.putObject(this.pdfThumbnailCacheKey(cacheKey), pngBuffer, { contentType: 'image/png' });
  }
}

export async function createEvidenceDeskFileStore({
  redisUrl = process.env.REDIS_URL,
  redisClient = null,
  createRedisClient = createClient,
  connectTimeoutMs = Number(process.env.EVIDENCE_DESK_REDIS_CONNECT_TIMEOUT_MS || 3000),
  disconnectTimeoutMs = Number(process.env.EVIDENCE_DESK_REDIS_DISCONNECT_TIMEOUT_MS || 250),
  s3Config = resolveS3ConfigFromEnv(),
  s3Client = null,
} = {}) {
  if (s3Config || s3Client) {
    const resolvedConfig = s3Config || {};
    const client = s3Client || createS3FetchClient({
      endpoint: resolvedConfig.endpoint,
      bucket: resolvedConfig.bucket,
      region: resolvedConfig.region || 'us-east-1',
      accessKeyId: resolvedConfig.accessKeyId,
      secretAccessKey: resolvedConfig.secretAccessKey,
      sessionToken: resolvedConfig.sessionToken || '',
      forcePathStyle: resolvedConfig.forcePathStyle !== false,
    });
    return {
      store: new S3EvidenceDeskFileStore(client, { bucket: resolvedConfig.bucket, prefix: resolvedConfig.prefix }),
      redisClient: null,
      type: 's3',
    };
  }

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
