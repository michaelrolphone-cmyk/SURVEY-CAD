import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDifferentialOperations,
  checksumSnapshot,
  coalesceQueuedOperations,
  nextReconnectDelay,
  shouldSyncLocalStorageKey,
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

test('browser and server localStorage sync checksum algorithms stay aligned', () => {
  const snapshot = {
    alpha: '1',
    drawing: '{"lines":[1,2,3]}',
    projectId: 'project-123',
  };

  assert.equal(checksumSnapshot(snapshot), computeSnapshotChecksum(snapshot));
});
