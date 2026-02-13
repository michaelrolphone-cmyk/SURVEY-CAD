import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDifferentialOperations,
  checksumSnapshot,
  coalesceQueuedOperations,
  mergeQueuedDifferentials,
  nextReconnectDelay,
  shouldHydrateFromServerOnWelcome,
  shouldSyncLocalStorageKey,
  shouldFallbackToHttpSync,
  shouldPushSnapshotOverHttp,
} from '../src/browser-localstorage-sync.js';
import { computeSnapshotChecksum } from '../src/localstorage-sync-store.js';

test('buildDifferentialOperations emits set/remove operations required to transform snapshots', () => {
  const previous = { a: '1', b: '2', removeMe: 'x' };
  const next = { a: '1', b: '3', c: '4' };

  const operations = buildDifferentialOperations(previous, next);

  assert.deepEqual(operations, [
    { type: 'set', key: 'b', value: '3' },
    { type: 'set', key: 'c', value: '4' },
    { type: 'remove', key: 'removeMe' },
  ]);
});

test('buildDifferentialOperations returns no operations for identical snapshots', () => {
  const snapshot = { alpha: '1', beta: '2' };
  const operations = buildDifferentialOperations(snapshot, { ...snapshot });
  assert.deepEqual(operations, []);
});

test('nextReconnectDelay doubles reconnect delay until capped max delay', () => {
  assert.equal(nextReconnectDelay(1500, 60000), 3000);
  assert.equal(nextReconnectDelay(3000, 60000), 6000);
  assert.equal(nextReconnectDelay(45000, 60000), 60000);
  assert.equal(nextReconnectDelay(60000, 60000), 60000);
});

test('nextReconnectDelay normalizes invalid delay inputs to safe defaults', () => {
  assert.equal(nextReconnectDelay(0, 60000), 3000);
  assert.equal(nextReconnectDelay(Number.NaN, 60000), 3000);
  assert.equal(nextReconnectDelay(1500, 1000), 1500);
});

test('shouldHydrateFromServerOnWelcome requests server snapshot only when safe and out-of-sync', () => {
  assert.equal(shouldHydrateFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
  }), true);

  assert.equal(shouldHydrateFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 1,
    hasPendingBatch: false,
  }), false);

  assert.equal(shouldHydrateFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: true,
  }), false);

  assert.equal(shouldHydrateFromServerOnWelcome({
    localChecksum: 'fnv1a-same',
    serverChecksum: 'fnv1a-same',
    queueLength: 0,
    hasPendingBatch: false,
  }), false);
});


test('shouldFallbackToHttpSync only enables polling fallback after repeated pre-connect failures', () => {
  assert.equal(shouldFallbackToHttpSync({ hasEverConnected: false, consecutiveFailures: 3 }), true);
  assert.equal(shouldFallbackToHttpSync({ hasEverConnected: false, consecutiveFailures: 2 }), false);
  assert.equal(shouldFallbackToHttpSync({ hasEverConnected: true, consecutiveFailures: 10 }), false);
});

test('shouldPushSnapshotOverHttp only when there are pending local changes and no open socket', () => {
  assert.equal(shouldPushSnapshotOverHttp({
    queueLength: 1,
    hasPendingBatch: false,
    socketReadyState: 3,
    online: true,
  }), true);

  assert.equal(shouldPushSnapshotOverHttp({
    queueLength: 0,
    hasPendingBatch: true,
    socketReadyState: 3,
    online: true,
  }), true);

  assert.equal(shouldPushSnapshotOverHttp({
    queueLength: 0,
    hasPendingBatch: false,
    socketReadyState: 3,
    online: true,
  }), false);

  assert.equal(shouldPushSnapshotOverHttp({
    queueLength: 2,
    hasPendingBatch: false,
    socketReadyState: 1,
    online: true,
  }), false);

  assert.equal(shouldPushSnapshotOverHttp({
    queueLength: 2,
    hasPendingBatch: false,
    socketReadyState: 3,
    online: false,
  }), false);
});

test('coalesceQueuedOperations keeps only the latest operation per key and preserves clear ordering', () => {
  const operations = coalesceQueuedOperations(
    [{ type: 'set', key: 'a', value: '1' }, { type: 'set', key: 'b', value: '2' }],
    [
      { type: 'set', key: 'a', value: '3' },
      { type: 'remove', key: 'b' },
      { type: 'clear' },
      { type: 'set', key: 'c', value: '9' },
      { type: 'remove', key: 'a' },
    ],
  );

  assert.deepEqual(operations, [
    { type: 'clear' },
    { type: 'set', key: 'c', value: '9' },
    { type: 'remove', key: 'a' },
  ]);
});


test('shouldSyncLocalStorageKey excludes only internal sync metadata keys', () => {
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLocalStoragePendingDiffs'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLocalStorageSyncMeta'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryProjectFile:my-project'), true);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLineSmithDrawing:abc'), true);
});

test('mergeQueuedDifferentials compacts all unsent differentials into one item', () => {
  const merged = mergeQueuedDifferentials([
    {
      requestId: 'sync-a',
      baseChecksum: 'base-1',
      operations: [{ type: 'set', key: 'alpha', value: '1' }],
    },
    {
      requestId: 'sync-b',
      baseChecksum: 'base-2',
      operations: [{ type: 'set', key: 'alpha', value: '2' }, { type: 'set', key: 'beta', value: '3' }],
    },
  ], {
    requestId: 'sync-c',
    baseChecksum: 'base-3',
    operations: [{ type: 'remove', key: 'beta' }, { type: 'set', key: 'gamma', value: '4' }],
  });

  assert.deepEqual(merged, [
    {
      requestId: 'sync-a',
      baseChecksum: 'base-1',
      operations: [
        { type: 'set', key: 'alpha', value: '2' },
        { type: 'remove', key: 'beta' },
        { type: 'set', key: 'gamma', value: '4' },
      ],
    },
  ]);
});

test('mergeQueuedDifferentials preserves in-flight differential and compacts queued tail', () => {
  const merged = mergeQueuedDifferentials([
    {
      requestId: 'sync-flight',
      baseChecksum: 'base-flight',
      operations: [{ type: 'set', key: 'locked', value: '1' }],
    },
    {
      requestId: 'sync-tail-a',
      baseChecksum: 'base-tail',
      operations: [{ type: 'set', key: 'draft', value: '1' }],
    },
    {
      requestId: 'sync-tail-b',
      baseChecksum: 'base-tail-b',
      operations: [{ type: 'set', key: 'draft', value: '2' }],
    },
  ], {
    requestId: 'sync-next',
    operations: [{ type: 'set', key: 'draft', value: '3' }, { type: 'set', key: 'notes', value: 'ok' }],
  }, 'sync-flight');

  assert.deepEqual(merged, [
    {
      requestId: 'sync-flight',
      baseChecksum: 'base-flight',
      operations: [{ type: 'set', key: 'locked', value: '1' }],
    },
    {
      requestId: 'sync-tail-a',
      baseChecksum: 'base-tail',
      operations: [
        { type: 'set', key: 'draft', value: '3' },
        { type: 'set', key: 'notes', value: 'ok' },
      ],
    },
  ]);
});

test('browser and server localStorage sync checksum algorithms stay aligned', () => {
  const snapshot = {
    alpha: '1',
    drawing: '{"lines":[1,2,3]}',
    projectId: 'project-123',
  };

  assert.equal(checksumSnapshot(snapshot), computeSnapshotChecksum(snapshot));
});
