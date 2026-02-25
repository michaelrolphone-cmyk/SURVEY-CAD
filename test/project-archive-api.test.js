import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';
import SurveyCadClient from '../src/survey-api.js';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';

class MemoryEvidenceDeskStore {
  constructor() {
    this.created = [];
  }

  async createFile({ projectId, folderKey, originalFileName, buffer, extension, mimeType }) {
    const resource = {
      folder: folderKey,
      title: originalFileName,
      exportFormat: extension,
      reference: {
        type: 'server-upload',
        metadata: {
          mimeType,
          sizeBytes: buffer.length,
        },
      },
    };
    this.created.push({ projectId, folderKey, originalFileName, buffer: Buffer.from(buffer), extension, mimeType, resource });
    return resource;
  }
}

class FakeRedis {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  async scan(cursor = '0', _matchToken, pattern = '*') {
    const regex = new RegExp(`^${String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const keys = [...this.values.keys()].filter((key) => regex.test(key));
    return [String(cursor), keys];
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }
}

test('POST /api/projects/:projectId/archive stores a minio archive payload with matching localstorage and redis entries', async () => {
  const localStorageSyncStore = new LocalStorageSyncStore({
    version: 10,
    snapshot: {
      surveyfoundryProjects: JSON.stringify([{ id: 'demo-project', name: 'Demo Project' }]),
      'surveyfoundryProjectFile:demo-project': '{"project":{"id":"demo-project"}}',
      'surveyfoundryActiveProjectId:crew-1': 'demo-project',
      unrelated: 'keep-me',
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const fakeRedis = new FakeRedis({
    'survey-cad:localstorage-sync:state': JSON.stringify({ version: 10 }),
    'survey-cad:project:demo-project:meta': '{"status":"active"}',
    'other:key': 'ignored',
  });
  localStorageSyncStore.getRedisClient = () => fakeRedis;

  const evidenceStore = new MemoryEvidenceDeskStore();
  const client = new SurveyCadClient();
  const server = createSurveyServer({ client, localStorageSyncStore, evidenceDeskFileStore: evidenceStore });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/projects/demo-project/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ project: { id: 'demo-project', name: 'Demo Project' } }),
    });
    assert.equal(res.status, 201);
    const payload = await res.json();
    assert.equal(payload.archived, true);
    assert.equal(payload.projectId, 'demo-project');
    assert.equal(payload.snapshotEntryCount, 3);
    assert.ok(payload.redisEntryCount >= 1);

    assert.equal(evidenceStore.created.length, 1);
    const archivedWrite = evidenceStore.created[0];
    assert.equal(archivedWrite.projectId, 'surveyfoundry-archives');
    assert.equal(archivedWrite.folderKey, 'archive');
    assert.match(archivedWrite.originalFileName, /demo-project\.json$/);

    const archivedPayload = JSON.parse(archivedWrite.buffer.toString('utf8'));
    assert.equal(archivedPayload.projectId, 'demo-project');
    assert.equal(archivedPayload.project.name, 'Demo Project');
    assert.equal(archivedPayload.localStorageSnapshotEntries.unrelated, undefined);
    assert.equal(archivedPayload.localStorageSnapshotEntries['surveyfoundryProjectFile:demo-project'], '{"project":{"id":"demo-project"}}');
    assert.ok(Array.isArray(archivedPayload.redisEntries));
    assert.ok(archivedPayload.redisEntries.some((entry) => entry.key === 'survey-cad:project:demo-project:meta'));
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
