import { diffDrawingState, applyDrawingStateDiff } from './project-drawing-store.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizePointFileId(pointFileId = '') {
  const slug = String(pointFileId || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function pointFileKey(projectId, pointFileId) {
  return `project:point-file:${projectId}:${pointFileId}`;
}

function pointFileIndexKey(projectId) {
  return `project:point-file-index:${projectId}`;
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

function normalizePointFileName(name = '') {
  const value = String(name || '').trim();
  return value || 'Untitled Point File.csv';
}

function normalizeExportFormat(format = '') {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized === 'txt') return 'csv';
  return normalized || 'csv';
}

function nowIso() {
  return new Date().toISOString();
}

function buildPointFileSummary(record) {
  return {
    pointFileId: record.pointFileId,
    pointFileName: record.pointFileName,
    exportFormat: record.exportFormat || 'csv',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    latestVersionId: record.versions?.[record.versions.length - 1]?.versionId || null,
    versionCount: Array.isArray(record.versions) ? record.versions.length : 0,
    source: record.source || null,
    sourceLabel: record.sourceLabel || null,
  };
}

function sortPointFileSummaries(files = []) {
  files.sort((a, b) => {
    const aTs = Date.parse(a?.updatedAt || '') || 0;
    const bTs = Date.parse(b?.updatedAt || '') || 0;
    return bTs - aTs;
  });
  return files;
}

function materializePointFileState(record, versionIndex = -1) {
  if (!record?.versions?.length) return null;
  const targetIndex = versionIndex >= 0 ? Math.min(versionIndex, record.versions.length - 1) : record.versions.length - 1;
  let state = deepClone(record.versions[0]?.baseState || null);
  if (!state) return null;
  for (let i = 1; i <= targetIndex; i += 1) {
    state = applyDrawingStateDiff(state, record.versions[i]?.diffFromPrevious);
  }
  return state;
}

function assertValidState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('pointFileState must be a JSON object.');
  }
  if (!String(state.text || '').trim()) {
    throw new Error('pointFileState.text is required.');
  }
}

export async function listProjectPointFiles(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, pointFileIndexKey(projectId)) || {};
  const pointFiles = Object.values(index).filter((entry) => entry && typeof entry === 'object');
  return sortPointFileSummaries(pointFiles);
}

export async function getProjectPointFile(store, projectIdRaw, pointFileIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const pointFileId = normalizePointFileId(pointFileIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!pointFileId) throw new Error('pointFileId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const record = parseSnapshotJson(snapshot, pointFileKey(projectId, pointFileId));
  if (!record) return null;

  return {
    ...record,
    currentState: materializePointFileState(record, -1),
  };
}

export async function createOrUpdateProjectPointFile(store, {
  projectId: projectIdRaw,
  pointFileId: pointFileIdRaw,
  pointFileName,
  pointFileState,
  source,
  sourceLabel,
} = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  const pointFileId = normalizePointFileId(pointFileIdRaw || pointFileName || `point-file-${Date.now()}`);
  if (!projectId) throw new Error('projectId is required.');
  if (!pointFileId) throw new Error('pointFileId is required.');
  assertValidState(pointFileState);

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, pointFileKey(projectId, pointFileId));
  const index = parseSnapshotJson(snapshot, pointFileIndexKey(projectId)) || {};

  let record;
  if (!existing?.versions?.length) {
    record = {
      schemaVersion: '1.0.0',
      projectId,
      pointFileId,
      pointFileName: normalizePointFileName(pointFileName || pointFileId),
      exportFormat: normalizeExportFormat(pointFileState.exportFormat),
      source: source || null,
      sourceLabel: sourceLabel || null,
      createdAt: now,
      updatedAt: now,
      versions: [{
        versionId: `v-${Date.now()}`,
        savedAt: now,
        label: normalizePointFileName(pointFileName || pointFileId),
        baseState: pointFileState,
      }],
    };
  } else {
    const priorState = materializePointFileState(existing, -1);
    const diffFromPrevious = diffDrawingState(priorState, pointFileState);
    record = {
      ...existing,
      pointFileName: normalizePointFileName(pointFileName || existing.pointFileName || pointFileId),
      exportFormat: normalizeExportFormat(pointFileState.exportFormat || existing.exportFormat),
      source: source || existing.source || null,
      sourceLabel: sourceLabel || existing.sourceLabel || null,
      updatedAt: now,
      versions: [...existing.versions],
    };
    record.versions.push({
      versionId: `v-${Date.now()}`,
      savedAt: now,
      label: record.pointFileName,
      diffFromPrevious: diffFromPrevious === undefined ? {} : diffFromPrevious,
    });
  }

  index[pointFileId] = buildPointFileSummary(record);

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: pointFileKey(projectId, pointFileId), value: JSON.stringify(record) },
        { type: 'set', key: pointFileIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return {
    pointFile: {
      ...record,
      currentState: materializePointFileState(record, -1),
    },
    sync: result,
    created: !existing,
  };
}

export async function deleteProjectPointFile(store, projectIdRaw, pointFileIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const pointFileId = normalizePointFileId(pointFileIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!pointFileId) throw new Error('pointFileId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, pointFileKey(projectId, pointFileId));
  if (!existing) return false;
  const index = parseSnapshotJson(snapshot, pointFileIndexKey(projectId)) || {};
  delete index[pointFileId];

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: pointFileKey(projectId, pointFileId) },
        { type: 'set', key: pointFileIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
