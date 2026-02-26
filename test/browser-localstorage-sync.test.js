import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDifferentialOperations,
  checksumSnapshot,
  coalesceQueuedOperations,
  mergeQueuedDifferentials,
  nextReconnectDelay,
  shouldHydrateFromServerOnWelcome,
  shouldApplyWelcomeSnapshotImmediately,
  shouldRebaseQueueFromWelcomeSnapshotImmediately,
  shouldApplyStartupServerState,
  shouldRebaseQueueFromServerOnWelcome,
  shouldSyncLocalStorageKey,
  shouldReplayInFlightOnSocketClose,
  shouldEnterDormantReconnect,
  shouldRunHttpFallbackSync,
  buildSocketEndpointCandidates,
  buildApiEndpointCandidates,
  shrinkQueuedDifferentialsForStorage,
  mergeObjectStorageValues,
  resolveIncomingStorageValue,
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




test('new browser with empty localStorage hydrates from server when welcome checksum differs', () => {
  const emptyLocalChecksum = checksumSnapshot({});
  const serverChecksum = computeSnapshotChecksum({
    surveyfoundryProjectFile: '{"id":"p-1"}',
  });

  assert.notEqual(emptyLocalChecksum, serverChecksum);
  assert.equal(shouldHydrateFromServerOnWelcome({
    localChecksum: emptyLocalChecksum,
    serverChecksum,
    queueLength: 0,
    hasPendingBatch: false,
  }), true);
});


test('shouldApplyStartupServerState hydrates startup snapshot when server is newer or local storage is blank', () => {
  assert.equal(shouldApplyStartupServerState({
    localVersion: 2,
    serverVersion: 3,
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
    localEntryCount: 4,
    serverEntryCount: 5,
  }), true);

  assert.equal(shouldApplyStartupServerState({
    localVersion: 7,
    serverVersion: 7,
    localChecksum: checksumSnapshot({}),
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
    localEntryCount: 0,
    serverEntryCount: 3,
  }), true);

  assert.equal(shouldApplyStartupServerState({
    localVersion: 7,
    serverVersion: 7,
    localChecksum: 'same',
    serverChecksum: 'same',
    queueLength: 1,
    hasPendingBatch: false,
    localEntryCount: 4,
    serverEntryCount: 5,
  }), false);

  assert.equal(shouldApplyStartupServerState({
    localVersion: 7,
    serverVersion: 7,
    localChecksum: 'same',
    serverChecksum: 'same',
    queueLength: 0,
    hasPendingBatch: false,
    localEntryCount: 4,
    serverEntryCount: 0,
  }), false);
});

test('shouldRebaseQueueFromServerOnWelcome enables server-hydrate+rebase when queued local changes exist and checksums diverge', () => {
  assert.equal(shouldRebaseQueueFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 1,
    hasPendingBatch: false,
  }), true);

  assert.equal(shouldRebaseQueueFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: true,
  }), true);

  assert.equal(shouldRebaseQueueFromServerOnWelcome({
    localChecksum: 'fnv1a-same',
    serverChecksum: 'fnv1a-same',
    queueLength: 1,
    hasPendingBatch: false,
  }), false);

  assert.equal(shouldRebaseQueueFromServerOnWelcome({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
  }), false);
});


test('shouldEnterDormantReconnect enables cooldown only before first successful connection', () => {
  assert.equal(shouldEnterDormantReconnect({
    hasEverConnected: false,
    consecutiveFailures: 3,
  }), true);

  assert.equal(shouldEnterDormantReconnect({
    hasEverConnected: false,
    consecutiveFailures: 2,
  }), false);

  assert.equal(shouldEnterDormantReconnect({
    hasEverConnected: true,
    consecutiveFailures: 10,
  }), false);
});


test('buildSocketEndpointCandidates includes root and base-path websocket URLs', () => {
  assert.deepEqual(buildSocketEndpointCandidates({
    protocol: 'https:',
    host: 'example.com',
    pathname: '/record-of-survey/index.html',
  }), [
    'wss://example.com/ws/localstorage-sync',
    'wss://example.com/record-of-survey/ws/localstorage-sync',
  ]);

  assert.deepEqual(buildSocketEndpointCandidates({
    protocol: 'http:',
    host: 'localhost:3000',
    pathname: '/index.html',
  }), [
    'ws://localhost:3000/ws/localstorage-sync',
  ]);
});

test('buildApiEndpointCandidates includes root and base-path API URLs', () => {
  assert.deepEqual(buildApiEndpointCandidates({
    origin: 'https://example.com',
    pathname: '/record-of-survey/index.html',
  }), [
    'https://example.com/api/localstorage-sync',
    'https://example.com/record-of-survey/api/localstorage-sync',
  ]);

  assert.deepEqual(buildApiEndpointCandidates({
    origin: 'http://localhost:3000',
    pathname: '/index.html',
  }), [
    'http://localhost:3000/api/localstorage-sync',
  ]);
});


test('shrinkQueuedDifferentialsForStorage compacts and halves queued operations to relieve storage pressure', () => {
  const queue = [{
    requestId: 'sync-1',
    baseChecksum: 'fnv1a-prev',
    operations: [
      { type: 'set', key: 'a', value: '1' },
      { type: 'set', key: 'b', value: '2' },
      { type: 'set', key: 'c', value: '3' },
      { type: 'set', key: 'd', value: '4' },
    ],
  }];

  const reduced = shrinkQueuedDifferentialsForStorage(queue);

  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].requestId, 'sync-1');
  assert.equal(reduced[0].baseChecksum, 'fnv1a-prev');
  assert.deepEqual(reduced[0].operations, [
    { type: 'set', key: 'c', value: '3' },
    { type: 'set', key: 'd', value: '4' },
  ]);
});

