const PROJECTS_KEY = 'surveyfoundryProjects';
const DELETED_PROJECTS_KEY = 'surveyfoundryDeletedProjects';
const TOMBSTONE_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function nowIso() {
  return new Date().toISOString();
}

function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function parseJsonArray(snapshot = {}, key = '') {
  const raw = snapshot[key];
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(snapshot = {}, key = '') {
  const raw = snapshot[key];
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const PROJECT_STATUS_SEQUENCE = [
  'Proposed',
  'Researched',
  'Calculated',
  'Tied',
  'Drafted',
  'Pin Set',
  'Final Drafted',
  'Submitted',
  'Recorded',
  'Billed',
  'Paid',
  'Archived',
];

function normalizeProject(project = {}) {
  const knownStatus = PROJECT_STATUS_SEQUENCE.includes(project?.status) ? project.status : 'Proposed';
  const tsr = String(project?.tsr || project?.townshipRange || '').trim();
  const section = String(project?.section || project?.sections?.[0] || '').trim();
  return {
    id: String(project.id || '').trim(),
    name: String(project.name || '').trim(),
    client: String(project.client || '').trim(),
    clientContact: String(project.clientContact || '').trim(),
    billingRate: String(project.billingRate || '').trim(),
    address: String(project.address || '').trim(),
    tsr,
    section,
    sections: section ? [section] : Array.isArray(project?.sections) ? project.sections : [],
    description: String(project.description || '').trim(),
    townshipRange: String(project.townshipRange || tsr || '').trim(),
    aliquotLabel: String(project.aliquotLabel || '').trim(),
    plssDescription: String(project.plssDescription || '').trim(),
    surveyIndex: String(project.surveyIndex || '').trim(),
    manualPlssOverride: Boolean(project.manualPlssOverride),
    status: knownStatus,
    createdAt: project.createdAt || nowIso(),
    updatedAt: project.updatedAt || nowIso(),
  };
}

function buildProjectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    client: project.client,
    address: project.address,
    status: project.status,
    tsr: project.tsr,
    section: project.section,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function listProjects(store) {
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const projects = parseJsonArray(snapshot, PROJECTS_KEY);
  const tombstones = parseJsonObject(snapshot, DELETED_PROJECTS_KEY);
  return projects
    .filter((p) => p && typeof p === 'object' && p.id && !tombstones[String(p.id)])
    .map((p) => buildProjectSummary(normalizeProject(p)));
}

export async function getProject(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const projects = parseJsonArray(snapshot, PROJECTS_KEY);
  const tombstones = parseJsonObject(snapshot, DELETED_PROJECTS_KEY);
  if (tombstones[projectId]) return null;
  const project = projects.find((p) => p && String(p.id) === projectId);
  return project ? normalizeProject(project) : null;
}

export async function createProject(store, data = {}) {
  const projectId = data.id || `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = nowIso();
  const project = normalizeProject({
    ...data,
    id: projectId,
    createdAt: now,
    updatedAt: now,
  });
  if (!project.name) throw new Error('name is required.');
  if (!project.address) throw new Error('address is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const projects = parseJsonArray(snapshot, PROJECTS_KEY);
  projects.unshift(project);

  const result = await Promise.resolve(store.applyDifferential({
    operations: [{ type: 'set', key: PROJECTS_KEY, value: JSON.stringify(projects) }],
    baseChecksum: state.checksum,
  }));

  return { project, created: true, sync: result };
}

export async function updateProject(store, projectIdRaw, data = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const projects = parseJsonArray(snapshot, PROJECTS_KEY);
  const idx = projects.findIndex((p) => p && String(p.id) === projectId);
  if (idx === -1) return null;

  const existing = projects[idx];
  const merged = {
    ...existing,
    ...data,
    id: projectId, // prevent id override
    updatedAt: nowIso(),
  };
  projects[idx] = normalizeProject(merged);

  const result = await Promise.resolve(store.applyDifferential({
    operations: [{ type: 'set', key: PROJECTS_KEY, value: JSON.stringify(projects) }],
    baseChecksum: state.checksum,
  }));

  return { project: projects[idx], sync: result };
}

export async function deleteProject(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const projects = parseJsonArray(snapshot, PROJECTS_KEY);
  const idx = projects.findIndex((p) => p && String(p.id) === projectId);
  if (idx === -1) return null;

  const removed = projects.splice(idx, 1)[0];

  // add tombstone
  const tombstones = parseJsonObject(snapshot, DELETED_PROJECTS_KEY);
  tombstones[projectId] = Date.now();
  // prune old tombstones
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  for (const [id, ts] of Object.entries(tombstones)) {
    if (typeof ts === 'number' && ts < cutoff) delete tombstones[id];
  }

  const result = await Promise.resolve(store.applyDifferential({
    operations: [
      { type: 'set', key: PROJECTS_KEY, value: JSON.stringify(projects) },
      { type: 'set', key: DELETED_PROJECTS_KEY, value: JSON.stringify(tombstones) },
    ],
    baseChecksum: state.checksum,
  }));

  return { project: removed, sync: result };
}

export { PROJECTS_KEY, DELETED_PROJECTS_KEY, PROJECT_STATUS_SEQUENCE };
