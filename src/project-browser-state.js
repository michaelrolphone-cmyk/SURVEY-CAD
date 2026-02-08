export const PROJECT_FILE_STORAGE_PREFIX = 'surveyfoundryProjectFile';
export const PROJECT_POINT_FILE_STORAGE_PREFIX = 'surveyfoundryPointFile';

function projectFileStorageKey(projectId) {
  return `${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`;
}

function normalizeSlug(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function loadStoredProjectFile(storage, projectId) {
  if (!storage || !projectId) return null;
  try {
    const raw = storage.getItem(projectFileStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.folders)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredProjectFile(storage, projectId, projectFile) {
  if (!storage || !projectId || !projectFile || !Array.isArray(projectFile.folders)) return false;
  try {
    storage.setItem(projectFileStorageKey(projectId), JSON.stringify(projectFile));
    return true;
  } catch {
    return false;
  }
}

export function buildPointFileUploadRecord({ projectId, fileName, text, now = Date.now() } = {}) {
  if (!projectId || !fileName || typeof text !== 'string') return null;
  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const cleanedName = String(fileName).trim() || 'point-file.csv';
  const extensionMatch = cleanedName.match(/\.([a-z0-9]+)$/i);
  const normalizedExtension = extensionMatch ? extensionMatch[1].toLowerCase() : 'csv';
  const exportFormat = normalizedExtension === 'txt' ? 'csv' : normalizedExtension;
  const baseId = normalizeSlug(cleanedName, 'point-file');
  const resourceId = `${baseId}-${now}`;
  const storageKey = `${PROJECT_POINT_FILE_STORAGE_PREFIX}:${projectId}:${resourceId}`;

  return {
    storageKey,
    payload: {
      text: trimmedText,
      name: cleanedName,
      createdAt: new Date(now).toISOString(),
    },
    resource: {
      id: resourceId,
      folder: 'point-files',
      title: cleanedName,
      exportFormat,
      reference: {
        type: 'local-storage',
        value: storageKey,
        resolverHint: 'project-browser-upload',
        metadata: {
          fileName: cleanedName,
        },
      },
    },
  };
}

export function appendPointFileResource(projectFile, resource) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !resource) return false;
  const pointFolder = projectFile.folders.find((folder) => folder.key === 'point-files');
  if (!pointFolder) return false;
  if (!Array.isArray(pointFolder.index)) pointFolder.index = [];
  pointFolder.index.push(resource);
  return true;
}
