function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizeRosId(rosId = '') {
  const slug = String(rosId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function normalizeRosNumber(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function rosKey(projectId, rosId) {
  return `project:ros:${projectId}:${rosId}`;
}

function rosIndexKey(projectId) {
  return `project:ros-index:${projectId}`;
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

function slugifyRosNumber(rosNumber = '') {
  return String(rosNumber || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveRosId(rosNumber = '', fallback = '') {
  const slug = slugifyRosNumber(rosNumber);
  return slug || normalizeRosId(fallback || `ros-${Date.now()}`);
}

function buildRosSummary(record) {
  return {
    rosId: record.rosId,
    rosNumber: record.rosNumber,
    title: record.title,
    source: record.source || null,
    mapImageUrl: record.mapImageUrl || null,
    starredInFieldBook: Boolean(record.starredInFieldBook),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortRosSummaries(items = []) {
  items.sort((a, b) => {
    const aTs = Date.parse(a?.updatedAt || '') || 0;
    const bTs = Date.parse(b?.updatedAt || '') || 0;
    return bTs - aTs;
  });
  return items;
}

export async function listProjectRos(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, rosIndexKey(projectId)) || {};
  const items = Object.values(index).filter((entry) => entry && typeof entry === 'object');
  return sortRosSummaries(items);
}

export async function getProjectRos(store, projectIdRaw, rosIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const rosId = normalizeRosId(rosIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!rosId) throw new Error('rosId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const record = parseSnapshotJson(snapshot, rosKey(projectId, rosId));
  return record || null;
}

export async function createOrUpdateProjectRos(store, {
  projectId: projectIdRaw,
  rosId: rosIdRaw,
  rosNumber: rosNumberRaw,
  title,
  source,
  mapImageUrl,
  starredInFieldBook,
} = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  const rosNumber = normalizeRosNumber(rosNumberRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!rosNumber) throw new Error('rosNumber is required.');

  const rosId = normalizeRosId(rosIdRaw) || deriveRosId(rosNumber);
  if (!rosId) throw new Error('rosId could not be derived.');

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, rosKey(projectId, rosId));
  const index = parseSnapshotJson(snapshot, rosIndexKey(projectId)) || {};

  const record = {
    schemaVersion: '1.0.0',
    projectId,
    rosId,
    rosNumber,
    title: String(title || `ROS ${rosNumber}`).trim(),
    source: source || existing?.source || null,
    mapImageUrl: mapImageUrl || existing?.mapImageUrl || null,
    starredInFieldBook: typeof starredInFieldBook === 'boolean' ? starredInFieldBook : Boolean(existing?.starredInFieldBook),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  index[rosId] = buildRosSummary(record);

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: rosKey(projectId, rosId), value: JSON.stringify(record) },
        { type: 'set', key: rosIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { ros: record, sync: result, created: !existing };
}

export async function batchUpsertProjectRos(store, projectIdRaw, entries = []) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!Array.isArray(entries) || !entries.length) return { ros: [], sync: null };

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, rosIndexKey(projectId)) || {};

  const operations = [];
  const savedRos = [];

  for (const entry of entries) {
    const rosNumber = normalizeRosNumber(entry?.rosNumber);
    if (!rosNumber) continue;

    const rosId = normalizeRosId(entry?.rosId) || deriveRosId(rosNumber);
    if (!rosId) continue;

    const existing = parseSnapshotJson(snapshot, rosKey(projectId, rosId));
    const record = {
      schemaVersion: '1.0.0',
      projectId,
      rosId,
      rosNumber,
      title: String(entry?.title || `ROS ${rosNumber}`).trim(),
      source: entry?.source || existing?.source || null,
      mapImageUrl: entry?.mapImageUrl || existing?.mapImageUrl || null,
      starredInFieldBook: typeof entry?.starredInFieldBook === 'boolean'
        ? entry.starredInFieldBook
        : Boolean(existing?.starredInFieldBook),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    index[rosId] = buildRosSummary(record);
    operations.push({ type: 'set', key: rosKey(projectId, rosId), value: JSON.stringify(record) });
    savedRos.push(record);
  }

  if (!operations.length) return { ros: [], sync: null };

  operations.push({ type: 'set', key: rosIndexKey(projectId), value: JSON.stringify(index) });

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{ operations }],
  }));

  return { ros: savedRos, sync: result };
}

export async function deleteProjectRos(store, projectIdRaw, rosIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const rosId = normalizeRosId(rosIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!rosId) throw new Error('rosId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, rosKey(projectId, rosId));
  if (!existing) return false;

  const index = parseSnapshotJson(snapshot, rosIndexKey(projectId)) || {};
  delete index[rosId];

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: rosKey(projectId, rosId) },
        { type: 'set', key: rosIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
