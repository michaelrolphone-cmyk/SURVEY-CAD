const SYNC_DISABLED_ATTR = 'data-localstorage-sync-disabled';
const INTERNAL_KEYS = new Set([
  'surveyfoundryLocalStoragePendingDiffs',
  'surveyfoundryLocalStorageSyncMeta',
]);
const PENDING_DIFFS_KEY = 'surveyfoundryLocalStoragePendingDiffs';
const SYNC_META_KEY = 'surveyfoundryLocalStorageSyncMeta';
const INITIAL_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 60000;
const OPERATION_BATCH_DELAY_MS = 120;
const MAX_INITIAL_CONNECT_FAILURES = 3;
const SNAPSHOT_POLL_INTERVAL_MS = 30000;

function shouldSyncLocalStorageKey(key) {
  const keyString = String(key || '');
  if (!keyString) return false;
  return !INTERNAL_KEYS.has(keyString);
}

function sortedSnapshot(snapshot = {}) {
  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {};
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [String(key), String(value)]));
}

function buildSnapshot() {
  const snapshot = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!shouldSyncLocalStorageKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

function checksumSnapshot(snapshot = {}) {
  const canonical = JSON.stringify(sortedSnapshot(snapshot));
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildDifferentialOperations(previousSnapshot = {}, nextSnapshot = {}) {
  const previous = normalizeSnapshot(previousSnapshot);
  const next = normalizeSnapshot(nextSnapshot);
  const operations = [];

  for (const [key, value] of Object.entries(next)) {
    if (previous[key] !== value) {
      operations.push({ type: 'set', key, value });
    }
  }

  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      operations.push({ type: 'remove', key });
    }
  }

  return operations;
}


function coalesceQueuedOperations(previousOperations = [], nextOperations = []) {
  const combined = [...previousOperations, ...nextOperations];
  let includesClear = false;
  const operationsByKey = new Map();

  combined.forEach((operation) => {
    if (operation?.type === 'clear') {
      includesClear = true;
      operationsByKey.clear();
      return;
    }

    if ((operation?.type === 'set' || operation?.type === 'remove') && operation?.key) {
      operationsByKey.set(String(operation.key), operation.type === 'set'
        ? { type: 'set', key: String(operation.key), value: String(operation.value ?? '') }
        : { type: 'remove', key: String(operation.key) });
    }
  });

  const coalesced = includesClear ? [{ type: 'clear' }] : [];
  coalesced.push(...operationsByKey.values());
  return coalesced;
}

function nextReconnectDelay(previousDelayMs = INITIAL_RECONNECT_DELAY_MS, maxDelayMs = MAX_RECONNECT_DELAY_MS) {
  const normalizedPrevious = Number.isFinite(previousDelayMs)
    ? Math.max(INITIAL_RECONNECT_DELAY_MS, Math.trunc(previousDelayMs))
    : INITIAL_RECONNECT_DELAY_MS;
  const normalizedMax = Number.isFinite(maxDelayMs)
    ? Math.max(INITIAL_RECONNECT_DELAY_MS, Math.trunc(maxDelayMs))
    : MAX_RECONNECT_DELAY_MS;
  return Math.min(normalizedPrevious * 2, normalizedMax);
}

function shouldHydrateFromServerOnWelcome({
  localChecksum = '',
  serverChecksum = '',
  queueLength = 0,
  hasPendingBatch = false,
} = {}) {
  if (!serverChecksum) return false;
  if (queueLength > 0 || hasPendingBatch) return false;
  return String(localChecksum) !== String(serverChecksum);
}

function shouldFallbackToHttpSync({
  hasEverConnected = false,
  consecutiveFailures = 0,
  maxFailures = MAX_INITIAL_CONNECT_FAILURES,
} = {}) {
  return !hasEverConnected && consecutiveFailures >= maxFailures;
}

function shouldPushSnapshotOverHttp({
  queueLength = 0,
  hasPendingBatch = false,
  socketReadyState = 3,
  online = true,
} = {}) {
  if (!online) return false;
  if (socketReadyState === 1) return false;
  return queueLength > 0 || hasPendingBatch;
}

