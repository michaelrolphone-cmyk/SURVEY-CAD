import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';

test('local storage sync store accepts newer client snapshots', () => {
  const store = new LocalStorageSyncStore();
  const result = store.syncIncoming({
    version: 10,
    snapshot: { foo: 'bar' },
  });

  assert.equal(result.status, 'server-updated');
  assert.equal(result.state.version, 10);
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
