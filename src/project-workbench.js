import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { listProjectDrawings } from './project-drawing-store.js';
import { listProjectPointFiles } from './project-point-file-store.js';

const PROJECTS_STORAGE_KEY = 'surveyfoundryProjects';

function normalizeProjectId(projectId = '') {
  return String(projectId || '').trim();
}

function projectWorkbenchLinkKey(projectId) {
  return `workbench:project-link:${projectId}`;
}

function projectWorkbenchTraverseIndexKey(projectId) {
  return `workbench:project-traverses:${projectId}`;
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

function normalizeTraverseName(name = '') {
  return String(name || '').trim();
}

function normalizeTraverseIndexEntry(entry = {}) {
  const traverseId = String(entry?.traverseId || '').trim();
  const casefileId = String(entry?.casefileId || '').trim();
  const name = normalizeTraverseName(entry?.name || entry?.traverseName || 'Untitled Traverse');
  if (!traverseId || !casefileId || !name) return null;

  const createdAt = String(entry?.createdAt || nowIso());
  const updatedAt = String(entry?.updatedAt || createdAt || nowIso());
  return { traverseId, casefileId, name, createdAt, updatedAt };
}

function mapUploadFolderToEvidenceType(folderKey = '') {
  const mapping = {
    deeds: 'Deed',
    plats: 'Plat',
    ros: 'ROS',
    cpfs: 'Corner Record',
    'point-files': 'Field Notes',
  };
  return mapping[folderKey] || 'Other';
}

function mapProjectSourceTypeToEvidenceType(sourceType = '') {
  const mapping = {
    drawing: 'Other',
    'point-file': 'Field Notes',
  };
  return mapping[sourceType] || 'Other';
}

function buildEvidencePayloadFromSource(projectId, source = {}) {
  const sourceKey = String(source.sourceKey || '').trim();
  const title = String(source.title || source.sourceLabel || source.sourceKey || 'Project Evidence').trim();
  const type = source.type || mapProjectSourceTypeToEvidenceType(source.sourceType);
  const sourceLabel = String(source.sourceLabel || source.downloadUrl || source.referenceUrl || sourceKey).trim();
  const notes = [
    `Derived from project ${projectId}.`,
    source.detail ? String(source.detail) : '',
    source.downloadUrl ? `Download: ${source.downloadUrl}` : '',
    source.referenceUrl ? `Reference: ${source.referenceUrl}` : '',
  ].filter(Boolean).join('\n');

  return {
    sourceKey,
    evidence: {
      type,
      title,
      source: sourceLabel,
      notes,
      tags: [
        `project:${projectId}`,
        `project-source:${sourceKey}`,
        'project-derived',
      ],
    },
  };
}

export async function getProjectWorkbenchLink(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  return parseSnapshotJson(snapshot, projectWorkbenchLinkKey(projectId));
}

export async function setProjectWorkbenchLink(store, projectIdRaw, casefileId) {
  const projectId = normalizeProjectId(projectIdRaw);
  const linkedCasefileId = String(casefileId || '').trim();
  if (!projectId) throw new Error('projectId is required.');
  if (!linkedCasefileId) throw new Error('casefileId is required.');

  const existing = await getProjectWorkbenchLink(store, projectId);
  const linkedAt = existing?.linkedAt || nowIso();
  const next = {
    projectId,
    casefileId: linkedCasefileId,
    linkedAt,
    updatedAt: nowIso(),
    lastSyncedAt: existing?.lastSyncedAt || null,
  };

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [{ type: 'set', key: projectWorkbenchLinkKey(projectId), value: JSON.stringify(next) }],
    }],
  }));

  return { link: next, sync };
}

export async function clearProjectWorkbenchLink(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const existing = await getProjectWorkbenchLink(store, projectId);
  if (!existing) return { deleted: false, sync: null };

  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [{ type: 'remove', key: projectWorkbenchLinkKey(projectId) }],
    }],
  }));

  return { deleted: true, sync };
}

