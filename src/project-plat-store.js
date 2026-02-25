function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizePlatId(platId = '') {
  return String(platId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSubdivisionName(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizePlatMetadata(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function platKey(projectId, platId) {
  return `project:plat:${projectId}:${platId}`;
}

function platIndexKey(projectId) {
  return `project:plat-index:${projectId}`;
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

function slugifySubdivision(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function derivePlatId(subdivisionName = '', fallback = '') {
  const slug = slugifySubdivision(subdivisionName);
  return slug || normalizePlatId(fallback || `plat-${Date.now()}`);
}

function buildPlatSummary(record) {
  return {
    platId: record.platId,
    subdivisionName: record.subdivisionName,
    title: record.title,
    source: record.source || null,
    platUrl: record.platUrl || null,
    thumbnailUrl: record.thumbnailUrl || null,
    metadata: normalizePlatMetadata(record.metadata, null),
    starredInFieldBook: Boolean(record.starredInFieldBook),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortPlatSummaries(items = []) {
  items.sort((a, b) => {
    const aTs = Date.parse(a?.updatedAt || '') || 0;
    const bTs = Date.parse(b?.updatedAt || '') || 0;
    return bTs - aTs;
  });
  return items;
}

export async function listProjectPlats(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, platIndexKey(projectId)) || {};
  const items = Object.values(index).filter((entry) => entry && typeof entry === 'object');
  return sortPlatSummaries(items);
}

export async function getProjectPlat(store, projectIdRaw, platIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const platId = normalizePlatId(platIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!platId) throw new Error('platId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const record = parseSnapshotJson(snapshot, platKey(projectId, platId));
  return record || null;
}

export async function createOrUpdateProjectPlat(store, {
  projectId: projectIdRaw,
  platId: platIdRaw,
  subdivisionName: subdivisionNameRaw,
  title,
  source,
  platUrl,
  thumbnailUrl,
  metadata,
  starredInFieldBook,
} = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  const subdivisionName = normalizeSubdivisionName(subdivisionNameRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!subdivisionName) throw new Error('subdivisionName is required.');

  const platId = normalizePlatId(platIdRaw) || derivePlatId(subdivisionName);
  if (!platId) throw new Error('platId could not be derived.');

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, platKey(projectId, platId));
  const index = parseSnapshotJson(snapshot, platIndexKey(projectId)) || {};

  const record = {
    schemaVersion: '1.0.0',
    projectId,
    platId,
    subdivisionName,
    title: String(title || subdivisionName).trim(),
    source: source || existing?.source || null,
    platUrl: String(platUrl || existing?.platUrl || '').trim() || null,
    thumbnailUrl: String(thumbnailUrl || existing?.thumbnailUrl || '').trim() || null,
    metadata: normalizePlatMetadata(metadata, normalizePlatMetadata(existing?.metadata, null)),
    starredInFieldBook: typeof starredInFieldBook === 'boolean' ? starredInFieldBook : Boolean(existing?.starredInFieldBook),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  index[platId] = buildPlatSummary(record);

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: platKey(projectId, platId), value: JSON.stringify(record) },
        { type: 'set', key: platIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { plat: record, sync: result, created: !existing };
}

export async function batchUpsertProjectPlats(store, projectIdRaw, entries = []) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!Array.isArray(entries) || !entries.length) return { plats: [], sync: null };

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, platIndexKey(projectId)) || {};

  const operations = [];
  const savedPlats = [];

  for (const entry of entries) {
    const subdivisionName = normalizeSubdivisionName(entry?.subdivisionName);
    if (!subdivisionName) continue;

    const platId = normalizePlatId(entry?.platId) || derivePlatId(subdivisionName);
    if (!platId) continue;

    const existing = parseSnapshotJson(snapshot, platKey(projectId, platId));
    const record = {
      schemaVersion: '1.0.0',
      projectId,
      platId,
      subdivisionName,
      title: String(entry?.title || subdivisionName).trim(),
      source: entry?.source || existing?.source || null,
      platUrl: String(entry?.platUrl || existing?.platUrl || '').trim() || null,
      thumbnailUrl: String(entry?.thumbnailUrl || existing?.thumbnailUrl || '').trim() || null,
      metadata: normalizePlatMetadata(entry?.metadata, normalizePlatMetadata(existing?.metadata, null)),
      starredInFieldBook: typeof entry?.starredInFieldBook === 'boolean'
        ? entry.starredInFieldBook
        : Boolean(existing?.starredInFieldBook),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    index[platId] = buildPlatSummary(record);
    operations.push({ type: 'set', key: platKey(projectId, platId), value: JSON.stringify(record) });
    savedPlats.push(record);
  }

  if (!operations.length) return { plats: [], sync: null };

  operations.push({ type: 'set', key: platIndexKey(projectId), value: JSON.stringify(index) });

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{ operations }],
  }));

  return { plats: savedPlats, sync: result };
}

export async function deleteProjectPlat(store, projectIdRaw, platIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const platId = normalizePlatId(platIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!platId) throw new Error('platId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, platKey(projectId, platId));
  if (!existing) return false;

  const index = parseSnapshotJson(snapshot, platIndexKey(projectId)) || {};
  delete index[platId];

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: platKey(projectId, platId) },
        { type: 'set', key: platIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
