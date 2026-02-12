const SYNC_DISABLED_ATTR = 'data-localstorage-sync-disabled';
const INTERNAL_KEYS = new Set([
  'surveyfoundryLocalStoragePendingDiffs',
  'surveyfoundryLocalStorageSyncMeta',
]);
const PENDING_DIFFS_KEY = 'surveyfoundryLocalStoragePendingDiffs';
const SYNC_META_KEY = 'surveyfoundryLocalStorageSyncMeta';

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
    if (!key || INTERNAL_KEYS.has(key)) continue;
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

class LocalStorageSocketSync {
  constructor() {
    this.clientId = null;
    this.socket = null;
    this.suppress = false;
    this.inFlight = null;
    this.queue = this.#loadPendingQueue();
    this.serverChecksum = this.#loadMetaChecksum();
    this.flushTimer = null;

    this.#patchStorage();
    this.#connect();

    window.addEventListener('online', () => this.flush());
    window.addEventListener('offline', () => this.#scheduleFlush());
  }

  #connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws/localstorage-sync`);

    this.socket.addEventListener('open', () => this.flush());
    this.socket.addEventListener('message', (event) => this.#onMessage(event));
    this.socket.addEventListener('close', () => {
      window.setTimeout(() => this.#connect(), 1500);
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
      if (!sync.suppress && !INTERNAL_KEYS.has(keyString) && previous !== valueString) {
        sync.enqueue([{ type: 'set', key: keyString, value: valueString }], { baseChecksum });
      }
    };

    storageProto.removeItem = function patchedRemoveItem(key) {
      const keyString = String(key);
      const had = this.getItem(keyString) !== null;
      const baseChecksum = checksumSnapshot(buildSnapshot());
      originalRemoveItem.call(this, keyString);
      if (!sync.suppress && !INTERNAL_KEYS.has(keyString) && had) {
        sync.enqueue([{ type: 'remove', key: keyString }], { baseChecksum });
      }
    };

    storageProto.clear = function patchedClear() {
      const keys = [];
      for (let i = 0; i < this.length; i += 1) {
        const key = this.key(i);
        if (key && !INTERNAL_KEYS.has(key)) keys.push(key);
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
    this.queue.push(normalizeQueuedDifferential({
      operations,
      baseChecksum,
      requestId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    this.#persistQueue();
    this.flush();
  }

  flush() {
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
            if (key && !INTERNAL_KEYS.has(key)) keys.push(key);
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
    const response = await fetch('/api/localstorage-sync');
    if (!response.ok) return {};
    const payload = await response.json();
    const snapshot = normalizeSnapshot(payload?.snapshot || {});

    this.suppress = true;
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && !INTERNAL_KEYS.has(key)) keys.push(key);
      }
      keys.forEach((key) => {
        if (!(key in snapshot)) {
          window.localStorage.removeItem(key);
        }
      });
      Object.entries(snapshot).forEach(([key, value]) => {
        if (!INTERNAL_KEYS.has(key)) {
          window.localStorage.setItem(key, String(value));
        }
      });
    } finally {
      this.suppress = false;
    }

    this.serverChecksum = String(payload?.checksum || checksumSnapshot(buildSnapshot()));
    this.#persistMeta();
    return snapshot;
  }

  #persistQueue() {
    this.suppress = true;
    try {
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

export { LocalStorageSocketSync, checksumSnapshot, buildSnapshot, buildDifferentialOperations };