export async function getProjectMetadata(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};

  const projects = (() => {
    try {
      const raw = snapshot[PROJECTS_STORAGE_KEY];
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const match = projects.find((project) => project?.id === projectId) || null;
  return {
    id: projectId,
    name: String(match?.name || projectId),
    address: String(match?.address || ''),
    county: String(match?.county || ''),
    state: String(match?.state || ''),
    notes: String(match?.notes || ''),
  };
}

export async function listProjectTraverses(store, projectIdRaw) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');
  const state = await Promise.resolve(store.getState());
  const snapshot = state?.snapshot || {};
  const parsed = parseSnapshotJson(snapshot, projectWorkbenchTraverseIndexKey(projectId));
  const items = Array.isArray(parsed?.items)
    ? parsed.items.map((item) => normalizeTraverseIndexEntry(item)).filter(Boolean)
    : [];
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function upsertProjectTraverseRecord(store, projectIdRaw, entry = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const normalized = normalizeTraverseIndexEntry({
    ...entry,
    traverseId: entry?.traverseId || entry?.casefileId,
  });
  if (!normalized) throw new Error('traverseId, casefileId, and name are required.');

  const existing = await listProjectTraverses(store, projectId);
  const updatedAt = nowIso();
  let createdAt = updatedAt;

  const items = existing.map((item) => {
    if (item.traverseId !== normalized.traverseId) return item;
    createdAt = item.createdAt || updatedAt;
    return {
      ...item,
      casefileId: normalized.casefileId,
      name: normalized.name,
      updatedAt,
    };
  });

  if (!items.some((item) => item.traverseId === normalized.traverseId)) {
    items.push({
      traverseId: normalized.traverseId,
      casefileId: normalized.casefileId,
      name: normalized.name,
      createdAt,
      updatedAt,
    });
  }

  const payload = { items };
  const sync = await Promise.resolve(store.applyDifferentialBatch({
    diffs: [{
      operations: [{
        type: 'set',
        key: projectWorkbenchTraverseIndexKey(projectId),
        value: JSON.stringify(payload),
      }],
    }],
  }));

  const traverse = items.find((item) => item.traverseId === normalized.traverseId) || null;
  return { traverse, traverses: items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), sync };
}

async function collectUploadedProjectFiles(projectId, { uploadsDir, validFolderKeys = new Set() } = {}) {
  const projectDir = path.join(uploadsDir, projectId);
  const sources = [];
  try {
    const folders = await readdir(projectDir, { withFileTypes: true });
    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      if (validFolderKeys.size && !validFolderKeys.has(folder.name)) continue;
      const files = await readdir(path.join(projectDir, folder.name));
      for (const fileName of files) {
        const safeName = path.basename(fileName);
        const referenceUrl = `/api/project-files/download?projectId=${encodeURIComponent(projectId)}&folderKey=${encodeURIComponent(folder.name)}&fileName=${encodeURIComponent(safeName)}`;
        sources.push({
          sourceKey: `upload:${folder.name}:${safeName}`,
          sourceType: 'upload',
          type: mapUploadFolderToEvidenceType(folder.name),
          title: safeName.replace(/^\d+-/, ''),
          sourceLabel: `Project upload (${folder.name})`,
          referenceUrl,
          detail: `Folder: ${folder.name}`,
        });
      }
    }
  } catch {
    return [];
  }
  return sources;
}

function collectDrawingSources(projectId, drawings = []) {
  return drawings.map((drawing) => ({
    sourceKey: `drawing:${drawing.drawingId}`,
    sourceType: 'drawing',
    type: 'Other',
    title: drawing.drawingName || drawing.drawingId,
    sourceLabel: 'LineSmith drawing',
    detail: `Drawing ID: ${drawing.drawingId}`,
    referenceUrl: `/api/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(drawing.drawingId)}`,
  }));
}

function collectPointFileSources(projectId, pointFiles = []) {
  return pointFiles.map((pointFile) => ({
    sourceKey: `point-file:${pointFile.pointFileId}`,
    sourceType: 'point-file',
    type: 'Field Notes',
    title: pointFile.pointFileName || pointFile.pointFileId,
    sourceLabel: pointFile.sourceLabel || pointFile.source || 'PointForge point file',
    detail: `Point file ID: ${pointFile.pointFileId}`,
    referenceUrl: `/api/projects/${encodeURIComponent(projectId)}/point-files/${encodeURIComponent(pointFile.pointFileId)}`,
  }));
}

export async function collectProjectWorkbenchSources(store, projectIdRaw, { uploadsDir, validFolderKeys } = {}) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const [drawings, pointFiles, uploadedFiles] = await Promise.all([
    listProjectDrawings(store, projectId),
    listProjectPointFiles(store, projectId),
    collectUploadedProjectFiles(projectId, { uploadsDir, validFolderKeys }),
  ]);

  return [
    ...collectDrawingSources(projectId, drawings),
    ...collectPointFileSources(projectId, pointFiles),
    ...uploadedFiles,
  ];
}

export async function syncProjectSourcesToCasefile(bewStore, casefileId, projectIdRaw, sources = []) {
  const projectId = normalizeProjectId(projectIdRaw);
  if (!projectId) throw new Error('projectId is required.');

  const existing = await bewStore.listEvidence(casefileId, { limit: 500, offset: 0 });
  const existingDerived = new Map();
  for (const evidence of existing.items || []) {
    const tag = (evidence.tags || []).find((candidate) => String(candidate).startsWith('project-source:'));
    if (!tag) continue;
    existingDerived.set(tag.slice('project-source:'.length), evidence);
  }

  const nextSources = new Map();
  for (const source of sources) {
    const normalized = buildEvidencePayloadFromSource(projectId, source);
    if (!normalized.sourceKey) continue;
    nextSources.set(normalized.sourceKey, normalized.evidence);
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const [sourceKey, evidencePayload] of nextSources.entries()) {
    const existingEvidence = existingDerived.get(sourceKey);
    if (!existingEvidence) {
      await bewStore.createEvidence(casefileId, evidencePayload);
      created += 1;
      continue;
    }

    const nextSignature = JSON.stringify({
      type: evidencePayload.type,
      title: evidencePayload.title,
      source: evidencePayload.source,
      notes: evidencePayload.notes,
    });
    const currentSignature = JSON.stringify({
      type: existingEvidence.type,
      title: existingEvidence.title,
      source: existingEvidence.source,
      notes: existingEvidence.notes,
    });
    if (nextSignature !== currentSignature) {
      await bewStore.updateEvidence(casefileId, existingEvidence.id, evidencePayload);
      updated += 1;
    }
  }

  for (const [sourceKey, evidence] of existingDerived.entries()) {
    if (nextSources.has(sourceKey)) continue;
    await bewStore.deleteEvidence(casefileId, evidence.id);
    deleted += 1;
  }

  return {
    created,
    updated,
    deleted,
    totalSources: nextSources.size,
  };
}
