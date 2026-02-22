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

function slugifyFolderKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const MAX_FOLDER_DEPTH = 5;

export function getFolderDepth(projectFile, folderKey) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey) return 0;
  let depth = 1;
  let currentKey = folderKey;
  const visited = new Set();
  while (true) {
    if (visited.has(currentKey)) break;
    visited.add(currentKey);
    const folder = projectFile.folders.find((f) => f.key === currentKey);
    if (!folder || !folder.parentKey) break;
    depth += 1;
    currentKey = folder.parentKey;
  }
  return depth;
}

export function getFolderChildren(projectFile, folderKey) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey) return [];
  return projectFile.folders.filter((f) => f.parentKey === folderKey);
}

export function addCustomFolder(projectFile, { label, description = '', defaultFormat = 'bin', parentKey = null } = {}) {
  if (!projectFile || !Array.isArray(projectFile.folders)) return null;
  const trimmedLabel = String(label || '').trim();
  if (!trimmedLabel) return null;

  if (parentKey) {
    const parentFolder = projectFile.folders.find((f) => f.key === parentKey);
    if (!parentFolder) return null;
    const parentDepth = getFolderDepth(projectFile, parentKey);
    if (parentDepth >= MAX_FOLDER_DEPTH) return null;
  }

  const baseKey = slugifyFolderKey(trimmedLabel) || 'custom';
  let key = baseKey;
  let attempt = 1;
  while (projectFile.folders.some((f) => f.key === key)) {
    key = `${baseKey}-${attempt}`;
    attempt += 1;
  }

  const folder = {
    key,
    label: trimmedLabel,
    description: String(description || '').trim(),
    defaultFormat: String(defaultFormat || 'bin').trim() || 'bin',
    index: [],
    custom: true,
  };
  if (parentKey) folder.parentKey = parentKey;
  projectFile.folders.push(folder);
  return folder;
}

export function removeCustomFolder(projectFile, folderKey) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !folderKey) return false;
  const folderIndex = projectFile.folders.findIndex((f) => f.key === folderKey);
  if (folderIndex < 0) return false;
  const folder = projectFile.folders[folderIndex];
  if (!folder.custom) return false;
  if (Array.isArray(folder.index) && folder.index.length > 0) return false;
  if (projectFile.folders.some((f) => f.parentKey === folderKey)) return false;
  projectFile.folders.splice(folderIndex, 1);
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

export function moveResourceById(projectFile, sourceFolderKey, targetFolderKey, resourceId) {
  if (!projectFile || !Array.isArray(projectFile.folders) || !sourceFolderKey || !targetFolderKey || !resourceId) return false;
  if (sourceFolderKey === targetFolderKey) return true;

  const sourceFolder = projectFile.folders.find((entry) => entry.key === sourceFolderKey);
  const targetFolder = projectFile.folders.find((entry) => entry.key === targetFolderKey);
  if (!sourceFolder || !targetFolder || !Array.isArray(sourceFolder.index)) return false;
  if (!Array.isArray(targetFolder.index)) targetFolder.index = [];

  const sourceIndex = sourceFolder.index.findIndex((entry) => entry?.id === resourceId);
  if (sourceIndex < 0) return false;

  const [resource] = sourceFolder.index.splice(sourceIndex, 1);
  if (resource && typeof resource === 'object') {
    resource.folder = targetFolderKey;
  }
  targetFolder.index.push(resource);
  return true;
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
      const north = toFiniteNumber(fields[1]);
      const east = toFiniteNumber(fields[2]);
      links.push({
        pointFileTitle: pointFile?.title || pointFile?.id || 'Point File',
        pointNumber: pointNumber || '(unknown)',
        pointCode: pointCode || '(none)',
        north: north != null ? north : undefined,
        east: east != null ? east : undefined,
      });
    }
  }
  return links;
}

