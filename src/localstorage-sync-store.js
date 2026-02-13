const DEFAULT_STATE = Object.freeze({
  version: 0,
  snapshot: {},
  checksum: '',
  updatedAt: null,
});

function cloneSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => [String(key), String(value)]),
  );
}

function normalizeVersion(version) {
  const numeric = Number(version);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.trunc(numeric);
}

function sortedSnapshot(snapshot = {}) {
  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b)));
}

export function computeSnapshotChecksum(snapshot = {}) {
  const canonical = JSON.stringify(sortedSnapshot(cloneSnapshot(snapshot)));
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeOperation(operation = {}) {
  const type = operation?.type;
  if (type === 'set') {
    return {
      type: 'set',
      key: String(operation.key || ''),
      value: String(operation.value ?? ''),
    };
  }
  if (type === 'remove') {
    return {
      type: 'remove',
      key: String(operation.key || ''),
    };
  }
  if (type === 'clear') {
    return { type: 'clear' };
  }
  return null;
}

function normalizeDifferential(operations = []) {
  if (!Array.isArray(operations)) return [];
  return operations
    .map((operation) => normalizeOperation(operation))
    .filter((operation) => operation && (operation.type === 'clear' || operation.key));
}

function applyDifferential(snapshot = {}, operations = []) {
  const next = { ...snapshot };
  operations.forEach((operation) => {
    if (operation.type === 'clear') {
      Object.keys(next).forEach((key) => {
        delete next[key];
      });
      return;
    }
    if (operation.type === 'set') {
      next[operation.key] = operation.value;
      return;
    }
    if (operation.type === 'remove') {
      delete next[operation.key];
    }
  });
  return next;
}

export class LocalStorageSyncStore {
  #state;

  constructor(initialState = {}) {
    const snapshot = cloneSnapshot(initialState.snapshot);
    this.#state = {
      ...DEFAULT_STATE,
      version: normalizeVersion(initialState.version),
      snapshot,
      checksum: computeSnapshotChecksum(snapshot),
      updatedAt: initialState.updatedAt || null,
    };
  }

  getState() {
    return {
      version: this.#state.version,
      snapshot: { ...this.#state.snapshot },
      checksum: this.#state.checksum,
      updatedAt: this.#state.updatedAt,
    };
  }

  syncIncoming({ version = 0, snapshot = {} } = {}) {
    const incomingVersion = normalizeVersion(version);
    const incomingSnapshot = cloneSnapshot(snapshot);

    if (incomingVersion > this.#state.version) {
      const checksum = computeSnapshotChecksum(incomingSnapshot);
      this.#state = {
        version: incomingVersion,
        snapshot: incomingSnapshot,
        checksum,
        updatedAt: new Date().toISOString(),
      };
      return {
        status: 'server-updated',
        state: this.getState(),
      };
    }

    if (incomingVersion < this.#state.version) {
      return {
        status: 'client-stale',
        state: this.getState(),
      };
    }

    const checksum = computeSnapshotChecksum(incomingSnapshot);
    this.#state = {
      version: incomingVersion,
      snapshot: incomingSnapshot,
      checksum,
      updatedAt: this.#state.updatedAt || new Date().toISOString(),
    };

    return {
      status: 'in-sync',
      state: this.getState(),
    };
  }

  applyDifferential({ operations = [], baseChecksum = '' } = {}) {
    const normalizedOps = normalizeDifferential(operations);
    if (!normalizedOps.length) {
      return {
        status: 'no-op',
        state: this.getState(),
        operations: [],
      };
    }

    if (baseChecksum && baseChecksum !== this.#state.checksum) {
      return {
        status: 'checksum-mismatch',
        state: this.getState(),
        operations: normalizedOps,
      };
    }

    const nextSnapshot = applyDifferential(this.#state.snapshot, normalizedOps);
    const checksum = computeSnapshotChecksum(nextSnapshot);
    this.#state = {
      version: this.#state.version + 1,
      snapshot: nextSnapshot,
      checksum,
      updatedAt: new Date().toISOString(),
    };

    return {
      status: 'applied',
      operations: normalizedOps,
      state: this.getState(),
    };
  }
}
