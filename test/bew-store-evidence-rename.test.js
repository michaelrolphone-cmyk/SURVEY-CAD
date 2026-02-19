import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError, RedisBewStore } from '../src/bew-store.js';

function createMultiRecorder() {
  const calls = [];
  return {
    calls,
    multi() {
      return {
        set(key, value) {
          calls.push({ op: 'set', key, value });
          return this;
        },
        zadd(key, score, member) {
          calls.push({ op: 'zadd', key, score, member });
          return this;
        },
        async exec() {
          return [];
        },
      };
    },
  };
}

function buildStore({ evidence }) {
  const redis = createMultiRecorder();
  const store = Object.create(RedisBewStore.prototype);
  store.redis = redis;
  store.keyPrefix = 'bew:test';
  store.requireCasefile = async () => ({ id: 'cf-1', meta: { updatedAt: '2024-01-01T00:00:00.000Z' } });
  store.requireEvidence = async () => structuredClone(evidence);
  return { store, redis };
}

test('updateEvidence renames evidence attachment and synchronizes filename-based title/source references', async () => {
  const { store, redis } = buildStore({
    evidence: {
    id: 'ev-1',
    casefileId: 'cf-1',
    type: 'PDF',
    title: 'old-file.pdf',
    source: 'old-file.pdf',
    tags: [],
    notes: '',
    attachment: { name: 'old-file.pdf', mime: 'application/pdf', size: 10, stored: true, url: null },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    },
  });

  const updated = await store.updateEvidence('cf-1', 'ev-1', { attachmentName: 'renamed-file.pdf' });

  assert.equal(updated.attachment?.name, 'renamed-file.pdf');
  assert.equal(updated.title, 'renamed-file.pdf');
  assert.equal(updated.source, 'renamed-file.pdf');

  const wroteAttachmentMeta = redis.calls.some((entry) => entry.op === 'set' && entry.key.endsWith(':evidence:ev-1:attachment:meta'));
  assert.equal(wroteAttachmentMeta, true);
});

test('updateEvidence rejects attachment renames when no attachment exists', async () => {
  const { store } = buildStore({
    evidence: {
    id: 'ev-1',
    casefileId: 'cf-1',
    type: 'PDF',
    title: 'No Attachment',
    source: '',
    tags: [],
    notes: '',
    attachment: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    },
  });

  await assert.rejects(
    store.updateEvidence('cf-1', 'ev-1', { attachmentName: 'renamed-file.pdf' }),
    (err) => err instanceof HttpError && err.status === 400,
  );
});
