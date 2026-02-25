import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageSyncStore, computeSnapshotChecksum } from '../src/localstorage-sync-store.js';

test('local storage sync store accepts newer client snapshots', () => {
  const store = new LocalStorageSyncStore();
  const result = store.syncIncoming({
    version: 10,
    snapshot: { foo: 'bar' },
  });

  assert.equal(result.status, 'server-updated');
  assert.equal(result.state.version, 10);
  assert.equal(result.state.checksum, computeSnapshotChecksum({ foo: 'bar' }));
  assert.deepEqual(result.state.snapshot, { foo: 'bar' });
});

test('local storage sync store returns server snapshot when client is stale', () => {
  const store = new LocalStorageSyncStore({
    version: 20,
    snapshot: { newer: 'state' },
  });

  const result = store.syncIncoming({
    version: 5,
    snapshot: { old: 'state' },
  });

  assert.equal(result.status, 'client-stale');
  assert.equal(result.state.version, 20);
  assert.deepEqual(result.state.snapshot, { newer: 'state' });
});

test('local storage sync store applies differentials when base checksum matches', () => {
  const store = new LocalStorageSyncStore({
    version: 1,
    snapshot: { alpha: '1' },
  });
  const before = store.getState();

  const result = store.applyDifferential({
    baseChecksum: before.checksum,
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.state.snapshot, { alpha: '1', beta: '2' });
  assert.equal(result.state.version, 2);
});

test('local storage sync store rejects differentials when base checksum mismatches', () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: { alpha: '1' } });
  const result = store.applyDifferential({
    baseChecksum: 'bad-checksum',
    operations: [{ type: 'set', key: 'beta', value: '2' }],
  });

  assert.equal(result.status, 'checksum-mismatch');
  assert.deepEqual(result.state.snapshot, { alpha: '1' });
});


test('local storage sync store reports checksum-conflict for same-version divergent snapshots', () => {
  const store = new LocalStorageSyncStore({
    version: 4,
    snapshot: { activeProject: 'Hartman' },
  });

  const result = store.syncIncoming({
    version: 4,
    snapshot: { activeProject: 'Office' },
  });

  assert.equal(result.status, 'checksum-conflict');
  assert.deepEqual(result.state.snapshot, { activeProject: 'Hartman' });
});


test('applyDifferentialBatch applies multiple diffs atomically', () => {
  const store = new LocalStorageSyncStore({
    version: 1,
    snapshot: { alpha: '1' },
  });

  const result = store.applyDifferentialBatch({
    diffs: [
      { operations: [{ type: 'set', key: 'beta', value: '2' }] },
      { operations: [{ type: 'set', key: 'gamma', value: '3' }] },
      { operations: [{ type: 'remove', key: 'alpha' }] },
    ],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.state.snapshot, { beta: '2', gamma: '3' });
  assert.equal(result.state.version, 2);
  assert.equal(result.allOperations.length, 3);
});


test('applyDifferentialBatch returns no-op for empty diffs', () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: { x: '1' } });
  const result = store.applyDifferentialBatch({ diffs: [] });
  assert.equal(result.status, 'no-op');
  assert.equal(result.state.version, 1);
});


test('applyDifferentialBatch skips diffs with no valid operations', () => {
  const store = new LocalStorageSyncStore({ version: 1, snapshot: { x: '1' } });
  const result = store.applyDifferentialBatch({
    diffs: [
      { operations: [] },
      { operations: [{ type: 'invalid' }] },
    ],
  });
  assert.equal(result.status, 'no-op');
});


test('local storage sync store strips ROS unlisted keys from incoming snapshots', () => {
  const store = new LocalStorageSyncStore();
  const result = store.syncIncoming({
    version: 3,
    snapshot: {
      'project:ros:project-1771091842263-k8jaf:unlisted-1': 'server-only',
      surveyfoundryProjectFile: '{"id":"p-1"}',
    },
  });

  assert.equal(result.status, 'server-updated');
  assert.deepEqual(result.state.snapshot, {
    surveyfoundryProjectFile: '{"id":"p-1"}',
  });
});

test('local storage sync store ignores differential operations targeting ROS unlisted keys', () => {
  const store = new LocalStorageSyncStore({
    version: 1,
    snapshot: { surveyfoundryProjectFile: '{"id":"p-1"}' },
  });
  const before = store.getState();

  const result = store.applyDifferential({
    baseChecksum: before.checksum,
    operations: [
      { type: 'set', key: 'project:ros:project-1771091842263-k8jaf:unlisted-1', value: 'ignore-me' },
      { type: 'set', key: 'surveyfoundryProjectFile', value: '{"id":"p-2"}' },
    ],
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.operations, [
    { type: 'set', key: 'surveyfoundryProjectFile', value: '{"id":"p-2"}' },
  ]);
  assert.deepEqual(result.state.snapshot, {
    surveyfoundryProjectFile: '{"id":"p-2"}',
  });
});
