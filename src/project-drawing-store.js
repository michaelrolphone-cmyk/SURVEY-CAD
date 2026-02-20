function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function diffDrawingState(previous, next) {
  if (Object.is(previous, next)) return undefined;
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return deepClone(next);
    const out = [];
    let changed = false;
    for (let i = 0; i < next.length; i += 1) {
      const child = diffDrawingState(previous[i], next[i]);
      if (child === undefined) {
        out[i] = { __unchanged: true };
        continue;
      }
      out[i] = child;
      changed = true;
    }
    return changed ? out : undefined;
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    const out = {};
    let changed = false;
    for (const key of keys) {
      if (!(key in next)) {
        out[key] = { __deleted: true };
        changed = true;
        continue;
      }
      const child = diffDrawingState(previous[key], next[key]);
      if (child !== undefined) {
        out[key] = child;
        changed = true;
      }
    }
    return changed ? out : undefined;
  }

  return deepClone(next);
}

export function applyDrawingStateDiff(base, diff) {
  if (diff === undefined) return deepClone(base);
  if (Array.isArray(diff)) {
    const source = Array.isArray(base) ? base : [];
    return diff.map((part, index) => applyDrawingStateDiff(source[index], part));
  }
  if (isPlainObject(diff)) {
    if (diff.__unchanged) return deepClone(base);
    if (diff.__deleted) return undefined;
    const source = isPlainObject(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(source), ...Object.keys(diff)]);
    for (const key of keys) {
      if (!(key in diff)) {
        out[key] = deepClone(source[key]);
        continue;
      }
      const merged = applyDrawingStateDiff(source[key], diff[key]);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  return deepClone(diff);
}

function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizeDrawingId(drawingId = '') {
  const slug = String(drawingId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function drawingKey(projectId, drawingId) {
  return `linesmith:drawing:${projectId}:${drawingId}`;
}

function drawingIndexKey(projectId) {
  return `linesmith:drawing-index:${projectId}`;
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

function normalizeDrawingName(name = '') {
  const value = String(name || '').trim();
  return value || 'Untitled Drawing';
}

function nowIso() {
  return new Date().toISOString();
}

function buildDrawingSummary(record) {
  return {
    drawingId: record.drawingId,
    drawingName: record.drawingName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    latestVersionId: record.versions?.[record.versions.length - 1]?.versionId || null,
    versionCount: Array.isArray(record.versions) ? record.versions.length : 0,
    latestMapGeoreference: record.latestMapGeoreference || null,
    linkedPointFileProjectId: record.linkedPointFileProjectId || null,
    linkedPointFileId: record.linkedPointFileId || null,
    linkedPointFileName: record.linkedPointFileName || null,
  };
}

function sortDrawingSummaries(drawings = []) {
  drawings.sort((a, b) => {
    const aTs = Date.parse(a?.updatedAt || '') || 0;
    const bTs = Date.parse(b?.updatedAt || '') || 0;
    return bTs - aTs;
  });
  return drawings;
}

function materializeDrawingVersion(record, versionIndex = -1) {
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
    throw new Error('drawingState must be a JSON object.');
  }
}

export async function listProjectDrawings(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, drawingIndexKey(projectId)) || {};
  const drawings = Object.values(index).filter((entry) => entry && typeof entry === 'object');
  return sortDrawingSummaries(drawings);
}

export async function getProjectDrawing(store, projectIdRaw, drawingIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const drawingId = normalizeDrawingId(drawingIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!drawingId) throw new Error('drawingId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const record = parseSnapshotJson(snapshot, drawingKey(projectId, drawingId));
  if (!record) return null;

  return {
    ...record,
    currentState: materializeDrawingVersion(record, -1),
  };
}

export async function createOrUpdateProjectDrawing(store, {
  projectId: projectIdRaw,
  drawingId: drawingIdRaw,
  drawingName,
  drawingState,
  pointFileLink,
} = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  const drawingId = normalizeDrawingId(drawingIdRaw || drawingName || `drawing-${Date.now()}`);
  if (!projectId) throw new Error('projectId is required.');
  if (!drawingId) throw new Error('drawingId is required.');
  assertValidState(drawingState);

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, drawingKey(projectId, drawingId));
  const index = parseSnapshotJson(snapshot, drawingIndexKey(projectId)) || {};

  let record;
  const normalizedPointFileLink = pointFileLink && typeof pointFileLink === 'object' && !Array.isArray(pointFileLink)
    ? {
      projectId: normalizeProjectId(pointFileLink.projectId || projectId),
      pointFileId: String(pointFileLink.pointFileId || '').trim(),
      pointFileName: String(pointFileLink.pointFileName || '').trim(),
    }
    : null;
  const hasExplicitPointFileLink = normalizedPointFileLink && normalizedPointFileLink.projectId && normalizedPointFileLink.pointFileId;

  if (!existing?.versions?.length) {
    record = {
      schemaVersion: '1.0.0',
      projectId,
      drawingId,
      drawingName: normalizeDrawingName(drawingName || drawingId),
      createdAt: now,
      updatedAt: now,
      latestMapGeoreference: drawingState.mapGeoreference || null,
      linkedPointFileProjectId: hasExplicitPointFileLink ? normalizedPointFileLink.projectId : null,
      linkedPointFileId: hasExplicitPointFileLink ? normalizedPointFileLink.pointFileId : null,
      linkedPointFileName: hasExplicitPointFileLink ? normalizedPointFileLink.pointFileName || null : null,
      versions: [{
        versionId: `v-${Date.now()}`,
        savedAt: now,
        label: normalizeDrawingName(drawingName || drawingId),
        baseState: drawingState,
      }],
    };
  } else {
    const priorState = materializeDrawingVersion(existing, -1);
    const diffFromPrevious = diffDrawingState(priorState, drawingState);
    record = {
      ...existing,
      drawingName: normalizeDrawingName(drawingName || existing.drawingName || drawingId),
      updatedAt: now,
      latestMapGeoreference: drawingState.mapGeoreference || null,
      linkedPointFileProjectId: hasExplicitPointFileLink
        ? normalizedPointFileLink.projectId
        : (existing.linkedPointFileProjectId || null),
      linkedPointFileId: hasExplicitPointFileLink
        ? normalizedPointFileLink.pointFileId
        : (existing.linkedPointFileId || null),
      linkedPointFileName: hasExplicitPointFileLink
        ? (normalizedPointFileLink.pointFileName || null)
        : (existing.linkedPointFileName || null),
      versions: [...existing.versions],
    };
    record.versions.push({
      versionId: `v-${Date.now()}`,
      savedAt: now,
      label: record.drawingName,
      diffFromPrevious: diffFromPrevious === undefined ? {} : diffFromPrevious,
    });
  }

  index[drawingId] = buildDrawingSummary(record);

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: drawingKey(projectId, drawingId), value: JSON.stringify(record) },
        { type: 'set', key: drawingIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return {
    drawing: {
      ...record,
      currentState: materializeDrawingVersion(record, -1),
    },
    sync: result,
    created: !existing,
  };
}

export async function deleteProjectDrawing(store, projectIdRaw, drawingIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const drawingId = normalizeDrawingId(drawingIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!drawingId) throw new Error('drawingId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, drawingKey(projectId, drawingId));
  if (!existing) return false;
  const index = parseSnapshotJson(snapshot, drawingIndexKey(projectId)) || {};
  delete index[drawingId];

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: drawingKey(projectId, drawingId) },
        { type: 'set', key: drawingIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
