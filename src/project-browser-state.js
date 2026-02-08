export const PROJECT_FILE_STORAGE_PREFIX = 'surveyfoundryProjectFile';

function projectFileStorageKey(projectId) {
  return `${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`;
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
