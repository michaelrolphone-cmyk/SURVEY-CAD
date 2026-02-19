function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const FIELD_TO_FINISH_KEY = 'linesmith:field-to-finish:global';

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

function normalizeSymbolSvgOverrides(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const overrides = {};
  for (const [symbolName, symbolFile] of Object.entries(source)) {
    const key = String(symbolName || '').trim().toUpperCase();
    const value = String(symbolFile || '').trim();
    if (!key || !value) continue;
    overrides[key] = value;
  }
  return overrides;
}

function assertValidConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('config must be a JSON object.');
  }
  if (!Array.isArray(config.columns) || !Array.isArray(config.rules)) {
    throw new Error('config.columns and config.rules are required arrays.');
  }
}

function nowIso() {
  return new Date().toISOString();
}

export async function getFieldToFinishSettings(store) {
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  return parseSnapshotJson(snapshot, FIELD_TO_FINISH_KEY);
}

export async function upsertFieldToFinishSettings(store, payload = {}) {
  const config = clone(payload.config);
  assertValidConfig(config);

  const existing = await getFieldToFinishSettings(store);
  const timestamp = nowIso();
  const record = {
    schemaVersion: '1.0.0',
    id: 'global',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    config,
    symbolSvgOverrides: normalizeSymbolSvgOverrides(payload.symbolSvgOverrides),
  };

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [{
        type: 'set',
        key: FIELD_TO_FINISH_KEY,
        value: JSON.stringify(record),
      }],
    }],
  }));

  return { settings: record, sync, created: !existing };
}

export async function clearFieldToFinishSettings(store) {
  const existing = await getFieldToFinishSettings(store);
  if (!existing) return null;

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [{ type: 'remove', key: FIELD_TO_FINISH_KEY }],
    }],
  }));

  return { deleted: true, sync };
}
