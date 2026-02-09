const DEFAULT_STATE = Object.freeze({
  version: 0,
  snapshot: {},
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

export class LocalStorageSyncStore {
  #state;

  constructor(initialState = {}) {
    this.#state = {
      ...DEFAULT_STATE,
      version: normalizeVersion(initialState.version),
      snapshot: cloneSnapshot(initialState.snapshot),
      updatedAt: initialState.updatedAt || null,
    };
  }

  getState() {
    return {
      version: this.#state.version,
      snapshot: { ...this.#state.snapshot },
      updatedAt: this.#state.updatedAt,
    };
  }

  syncIncoming({ version = 0, snapshot = {} } = {}) {
    const incomingVersion = normalizeVersion(version);
    const incomingSnapshot = cloneSnapshot(snapshot);

    if (incomingVersion > this.#state.version) {
      this.#state = {
        version: incomingVersion,
        snapshot: incomingSnapshot,
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

    this.#state = {
      version: incomingVersion,
      snapshot: incomingSnapshot,
      updatedAt: this.#state.updatedAt || new Date().toISOString(),
    };

    return {
      status: 'in-sync',
      state: this.getState(),
    };
  }
}