function toFiniteNumber(value) {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Cluster radius in feet (state plane or local N/E units). CP&Fs within this distance are grouped by corner. */
export const CPF_CORNER_GROUP_RADIUS_FEET = 33;

/**
 * Returns corner designation label from normalized section coordinates (0–1).
 * Used when section frame is available (e.g. from section geometry).
 * @param {number} normX - East–west in section (0 = west, 1 = east)
 * @param {number} normY - North–south in section (0 = south, 1 = north)
 * @param {number} nodeTol - Tolerance to snap to grid (default 0.08)
 * @returns {string} Label such as "Section corner", "Center of section", "North quarter corner", etc.
 */
export function aliquotCornerLabelFromNormXY(normX, normY, nodeTol = 0.08) {
  const GRID = [0, 0.25, 0.5, 0.75, 1];
  function nearestGrid(val) {
    let best = GRID[0];
    let bestD = Infinity;
    for (const g of GRID) {
      const d = Math.abs(val - g);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return { g: best, d: bestD };
  }
  const nx = nearestGrid(normX);
  const ny = nearestGrid(normY);
  if (nx.d > nodeTol || ny.d > nodeTol) return 'Corner';
  const gx = nx.g;
  const gy = ny.g;
  if (Math.abs(gx - 0.5) <= nodeTol && Math.abs(gy - 0.5) <= nodeTol) return 'Center of section';
  const xEdge = gx === 0 || gx === 1;
  const yEdge = gy === 0 || gy === 1;
  if (xEdge && yEdge) return 'Section corner';
  if (gx === 0.5 && yEdge) return gy === 1 ? 'North quarter corner' : 'South quarter corner';
  if (gy === 0.5 && xEdge) return gx === 1 ? 'East quarter corner' : 'West quarter corner';
  return 'Sixteenth corner';
}

/**
 * Attempts to derive a corner designation from CP&F aliquot text (e.g. NWNW, C, N2).
 * The parser is intentionally conservative and only emits labels when every aliquot agrees.
 * @param {string[]|undefined} aliquots
 * @returns {string|null}
 */
export function cornerDesignationFromAliquots(aliquots) {
  if (!Array.isArray(aliquots) || !aliquots.length) return null;

  const normalized = aliquots
    .map((value) => String(value || '').trim().toUpperCase().replace(/[^NSEWC]/g, ''))
    .filter(Boolean);
  if (!normalized.length) return null;

  const unique = new Set(normalized);
  if (unique.size !== 1) return null;
  const token = normalized[0];

  if (token === 'C') return 'Center of section';
  if (token.length === 1) {
    const map = { N: 'North quarter corner', S: 'South quarter corner', E: 'East quarter corner', W: 'West quarter corner' };
    return map[token] || null;
  }

  if (token.length === 2 && ((token.includes('N') || token.includes('S')) && (token.includes('E') || token.includes('W')))) {
    return 'Section corner';
  }

  if (token.length >= 3 && token.length <= 4) return 'Sixteenth corner';
  return null;
}

/**
 * Group CP&F entries by representative coordinates within radiusFeet.
 * Each entry gets a representative (north, east) from its first linked point with coordinates.
 * @param {Array<{ entry: object, north: number|undefined, east: number|undefined }>} entriesWithCoords
 * @param {number} radiusFeet
 * @returns {Array<{ north: number, east: number, entries: object[], label: string }>}
 */
export function groupCpfsByCorner(entriesWithCoords, radiusFeet = CPF_CORNER_GROUP_RADIUS_FEET) {
  const radiusSq = radiusFeet * radiusFeet;
  function distSq(n1, e1, n2, e2) {
    const dn = n1 - n2;
    const de = e1 - e2;
    return dn * dn + de * de;
  }

  const withCoords = entriesWithCoords.filter((e) => e.north != null && e.east != null && Number.isFinite(e.north) && Number.isFinite(e.east));
  const withoutCoords = entriesWithCoords.filter((e) => e.north == null || e.east == null || !Number.isFinite(e.north) || !Number.isFinite(e.east));

  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < withCoords.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [withCoords[i]];
    assigned.add(i);
    let changed = true;
    while (changed) {
      changed = false;
      const cenN = cluster.reduce((s, x) => s + x.north, 0) / cluster.length;
      const cenE = cluster.reduce((s, x) => s + x.east, 0) / cluster.length;
      for (let j = 0; j < withCoords.length; j++) {
        if (assigned.has(j)) continue;
        const c = withCoords[j];
        if (distSq(cenN, cenE, c.north, c.east) <= radiusSq) {
          cluster.push(c);
          assigned.add(j);
          changed = true;
        }
      }
    }
    const avgN = cluster.reduce((s, x) => s + x.north, 0) / cluster.length;
    const avgE = cluster.reduce((s, x) => s + x.east, 0) / cluster.length;
    const designationVotes = cluster
      .map((item) => cornerDesignationFromAliquots(item?.entry?.reference?.metadata?.aliquots))
      .filter(Boolean);
    const uniqueDesignations = new Set(designationVotes);
    const designation = uniqueDesignations.size === 1 ? designationVotes[0] : null;
    groups.push({
      north: avgN,
      east: avgE,
      entries: cluster.map((c) => c.entry),
      label: designation
        ? `${designation} (N ${avgN.toFixed(0)}, E ${avgE.toFixed(0)})`
        : `Corner at N ${avgN.toFixed(0)}, E ${avgE.toFixed(0)}`,
    });
  }

  if (withoutCoords.length) {
    groups.push({
      north: NaN,
      east: NaN,
      entries: withoutCoords.map((c) => c.entry),
      label: 'No linked location',
    });
  }

  groups.sort((a, b) => {
    if (Number.isNaN(a.north) || Number.isNaN(a.east)) return 1;
    if (Number.isNaN(b.north) || Number.isNaN(b.east)) return -1;
    if (Math.abs(a.north - b.north) > 0.5) return a.north - b.north;
    return a.east - b.east;
  });
  return groups;
}