test('shrinkQueuedDifferentialsForStorage returns empty queue for invalid input', () => {
  assert.deepEqual(shrinkQueuedDifferentialsForStorage(null), []);
  assert.deepEqual(shrinkQueuedDifferentialsForStorage([]), []);
});

test('shouldRunHttpFallbackSync runs only while online and websocket is not open', () => {
  assert.equal(shouldRunHttpFallbackSync({ socketReadyState: 3, online: true }), true);
  assert.equal(shouldRunHttpFallbackSync({ socketReadyState: 1, online: true }), false);
  assert.equal(shouldRunHttpFallbackSync({ socketReadyState: 3, online: false }), false);
});


test('shouldReplayInFlightOnSocketClose only resets in-flight request when queue head matches', () => {
  assert.equal(shouldReplayInFlightOnSocketClose({
    inFlightRequestId: 'sync-a',
    queueHeadRequestId: 'sync-a',
  }), true);

  assert.equal(shouldReplayInFlightOnSocketClose({
    inFlightRequestId: 'sync-a',
    queueHeadRequestId: 'sync-b',
  }), false);

  assert.equal(shouldReplayInFlightOnSocketClose({
    inFlightRequestId: '',
    queueHeadRequestId: 'sync-a',
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


test('shouldSyncLocalStorageKey excludes internal metadata, local-only active project keys, and server-only ROS unlisted keys', () => {
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLocalStoragePendingDiffs'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLocalStorageSyncMeta'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryActiveProjectId'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryActiveProjectId:crew-123'), false);
  assert.equal(shouldSyncLocalStorageKey('project:ros:project-1771091842263-k8jaf:unlisted-42'), false);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryProjectFile:my-project'), true);
  assert.equal(shouldSyncLocalStorageKey('surveyfoundryLineSmithDrawing:abc'), true);
});

test('buildDifferentialOperations ignores server-only ROS unlisted keys during queue rebases', () => {
  const operations = buildDifferentialOperations(
    {
      'project:ros:project-1771091842263-k8jaf:unlisted-1': 'server-only',
      surveyfoundryProjectFile: '{"id":"p-1"}',
    },
    {
      surveyfoundryProjectFile: '{"id":"p-2"}',
      'project:ros:project-1771091842263-k8jaf:unlisted-9': 'local-temp',
    },
  );

  assert.deepEqual(operations, [
    { type: 'set', key: 'surveyfoundryProjectFile', value: '{"id":"p-2"}' },
  ]);
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


test('shouldApplyWelcomeSnapshotImmediately applies welcome snapshot only when safe and out-of-sync', () => {
  assert.equal(shouldApplyWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), true);

  assert.equal(shouldApplyWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 1,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), false);

  assert.equal(shouldApplyWelcomeSnapshotImmediately({
    localChecksum: 'same',
    serverChecksum: 'same',
    queueLength: 0,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), false);

  assert.equal(shouldApplyWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
    serverSnapshot: null,
  }), false);
});

test('shouldRebaseQueueFromWelcomeSnapshotImmediately uses welcome snapshot when queued changes exist', () => {
  assert.equal(shouldRebaseQueueFromWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 1,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), true);

  assert.equal(shouldRebaseQueueFromWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 0,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), false);

  assert.equal(shouldRebaseQueueFromWelcomeSnapshotImmediately({
    localChecksum: 'same',
    serverChecksum: 'same',
    queueLength: 1,
    hasPendingBatch: false,
    serverSnapshot: { project: 'A' },
  }), false);

  assert.equal(shouldRebaseQueueFromWelcomeSnapshotImmediately({
    localChecksum: 'fnv1a-local',
    serverChecksum: 'fnv1a-server',
    queueLength: 1,
    hasPendingBatch: false,
    serverSnapshot: null,
  }), false);
});


test('mergeObjectStorageValues preserves local project tombstones while accepting newer remote timestamps', () => {
  const existing = JSON.stringify({
    alpha: '2026-01-01T00:00:00.000Z',
    beta: '2026-01-02T00:00:00.000Z',
  });
  const incoming = JSON.stringify({
    alpha: '2025-12-30T00:00:00.000Z',
    gamma: '2026-01-03T00:00:00.000Z',
  });

  const merged = JSON.parse(mergeObjectStorageValues(existing, incoming));

  assert.deepEqual(merged, {
    alpha: '2026-01-01T00:00:00.000Z',
    beta: '2026-01-02T00:00:00.000Z',
    gamma: '2026-01-03T00:00:00.000Z',
  });
});

test('resolveIncomingStorageValue merges surveyfoundryDeletedProjects without clobbering local tombstones', () => {
  const localTombstones = JSON.stringify({
    projectA: '2026-01-05T12:30:00.000Z',
  });
  const remoteTombstones = JSON.stringify({
    projectA: '2026-01-01T00:00:00.000Z',
    projectB: '2026-01-06T08:00:00.000Z',
  });

  const resolved = JSON.parse(resolveIncomingStorageValue('surveyfoundryDeletedProjects', remoteTombstones, localTombstones));

  assert.deepEqual(resolved, {
    projectA: '2026-01-05T12:30:00.000Z',
    projectB: '2026-01-06T08:00:00.000Z',
  });
  assert.equal(resolveIncomingStorageValue('surveyfoundryProjects', '[1]', '[2]'), '[1]');
});
