function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizeAddress(address = '') {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function projectCacheKey(projectId) {
  return `recordquarry:cache:project:${projectId}`;
}

function addressCacheKey(address) {
  return `recordquarry:cache:address:${normalizeAddress(address)}`;
}

function parseSnapshotJson(snapshot = {}, key = '') {
  const raw = snapshot[key];
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function validateCachePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Cache payload must be a JSON object.');
  }
  if (!payload.lookup || typeof payload.lookup !== 'object') {
    throw new Error('lookup is required and must be a JSON object.');
  }
}

export async function getProjectRecordQuarryCache(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  return parseSnapshotJson(snapshot, projectCacheKey(projectId));
}

export async function saveProjectRecordQuarryCache(store, projectIdRaw, payload) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  validateCachePayload(payload);

  const record = {
    schemaVersion: '1.0.0',
    projectId,
    address: normalizeAddress(payload.address || ''),
    lookup: payload.lookup,
    selection: payload.selection || null,
    savedAt: nowIso(),
  };

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: projectCacheKey(projectId), value: JSON.stringify(record) },
      ],
    }],
  }));

  return { cache: record, sync: result };
}

export async function deleteProjectRecordQuarryCache(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, projectCacheKey(projectId));
  if (!existing) return null;

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: projectCacheKey(projectId) },
      ],
    }],
  }));

  return { deleted: true, sync };
}

export async function getAddressRecordQuarryCache(store, addressRaw) {
  const address = normalizeAddress(addressRaw);
  if (!address) throw new Error('address is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  return parseSnapshotJson(snapshot, addressCacheKey(address));
}

export async function saveAddressRecordQuarryCache(store, addressRaw, payload) {
  const address = normalizeAddress(addressRaw);
  if (!address) throw new Error('address is required.');
  validateCachePayload(payload);

  const record = {
    schemaVersion: '1.0.0',
    address,
    lookup: payload.lookup,
    selection: payload.selection || null,
    savedAt: nowIso(),
  };

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: addressCacheKey(address), value: JSON.stringify(record) },
      ],
    }],
  }));

  return { cache: record, sync: result };
}

export async function deleteAddressRecordQuarryCache(store, addressRaw) {
  const address = normalizeAddress(addressRaw);
  if (!address) throw new Error('address is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, addressCacheKey(address));
  if (!existing) return null;

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: addressCacheKey(address) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
