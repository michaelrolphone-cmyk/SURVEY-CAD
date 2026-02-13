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
const MAX_PRECONNECT_FAILURES_BEFORE_DORMANT = 3;
const DORMANT_RETRY_DELAY_MS = 60000;
const HTTP_FALLBACK_SYNC_INTERVAL_MS = 60000;

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


function buildSocketEndpointCandidates({
  protocol = 'https:',
  host = '',
  pathname = '/',
} = {}) {
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPathname = typeof pathname === 'string' && pathname ? pathname : '/';
  const baseDir = normalizedPathname.endsWith('/')
    ? normalizedPathname.slice(0, -1)
    : normalizedPathname.replace(/\/[^/]*$/, '');

  const candidates = [`${wsProtocol}//${host}/ws/localstorage-sync`];
  if (baseDir && baseDir !== '/') {
    candidates.push(`${wsProtocol}//${host}${baseDir}/ws/localstorage-sync`);
  }
  return [...new Set(candidates)];
}

function buildApiEndpointCandidates({
  origin = '',
  pathname = '/',
} = {}) {
  const normalizedPathname = typeof pathname === 'string' && pathname ? pathname : '/';
  const baseDir = normalizedPathname.endsWith('/')
    ? normalizedPathname.slice(0, -1)
    : normalizedPathname.replace(/\/[^/]*$/, '');

  const candidates = [`${origin}/api/localstorage-sync`];
  if (baseDir && baseDir !== '/') {
    candidates.push(`${origin}${baseDir}/api/localstorage-sync`);
  }
  return [...new Set(candidates)];
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

function shouldApplyStartupServerState({
  localVersion = 0,
  serverVersion = 0,
  localChecksum = '',
  serverChecksum = '',
  queueLength = 0,
  hasPendingBatch = false,
  localEntryCount = 0,
  serverEntryCount = 0,
} = {}) {
  if (queueLength > 0 || hasPendingBatch) return false;
  if (serverEntryCount <= 0) return false;
  if (localEntryCount <= 0) return true;
  if (Number(serverVersion) > Number(localVersion)) return true;

  // Backwards-compatible bootstrap for clients that have not persisted local version metadata yet.
  if (!Number(localVersion) && serverChecksum && String(serverChecksum) !== String(localChecksum)) {
    return true;
  }

  return false;
}






function hasServerSnapshot(serverSnapshot = null) {
  return Boolean(serverSnapshot && typeof serverSnapshot === 'object' && !Array.isArray(serverSnapshot));
}

export function shouldApplyWelcomeSnapshotImmediately({
  localChecksum = '',
  serverChecksum = '',
  queueLength = 0,
  hasPendingBatch = false,
  serverSnapshot = null,
} = {}) {
  if (!hasServerSnapshot(serverSnapshot)) return false;
  if (!serverChecksum) return false;
  if (queueLength > 0 || hasPendingBatch) return false;
  return String(localChecksum) !== String(serverChecksum);
}

export function shouldRebaseQueueFromWelcomeSnapshotImmediately({
  localChecksum = '',
  serverChecksum = '',
  queueLength = 0,
  hasPendingBatch = false,
  serverSnapshot = null,
} = {}) {
  if (!hasServerSnapshot(serverSnapshot)) return false;
  if (!serverChecksum) return false;
  if (!queueLength && !hasPendingBatch) return false;
  return String(localChecksum) !== String(serverChecksum);
}

function shouldRunHttpFallbackSync({
  socketReadyState = 3,
  online = true,
} = {}) {
  if (!online) return false;
  return socketReadyState !== 1;
}

function shouldEnterDormantReconnect({
  hasEverConnected = false,
  consecutiveFailures = 0,
  maxPreconnectFailures = MAX_PRECONNECT_FAILURES_BEFORE_DORMANT,
} = {}) {
  if (hasEverConnected) return false;
  return consecutiveFailures >= maxPreconnectFailures;
}

function shouldRebaseQueueFromServerOnWelcome({
  localChecksum = '',
  serverChecksum = '',
  queueLength = 0,
  hasPendingBatch = false,
} = {}) {
  if (!serverChecksum) return false;
  if (!queueLength && !hasPendingBatch) return false;
  return String(localChecksum) !== String(serverChecksum);
}

function shouldReplayInFlightOnSocketClose({
  inFlightRequestId = '',
  queueHeadRequestId = '',
} = {}) {
  if (!inFlightRequestId || !queueHeadRequestId) return false;
  return String(inFlightRequestId) === String(queueHeadRequestId);
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
    this.serverVersion = this.#loadMetaVersion();
    this.flushTimer = null;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    this.reconnectTimer = null;
    this.pendingBatch = null;
    this.batchTimer = null;
    this.hasEverConnected = false;
    this.consecutiveConnectFailures = 0;
    this.dormantUntilMs = 0;
    this.httpFallbackTimer = null;
    this.httpFallbackInProgress = false;
    this.offlineSince = navigator.onLine ? null : Date.now();
    this.socketEndpointCandidates = buildSocketEndpointCandidates(window.location);
    this.socketEndpointIndex = 0;
    this.apiEndpointCandidates = buildApiEndpointCandidates(window.location);
    this.apiEndpointIndex = 0;

    this.#patchStorage();
    this.#bootstrapFromApi().catch(() => {
      // Ignore startup bootstrap failures and continue websocket connect/retry flow.
    });
    this.#connect();

    window.addEventListener('online', () => {
      this.dormantUntilMs = 0;
      this.httpFallbackInProgress = false;
      this.socketEndpointCandidates = buildSocketEndpointCandidates(window.location);
      this.socketEndpointIndex = 0;
      this.apiEndpointCandidates = buildApiEndpointCandidates(window.location);
      this.apiEndpointIndex = 0;
      if (!this.socket || this.socket.readyState >= WebSocket.CLOSING) {
        this.#connect();
      }
      this.flush();
    });
    window.addEventListener('offline', () => {
      if (!this.offlineSince) this.offlineSince = Date.now();
      this.#scheduleFlush();
    });
  }

  #connect() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      return;
    }

    if (this.dormantUntilMs > Date.now()) {
      this.#scheduleReconnect(this.dormantUntilMs - Date.now());
      return;
    }

    const socketUrl = this.socketEndpointCandidates[this.socketEndpointIndex]
      || this.socketEndpointCandidates[0]
      || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/localstorage-sync`;

    try {
      this.socket = new WebSocket(socketUrl);
    } catch {
      this.#scheduleHttpFallbackSync();
      this.#scheduleReconnect();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.hasEverConnected = true;
      this.consecutiveConnectFailures = 0;
      this.dormantUntilMs = 0;
      this.httpFallbackInProgress = false;
      this.socketEndpointCandidates = buildSocketEndpointCandidates(window.location);
      this.socketEndpointIndex = 0;
      this.apiEndpointCandidates = buildApiEndpointCandidates(window.location);
      this.apiEndpointIndex = 0;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.#cancelHttpFallbackSync();
      this.flush();
    });
    this.socket.addEventListener('message', (event) => this.#onMessage(event));
    this.socket.addEventListener('close', () => {
      this.consecutiveConnectFailures += 1;
      if (shouldReplayInFlightOnSocketClose({
        inFlightRequestId: this.inFlight,
        queueHeadRequestId: this.queue[0]?.requestId,
      })) {
        this.inFlight = null;
      }

      if (!this.hasEverConnected && this.socketEndpointCandidates.length > 1) {
        this.socketEndpointIndex = (this.socketEndpointIndex + 1) % this.socketEndpointCandidates.length;
      }

      this.socket = null;
      if (!navigator.onLine) return;
      this.#scheduleHttpFallbackSync();

      if (shouldEnterDormantReconnect({
        hasEverConnected: this.hasEverConnected,
        consecutiveFailures: this.consecutiveConnectFailures,
      })) {
        this.dormantUntilMs = Date.now() + DORMANT_RETRY_DELAY_MS;
        this.#scheduleReconnect(DORMANT_RETRY_DELAY_MS);
        return;
      }

      this.#scheduleReconnect();
    });
  }


  #scheduleReconnect(delayOverrideMs = null) {
    if (this.reconnectTimer !== null) return;

    const delayMs = Number.isFinite(delayOverrideMs)
      ? Math.max(0, Math.trunc(delayOverrideMs))
      : this.reconnectDelayMs;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.#connect();
    }, delayMs);

    if (delayOverrideMs === null) {
      this.reconnectDelayMs = nextReconnectDelay(this.reconnectDelayMs);
    }
  }


  #scheduleHttpFallbackSync() {
    if (this.httpFallbackTimer !== null) return;
    this.httpFallbackTimer = window.setInterval(() => {
      this.#syncViaHttpFallback();
    }, HTTP_FALLBACK_SYNC_INTERVAL_MS);
  }

  #cancelHttpFallbackSync() {
    if (this.httpFallbackTimer === null) return;
    window.clearInterval(this.httpFallbackTimer);
    this.httpFallbackTimer = null;
  }

  async #bootstrapFromApi() {
    if (!navigator.onLine) return;
    if (this.queue.length > 0 || this.pendingBatch?.operations?.length) return;

    const serverState = await this.#fetchServerState();
    if (!serverState) return;

    const localSnapshot = buildSnapshot();
    const localChecksum = checksumSnapshot(localSnapshot);

    if (!shouldApplyStartupServerState({
      localVersion: this.serverVersion,
      serverVersion: serverState.version,
      localChecksum,
      serverChecksum: serverState.checksum,
      queueLength: this.queue.length,
      hasPendingBatch: Boolean(this.pendingBatch?.operations?.length),
      localEntryCount: Object.keys(localSnapshot).length,
      serverEntryCount: Object.keys(serverState.snapshot || {}).length,
    })) {
      this.serverVersion = Number(serverState.version || this.serverVersion || 0);
      this.serverChecksum = String(serverState.checksum || this.serverChecksum || '');
      this.#persistMeta();
      return;
    }

    await this.#fetchAndApplyServerSnapshot();
  }

  async #syncViaHttpFallback() {
    if (this.httpFallbackInProgress) return;
    if (!shouldRunHttpFallbackSync({
      socketReadyState: this.socket?.readyState,
      online: navigator.onLine,
    })) {
      this.#cancelHttpFallbackSync();
      return;
    }

    this.httpFallbackInProgress = true;
    try {
      if (this.batchTimer !== null) {
        window.clearTimeout(this.batchTimer);
        this.batchTimer = null;
        this.#commitPendingBatch();
      }

      const serverState = await this.#fetchServerState();
      if (!serverState) return;

      const localSnapshot = buildSnapshot();
      const localChecksum = checksumSnapshot(localSnapshot);

      if (this.queue.length > 0 || this.pendingBatch?.operations?.length) {
        const response = await this.#requestLocalStorageSyncApi({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            version: (Number.isFinite(serverState.version) ? serverState.version : 0) + 1,
            snapshot: localSnapshot,
          }),
        });
        if (!response.ok) return;
        const payload = await response.json();
        const postStatus = String(payload?.status || '');

        if (postStatus === 'server-updated' || postStatus === 'in-sync') {
          this.serverChecksum = String(payload?.state?.checksum || localChecksum);
          this.#persistMeta();
          this.inFlight = null;
          this.queue = [];
          this.#persistQueue();
          return;
        }

        if (postStatus === 'client-stale' || postStatus === 'checksum-conflict') {
          const localSnapshotBeforeHydrate = localSnapshot;
          const serverSnapshot = await this.#fetchAndApplyServerSnapshot();
          this.#rebasePendingQueue(serverSnapshot, localSnapshotBeforeHydrate);
          return;
        }
      }

      if (serverState.checksum && serverState.checksum !== localChecksum) {
        await this.#fetchAndApplyServerSnapshot();
      }
    } finally {
      this.httpFallbackInProgress = false;
    }
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

    if (this.offlineSince && !this.inFlight) {
      this.queue.push(normalizeQueuedDifferential(this.pendingBatch));
      this.pendingBatch = null;
      this.#persistQueue();
      return;
    }

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

    if (this.queue.length > 1 && this.offlineSince) {
      const batchRequestId = `sync-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.inFlight = batchRequestId;
      this.offlineSince = null;
      try {
        this.socket.send(JSON.stringify({
          type: 'sync-differential-batch',
          requestId: batchRequestId,
          diffs: this.queue.map((entry) => ({ operations: entry.operations })),
        }));
      } catch {
        this.inFlight = null;
        this.#scheduleFlush();
      }
      return;
    }

    this.offlineSince = null;
    const next = this.queue[0];
    this.inFlight = next.requestId;
    try {
      this.socket.send(JSON.stringify({
        type: 'sync-differential',
        requestId: next.requestId,
        baseChecksum: next.baseChecksum || '',
        operations: next.operations,
      }));
    } catch {
      this.inFlight = null;
      this.#scheduleFlush();
    }
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
        const queueLength = this.queue.length;
        const hasPendingBatch = Boolean(this.pendingBatch?.operations?.length);

        const welcomeSnapshot = hasServerSnapshot(message?.state?.snapshot)
          ? normalizeSnapshot(message.state.snapshot)
          : null;

        if (shouldRebaseQueueFromServerOnWelcome({
          localChecksum,
          serverChecksum: this.serverChecksum,
          queueLength,
          hasPendingBatch,
        })) {
          if (this.batchTimer !== null) {
            window.clearTimeout(this.batchTimer);
            this.batchTimer = null;
            this.#commitPendingBatch();
          }
          const localSnapshotBeforeHydrate = buildSnapshot();
          const serverSnapshot = shouldRebaseQueueFromWelcomeSnapshotImmediately({
            localChecksum,
            serverChecksum: this.serverChecksum,
            queueLength,
            hasPendingBatch,
            serverSnapshot: welcomeSnapshot,
          })
            ? this.#applyServerSnapshot(welcomeSnapshot, {
              checksum: message?.state?.checksum,
              version: message?.state?.version,
            })
            : await this.#fetchAndApplyServerSnapshot();
          this.#rebasePendingQueue(serverSnapshot, localSnapshotBeforeHydrate);
        } else if (shouldHydrateFromServerOnWelcome({
          localChecksum,
          serverChecksum: this.serverChecksum,
          queueLength,
          hasPendingBatch,
        })) {
          if (shouldApplyWelcomeSnapshotImmediately({
            localChecksum,
            serverChecksum: this.serverChecksum,
            queueLength,
            hasPendingBatch,
            serverSnapshot: welcomeSnapshot,
          })) {
            this.#applyServerSnapshot(welcomeSnapshot, {
              checksum: message?.state?.checksum,
              version: message?.state?.version,
            });
          } else {
            await this.#fetchAndApplyServerSnapshot();
          }
        }
        if (Number.isFinite(message?.state?.version)) {
          this.serverVersion = Number(message.state.version);
          this.#persistMeta();
        }
      }
      this.flush();
      return;
    }

    if (message?.type === 'sync-checksum-mismatch') {
      const wasBatch = typeof this.inFlight === 'string' && this.inFlight.startsWith('sync-batch-');
      this.inFlight = null;
      const serverSnapshot = await this.#fetchAndApplyServerSnapshot();
      this.#rebasePendingQueue(serverSnapshot);
      if (wasBatch) {
        this.offlineSince = null;
      }
      this.#scheduleFlush();
      return;
    }

    if (message?.type !== 'sync-differential-applied') return;

    const isBatchAck = message.originClientId === this.clientId
      && typeof this.inFlight === 'string'
      && this.inFlight.startsWith('sync-batch-')
      && message.requestId === this.inFlight;

    if (isBatchAck) {
      this.queue = [];
      this.#persistQueue();
      this.inFlight = null;
    } else if (message.originClientId === this.clientId && this.queue[0]?.requestId === message.requestId) {
      this.queue.shift();
      this.#persistQueue();
      this.inFlight = null;
    } else if (Array.isArray(message.operations) && message.operations.length) {
      this.#applyOperations(message.operations);
    }

    const computed = checksumSnapshot(buildSnapshot());
    const expected = String(message?.state?.checksum || '');
    this.serverChecksum = expected;
    if (Number.isFinite(message?.state?.version)) {
      this.serverVersion = Number(message.state.version);
    }
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
    this.#notifyLocalStorageChanged();
  }

  #rebasePendingQueue(serverSnapshot = {}, localSnapshotOverride = null) {
    if (!this.queue.length) return;

    const localSnapshot = localSnapshotOverride && typeof localSnapshotOverride === 'object'
      ? normalizeSnapshot(localSnapshotOverride)
      : buildSnapshot();
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

  #applyServerSnapshot(snapshot = {}, { checksum = '', version = 0 } = {}) {
    const normalizedSnapshot = normalizeSnapshot(snapshot || {});

    this.suppress = true;
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (shouldSyncLocalStorageKey(key)) keys.push(key);
      }
      keys.forEach((key) => {
        if (!(key in normalizedSnapshot)) {
          window.localStorage.removeItem(key);
        }
      });
      Object.entries(normalizedSnapshot).forEach(([key, value]) => {
        if (shouldSyncLocalStorageKey(key)) {
          window.localStorage.setItem(key, String(value));
        }
      });
    } finally {
      this.suppress = false;
    }

    this.serverChecksum = String(checksum || checksumSnapshot(buildSnapshot()));
    this.serverVersion = Number(version || 0);
    this.#persistMeta();
    this.#notifyLocalStorageChanged();
    return normalizedSnapshot;
  }

  async #fetchAndApplyServerSnapshot() {
    const payload = await this.#fetchServerState();
    if (!payload) return {};
    return this.#applyServerSnapshot(payload.snapshot, {
      checksum: payload.checksum,
      version: payload.version,
    });
  }

  async #fetchServerState() {
    const response = await this.#requestLocalStorageSyncApi();
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      version: Number(payload?.version || 0),
      checksum: String(payload?.checksum || ''),
      snapshot: normalizeSnapshot(payload?.snapshot || {}),
    };
  }

  async #requestLocalStorageSyncApi(fetchInit = undefined) {
    const candidates = Array.isArray(this.apiEndpointCandidates) && this.apiEndpointCandidates.length
      ? this.apiEndpointCandidates
      : buildApiEndpointCandidates(window.location);
    let lastResponse = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidateIndex = (this.apiEndpointIndex + i) % candidates.length;
      const endpoint = candidates[candidateIndex];
      try {
        const response = await fetch(endpoint, fetchInit);
        if (response.ok) {
          this.apiEndpointIndex = candidateIndex;
          return response;
        }

        lastResponse = response;
        if (response.status !== 404) {
          return response;
        }
      } catch {
        // Try the next routed endpoint candidate.
      }
    }

    return lastResponse || new Response(null, { status: 503 });
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
      window.localStorage.setItem(SYNC_META_KEY, JSON.stringify({
        serverChecksum: this.serverChecksum || '',
        serverVersion: Number(this.serverVersion || 0),
      }));
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

  #loadMetaVersion() {
    try {
      const raw = window.localStorage.getItem(SYNC_META_KEY);
      const parsed = JSON.parse(raw || '{}');
      return Number.isFinite(parsed?.serverVersion) ? Number(parsed.serverVersion) : 0;
    } catch {
      return 0;
    }
  }

  #notifyLocalStorageChanged() {
    try {
      window.dispatchEvent(new CustomEvent('surveyfoundry-localstorage-sync'));
    } catch {
      // Ignore errors from event dispatch.
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
  shouldApplyStartupServerState,
  shouldRebaseQueueFromServerOnWelcome,
  shouldSyncLocalStorageKey,
  shouldReplayInFlightOnSocketClose,
  shouldEnterDormantReconnect,
  shouldRunHttpFallbackSync,
  buildSocketEndpointCandidates,
  buildApiEndpointCandidates,
};