function normalizeQueuedDifferential(diff = {}) {
  const operationsRaw = Array.isArray(diff?.operations) ? diff.operations : [];
  const operations = operationsRaw
    .filter((operation) => {
      const type = operation?.type;
      if (type === 'clear') return true;
      if ((type === 'set' || type === 'remove') && operation?.key) return true;
      return false;
    })
    .map((operation) => {
      if (operation.type === 'set') {
        return {
          type: 'set',
          key: String(operation.key),
          value: String(operation.value ?? ''),
        };
      }
      if (operation.type === 'remove') {
        return {
          type: 'remove',
          key: String(operation.key),
        };
      }
      return { type: 'clear' };
    });

  return {
    requestId: typeof diff?.requestId === 'string' && diff.requestId
      ? diff.requestId
      : `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    baseChecksum: typeof diff?.baseChecksum === 'string' ? diff.baseChecksum : '',
    operations,
  };
}

function mergeQueuedDifferentials(existingQueue = [], nextDifferential = null, inFlightRequestId = null) {
  const queue = Array.isArray(existingQueue)
    ? existingQueue.map((entry) => normalizeQueuedDifferential(entry)).filter((entry) => entry.operations.length)
    : [];

  const next = nextDifferential ? normalizeQueuedDifferential(nextDifferential) : null;
  if (!next?.operations?.length) return queue;

  const inFlight = typeof inFlightRequestId === 'string' ? inFlightRequestId : '';

  if (!queue.length) {
    return [next];
  }

  if (!inFlight) {
    const mergedOperations = coalesceQueuedOperations(
      queue.flatMap((entry) => entry.operations),
      next.operations,
    );
    return mergedOperations.length
      ? [normalizeQueuedDifferential({
        requestId: queue[0].requestId,
        baseChecksum: queue[0].baseChecksum || next.baseChecksum,
        operations: mergedOperations,
      })]
      : [];
  }

  const inFlightIndex = queue.findIndex((entry) => entry.requestId === inFlight);
  if (inFlightIndex === -1 || queue.length === 1) {
    return [...queue, next];
  }

  const tailStart = Math.max(inFlightIndex + 1, 1);
  const tail = queue.slice(tailStart);
  if (!tail.length) {
    return [...queue, next];
  }

  const tailMergedOperations = coalesceQueuedOperations(
    tail.flatMap((entry) => entry.operations),
    next.operations,
  );

  const preserved = queue.slice(0, tailStart);
  if (!tailMergedOperations.length) return preserved;

  return [
    ...preserved,
    normalizeQueuedDifferential({
      requestId: tail[0].requestId,
      baseChecksum: tail[0].baseChecksum || next.baseChecksum,
      operations: tailMergedOperations,
    }),
  ];
}

class LocalStorageSocketSync {
  constructor() {
    this.clientId = null;
    this.socket = null;
    this.suppress = false;
    this.inFlight = null;
    this.queue = this.#loadPendingQueue();
    this.serverChecksum = this.#loadMetaChecksum();
    this.flushTimer = null;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    this.reconnectTimer = null;
    this.pendingBatch = null;
    this.batchTimer = null;
    this.hasEverConnected = false;
    this.consecutiveConnectFailures = 0;
    this.snapshotPollTimer = null;

    this.#patchStorage();
    this.#connect();

    window.addEventListener('online', () => this.flush());
    window.addEventListener('offline', () => this.#scheduleFlush());
  }

  #connect() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      this.socket = new WebSocket(`${protocol}//${window.location.host}/ws/localstorage-sync`);
    } catch {
      this.#scheduleSnapshotPoll();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.hasEverConnected = true;
      this.consecutiveConnectFailures = 0;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.#cancelSnapshotPoll();
      this.flush();
    });
    this.socket.addEventListener('message', (event) => this.#onMessage(event));
    this.socket.addEventListener('close', () => {
      this.consecutiveConnectFailures += 1;
      if (shouldFallbackToHttpSync({
        hasEverConnected: this.hasEverConnected,
        consecutiveFailures: this.consecutiveConnectFailures,
      })) {
        this.#scheduleSnapshotPoll();
        return;
      }

      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.#connect();
      }, this.reconnectDelayMs);
      this.reconnectDelayMs = nextReconnectDelay(this.reconnectDelayMs);
    });
  }

  #patchStorage() {
    const storageProto = window.Storage?.prototype;
    if (!storageProto || storageProto.__surveyCadSyncPatched) return;

    const originalSetItem = storageProto.setItem;
    const originalRemoveItem = storageProto.removeItem;
    const originalClear = storageProto.clear;

    const sync = this;

    storageProto.setItem = function patchedSetItem(key, value) {
      const keyString = String(key);
      const valueString = String(value);
      const previous = this.getItem(keyString);
      const baseChecksum = checksumSnapshot(buildSnapshot());
      originalSetItem.call(this, keyString, valueString);
      if (!sync.suppress && shouldSyncLocalStorageKey(keyString) && previous !== valueString) {
        sync.enqueue([{ type: 'set', key: keyString, value: valueString }], { baseChecksum });
      }
    };

    storageProto.removeItem = function patchedRemoveItem(key) {
      const keyString = String(key);
      const had = this.getItem(keyString) !== null;
      const baseChecksum = checksumSnapshot(buildSnapshot());
      originalRemoveItem.call(this, keyString);
      if (!sync.suppress && shouldSyncLocalStorageKey(keyString) && had) {
        sync.enqueue([{ type: 'remove', key: keyString }], { baseChecksum });
      }
    };

    storageProto.clear = function patchedClear() {
      const keys = [];
      for (let i = 0; i < this.length; i += 1) {
        const key = this.key(i);
        if (shouldSyncLocalStorageKey(key)) keys.push(key);
      }
      const baseChecksum = checksumSnapshot(buildSnapshot());
      originalClear.call(this);
      if (!sync.suppress && keys.length) {
        sync.enqueue([{ type: 'clear' }], { baseChecksum });
      }
    };

    storageProto.__surveyCadSyncPatched = true;
  }

  enqueue(operations, { baseChecksum = '' } = {}) {
    const normalized = normalizeQueuedDifferential({ operations, baseChecksum });
    if (!normalized.operations.length) return;

    if (!this.pendingBatch) {
      this.pendingBatch = {
        requestId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        baseChecksum: normalized.baseChecksum || '',
        operations: [],
      };
    }

    if (!this.pendingBatch.baseChecksum && normalized.baseChecksum) {
      this.pendingBatch.baseChecksum = normalized.baseChecksum;
    }

    this.pendingBatch.operations = coalesceQueuedOperations(this.pendingBatch.operations, normalized.operations);
    this.#scheduleBatchCommit();
  }

  #scheduleBatchCommit() {
    if (this.batchTimer !== null) return;
    this.batchTimer = window.setTimeout(() => {
      this.batchTimer = null;
      this.#commitPendingBatch();
    }, OPERATION_BATCH_DELAY_MS);
  }

  #commitPendingBatch() {
    if (!this.pendingBatch?.operations?.length) return;
    this.queue = mergeQueuedDifferentials(this.queue, this.pendingBatch, this.inFlight);
    this.pendingBatch = null;
    this.#persistQueue();
    this.flush();
  }

  flush() {
    if (this.batchTimer !== null) {
      window.clearTimeout(this.batchTimer);
      this.batchTimer = null;
      this.#commitPendingBatch();
    }
    if (!navigator.onLine) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.inFlight || this.queue.length === 0) return;

    const next = this.queue[0];
    this.inFlight = next.requestId;
    this.socket.send(JSON.stringify({
      type: 'sync-differential',
      requestId: next.requestId,
      baseChecksum: next.baseChecksum || '',
      operations: next.operations,
    }));
  }

  async #onMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message?.type === 'sync-welcome') {
      this.clientId = message.clientId || null;
      if (message?.state?.checksum) {
        this.serverChecksum = String(message.state.checksum);
        this.#persistMeta();

        const localChecksum = checksumSnapshot(buildSnapshot());
        if (shouldHydrateFromServerOnWelcome({
          localChecksum,
          serverChecksum: this.serverChecksum,
          queueLength: this.queue.length,
          hasPendingBatch: Boolean(this.pendingBatch?.operations?.length),
        })) {
          await this.#fetchAndApplyServerSnapshot();
        }
      }
      this.flush();
      return;
    }

    if (message?.type === 'sync-checksum-mismatch') {
      this.inFlight = null;
      const serverSnapshot = await this.#fetchAndApplyServerSnapshot();
      this.#rebasePendingQueue(serverSnapshot);
      this.#scheduleFlush();
      return;
    }

    if (message?.type !== 'sync-differential-applied') return;

    if (message.originClientId === this.clientId && this.queue[0]?.requestId === message.requestId) {
      this.queue.shift();
      this.#persistQueue();
      this.inFlight = null;
    } else if (Array.isArray(message.operations) && message.operations.length) {
      this.#applyOperations(message.operations);
    }

    const computed = checksumSnapshot(buildSnapshot());
    const expected = String(message?.state?.checksum || '');
    this.serverChecksum = expected;
    this.#persistMeta();

    if (!expected || computed !== expected) {
      const serverSnapshot = await this.#fetchAndApplyServerSnapshot();
      this.#rebasePendingQueue(serverSnapshot);
    }

    this.flush();
  }

  #applyOperations(operations) {
    this.suppress = true;
    try {
      operations.forEach((operation) => {
        if (operation?.type === 'clear') {
          const keys = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (shouldSyncLocalStorageKey(key)) keys.push(key);
          }
          keys.forEach((key) => window.localStorage.removeItem(key));
          return;
        }
        if (operation?.type === 'set' && operation.key) {
          window.localStorage.setItem(String(operation.key), String(operation.value ?? ''));
          return;
        }
        if (operation?.type === 'remove' && operation.key) {
          window.localStorage.removeItem(String(operation.key));
        }
      });
    } finally {
      this.suppress = false;
    }
  }

  #rebasePendingQueue(serverSnapshot = {}) {
    if (!this.queue.length) return;

    const localSnapshot = buildSnapshot();
    const operations = buildDifferentialOperations(serverSnapshot || {}, localSnapshot);
    if (!operations.length) {
      this.queue = [];
      this.#persistQueue();
      return;
    }

    this.queue = [normalizeQueuedDifferential({
      requestId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      baseChecksum: this.serverChecksum || checksumSnapshot(serverSnapshot || {}),
      operations,
    })];
    this.#persistQueue();
  }

  async #fetchAndApplyServerSnapshot() {
    const payload = await this.#fetchServerState();
    if (!payload) return {};
    const snapshot = normalizeSnapshot(payload.snapshot || {});

    this.suppress = true;
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (shouldSyncLocalStorageKey(key)) keys.push(key);
      }
      keys.forEach((key) => {
        if (!(key in snapshot)) {
          window.localStorage.removeItem(key);
        }
      });
      Object.entries(snapshot).forEach(([key, value]) => {
        if (shouldSyncLocalStorageKey(key)) {
          window.localStorage.setItem(key, String(value));
        }
      });
    } finally {
      this.suppress = false;
    }

    this.serverChecksum = String(payload.checksum || checksumSnapshot(buildSnapshot()));
    this.#persistMeta();
    return snapshot;
  }

  async #fetchServerState() {
    const response = await fetch('/api/localstorage-sync');
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      version: Number(payload?.version || 0),
      checksum: String(payload?.checksum || ''),
      snapshot: normalizeSnapshot(payload?.snapshot || {}),
    };
  }

  async #pushSnapshotViaHttp() {
    if (!shouldPushSnapshotOverHttp({
      queueLength: this.queue.length,
      hasPendingBatch: Boolean(this.pendingBatch?.operations?.length),
      socketReadyState: this.socket?.readyState,
      online: navigator.onLine,
    })) {
      return false;
    }

    if (this.batchTimer !== null) {
      window.clearTimeout(this.batchTimer);
      this.batchTimer = null;
      this.#commitPendingBatch();
    }

    const serverState = await this.#fetchServerState();
    if (!serverState) return false;

    const snapshot = buildSnapshot();
    const response = await fetch('/api/localstorage-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: (Number.isFinite(serverState.version) ? serverState.version : 0) + 1,
        snapshot,
      }),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    const nextState = payload?.state;
    if (!nextState?.checksum) return false;

    this.serverChecksum = String(nextState.checksum);
    this.#persistMeta();
    this.inFlight = null;
    this.pendingBatch = null;
    this.queue = [];
    this.#persistQueue();
    return true;
  }

  #scheduleSnapshotPoll() {
    if (this.snapshotPollTimer !== null) return;
    this.snapshotPollTimer = window.setInterval(async () => {
      if (!navigator.onLine) return;
      if (this.queue.length || this.pendingBatch?.operations?.length) {
        await this.#pushSnapshotViaHttp();
        return;
      }
      const localChecksum = checksumSnapshot(buildSnapshot());
      const state = await this.#fetchServerState();
      if (!state?.checksum) return;
      if (state.checksum === localChecksum) return;
      await this.#fetchAndApplyServerSnapshot();
    }, SNAPSHOT_POLL_INTERVAL_MS);
  }

  #cancelSnapshotPoll() {
    if (this.snapshotPollTimer === null) return;
    window.clearInterval(this.snapshotPollTimer);
    this.snapshotPollTimer = null;
  }

  #persistQueue() {
    this.suppress = true;
    try {
      window.localStorage.setItem(PENDING_DIFFS_KEY, JSON.stringify(this.queue));
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error;

      this.queue = mergeQueuedDifferentials([], {
        requestId: this.queue[0]?.requestId || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        baseChecksum: this.queue[0]?.baseChecksum || this.serverChecksum || '',
        operations: this.queue.flatMap((entry) => entry?.operations || []),
      }, null);

      window.localStorage.setItem(PENDING_DIFFS_KEY, JSON.stringify(this.queue));
    } finally {
      this.suppress = false;
    }
  }

  #loadPendingQueue() {
    try {
      const raw = window.localStorage.getItem(PENDING_DIFFS_KEY);
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => normalizeQueuedDifferential(entry))
        .filter((entry) => entry.operations.length > 0);
    } catch {
      return [];
    }
  }

  #persistMeta() {
    this.suppress = true;
    try {
      window.localStorage.setItem(SYNC_META_KEY, JSON.stringify({ serverChecksum: this.serverChecksum || '' }));
    } finally {
      this.suppress = false;
    }
  }

  #loadMetaChecksum() {
    try {
      const raw = window.localStorage.getItem(SYNC_META_KEY);
      const parsed = JSON.parse(raw || '{}');
      return typeof parsed?.serverChecksum === 'string' ? parsed.serverChecksum : '';
    } catch {
      return '';
    }
  }

  #scheduleFlush() {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 250);
  }
}

if (typeof window !== 'undefined' && !window.document.documentElement.hasAttribute(SYNC_DISABLED_ATTR)) {
  const currentPath = window.location.pathname.toLowerCase();
  const isRosOcr = currentPath.endsWith('/ros_ocr.html');
  if (!isRosOcr) {
    window.__surveyCadLocalStorageSocketSync = window.__surveyCadLocalStorageSocketSync || new LocalStorageSocketSync();
  }
}

export {
  LocalStorageSocketSync,
  checksumSnapshot,
  buildSnapshot,
  buildDifferentialOperations,
  coalesceQueuedOperations,
  mergeQueuedDifferentials,
  nextReconnectDelay,
  shouldHydrateFromServerOnWelcome,
  shouldSyncLocalStorageKey,
  shouldFallbackToHttpSync,
  shouldPushSnapshotOverHttp,
};
