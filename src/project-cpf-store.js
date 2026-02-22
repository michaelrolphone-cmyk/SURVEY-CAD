function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function normalizeCpfId(cpfId = '') {
  const slug = String(cpfId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function normalizeInstrumentNumber(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function cpfKey(projectId, cpfId) {
  return `project:cpf:${projectId}:${cpfId}`;
}

function cpfIndexKey(projectId) {
  return `project:cpf-index:${projectId}`;
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

function slugifyInstrument(instrument = '') {
  return String(instrument || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveCpfId(instrument = '', fallback = '') {
  const slug = slugifyInstrument(instrument);
  return slug || normalizeCpfId(fallback || `cpf-${Date.now()}`);
}

function buildCpfSummary(record) {
  return {
    cpfId: record.cpfId,
    instrument: record.instrument,
    title: record.title,
    source: record.source || null,
    aliquots: Array.isArray(record.aliquots) ? record.aliquots : [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortCpfSummaries(cpfs = []) {
  cpfs.sort((a, b) => {
    const aTs = Date.parse(a?.updatedAt || '') || 0;
    const bTs = Date.parse(b?.updatedAt || '') || 0;
    return bTs - aTs;
  });
  return cpfs;
}

export async function listProjectCpfs(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, cpfIndexKey(projectId)) || {};
  const cpfs = Object.values(index).filter((entry) => entry && typeof entry === 'object');
  return sortCpfSummaries(cpfs);
}

export async function getProjectCpf(store, projectIdRaw, cpfIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const cpfId = normalizeCpfId(cpfIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!cpfId) throw new Error('cpfId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const record = parseSnapshotJson(snapshot, cpfKey(projectId, cpfId));
  return record || null;
}

export async function createOrUpdateProjectCpf(store, {
  projectId: projectIdRaw,
  cpfId: cpfIdRaw,
  instrument: instrumentRaw,
  title,
  source,
  aliquots,
} = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  const instrument = normalizeInstrumentNumber(instrumentRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!instrument) throw new Error('instrument is required.');

  const cpfId = normalizeCpfId(cpfIdRaw) || deriveCpfId(instrument);
  if (!cpfId) throw new Error('cpfId could not be derived.');

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, cpfKey(projectId, cpfId));
  const index = parseSnapshotJson(snapshot, cpfIndexKey(projectId)) || {};

  const record = {
    schemaVersion: '1.0.0',
    projectId,
    cpfId,
    instrument,
    title: String(title || `CP&F ${instrument}`).trim(),
    source: source || existing?.source || null,
    aliquots: Array.isArray(aliquots) ? aliquots.map((v) => String(v || '').trim()).filter(Boolean)
      : (existing?.aliquots || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  index[cpfId] = buildCpfSummary(record);

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'set', key: cpfKey(projectId, cpfId), value: JSON.stringify(record) },
        { type: 'set', key: cpfIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { cpf: record, sync: result, created: !existing };
}

export async function batchUpsertProjectCpfs(store, projectIdRaw, entries = []) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!Array.isArray(entries) || !entries.length) return { cpfs: [], sync: null };

  const now = nowIso();
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const index = parseSnapshotJson(snapshot, cpfIndexKey(projectId)) || {};

  const operations = [];
  const savedCpfs = [];

  for (const entry of entries) {
    const instrument = normalizeInstrumentNumber(entry?.instrument);
    if (!instrument) continue;

    const cpfId = normalizeCpfId(entry?.cpfId) || deriveCpfId(instrument);
    if (!cpfId) continue;

    const existing = parseSnapshotJson(snapshot, cpfKey(projectId, cpfId));
    const record = {
      schemaVersion: '1.0.0',
      projectId,
      cpfId,
      instrument,
      title: String(entry?.title || `CP&F ${instrument}`).trim(),
      source: entry?.source || existing?.source || null,
      aliquots: Array.isArray(entry?.aliquots)
        ? entry.aliquots.map((v) => String(v || '').trim()).filter(Boolean)
        : (existing?.aliquots || []),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    index[cpfId] = buildCpfSummary(record);
    operations.push({ type: 'set', key: cpfKey(projectId, cpfId), value: JSON.stringify(record) });
    savedCpfs.push(record);
  }

  if (!operations.length) return { cpfs: [], sync: null };

  operations.push({ type: 'set', key: cpfIndexKey(projectId), value: JSON.stringify(index) });

  const result = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{ operations }],
  }));

  return { cpfs: savedCpfs, sync: result };
}

export async function deleteProjectCpf(store, projectIdRaw, cpfIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  const cpfId = normalizeCpfId(cpfIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  if (!cpfId) throw new Error('cpfId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const existing = parseSnapshotJson(snapshot, cpfKey(projectId, cpfId));
  if (!existing) return false;

  const index = parseSnapshotJson(snapshot, cpfIndexKey(projectId)) || {};
  delete index[cpfId];

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [
        { type: 'remove', key: cpfKey(projectId, cpfId) },
        { type: 'set', key: cpfIndexKey(projectId), value: JSON.stringify(index) },
      ],
    }],
  }));

  return { deleted: true, sync };
}
