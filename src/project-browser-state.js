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

export function appendResourceToFolder(projectFile, folderKey, resource) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey || !resource) return false;
  const folder = projectFile.folders.find((f) => f.key === folderKey);
  if (!folder) return false;
  if (!Array.isArray(folder.index)) folder.index = [];
  folder.index.push(resource);
  return true;
}

export function removeResourceById(projectFile, folderKey, resourceId) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey || !resourceId) return false;
  const folder = projectFile.folders.find((entry) => entry.key === folderKey);
  if (!folder || !Array.isArray(folder.index)) return false;
  const before = folder.index.length;
  folder.index = folder.index.filter((entry) => entry?.id !== resourceId);
  return folder.index.length !== before;
}

export function renameResourceTitle(projectFile, folderKey, resourceId, nextTitle) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey || !resourceId) return false;
  const title = String(nextTitle || '').trim();
  if (!title) return false;

  const folder = projectFile.folders.find((entry) => entry.key === folderKey);
  if (!folder || !Array.isArray(folder.index)) return false;

  const resource = folder.index.find((entry) => entry?.id === resourceId);
  if (!resource) return false;

  resource.title = title;
  if (resource?.reference?.metadata && typeof resource.reference.metadata === 'object') {
    resource.reference.metadata.fileName = title;
  }
  return true;
}

function parseCsvLine(line = '') {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function extractCpfInstrumentsFromPointNote(note = '') {
  const match = String(note).match(/CPNFS:\s*([^\r\n]+)/i);
  if (!match) return [];
  return match[1]
    .split('...')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export function findCpfPointLinks(projectFile, storage, instrument) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !storage || !instrument) return [];
  const pointFolder = projectFile.folders.find((folder) => folder.key === 'point-files');
  if (!pointFolder || !Array.isArray(pointFolder.index)) return [];

  const target = String(instrument).trim().toLowerCase();
  if (!target) return [];

  const links = [];
  for (const pointFile of pointFolder.index) {
    const storageKey = pointFile?.reference?.value;
    if (!storageKey) continue;
    let text = '';
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      text = String(parsed?.text || '');
    } catch {
      continue;
    }
    if (!text.trim()) continue;

    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const fields = parseCsvLine(lines[lineIndex]);
      const pointNumber = String(fields[0] || '').trim();
      const pointCode = String(fields[4] || '').trim();
      const note = String(fields[5] || '').trim();
      const instruments = extractCpfInstrumentsFromPointNote(note);
      if (!instruments.some((value) => value.toLowerCase() === target)) continue;
      links.push({
        pointFileTitle: pointFile?.title || pointFile?.id || 'Point File',
        pointNumber: pointNumber || '(unknown)',
        pointCode: pointCode || '(none)',
      });
    }
  }
  return links;
}

export async function findCpfPointLinksAsync(projectFile, resolveText, instrument) {
  if (!projectFile || !Array.isArray(projectFile.folders) || typeof resolveText !== 'function' || !instrument) return [];
  const pointFolder = projectFile.folders.find((folder) => folder.key === 'point-files');
  if (!pointFolder || !Array.isArray(pointFolder.index)) return [];

  const target = String(instrument).trim().toLowerCase();
  if (!target) return [];

  const links = [];
  for (const pointFile of pointFolder.index) {
    let text = '';
    try {
      text = String(await resolveText(pointFile) || '');
    } catch {
      continue;
    }
    if (!text.trim()) continue;

    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const fields = parseCsvLine(lines[lineIndex]);
      const pointNumber = String(fields[0] || '').trim();
      const pointCode = String(fields[4] || '').trim();
      const note = String(fields[5] || '').trim();
      const instruments = extractCpfInstrumentsFromPointNote(note);
      if (!instruments.some((value) => value.toLowerCase() === target)) continue;
      links.push({
        pointFileTitle: pointFile?.title || pointFile?.id || 'Point File',
        pointNumber: pointNumber || '(unknown)',
        pointCode: pointCode || '(none)',
      });
    }
  }
  return links;
}
