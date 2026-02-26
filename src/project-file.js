const PROJECT_FILE_SCHEMA_VERSION = '1.0.0';

export const DEFAULT_PROJECT_FILE_FOLDERS = [
  {
    key: 'drawings',
    label: 'Drawings',
    description: 'LineSmith drawing packages generated from linked point files.',
    defaultFormat: 'dxf',
  },
  {
    key: 'plats',
    label: 'Plats',
    description: 'Subdivision plats and plat-related exhibits.',
    defaultFormat: 'pdf',
  },
  {
    key: 'ros',
    label: 'RoS',
    description: 'Record of Survey source files and exports.',
    defaultFormat: 'pdf',
  },
  {
    key: 'cpfs',
    label: 'CP&Fs',
    description: 'Corner Perpetuation & Filing references resolved by instrument number.',
    defaultFormat: 'pdf',
  },
  {
    key: 'point-files',
    label: 'Point Files',
    description: 'PointForge-managed points exported as CSV.',
    defaultFormat: 'csv',
  },
  {
    key: 'deeds',
    label: 'Deeds',
    description: 'Deed references and exported documents.',
    defaultFormat: 'pdf',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'Billing artifacts and project invoices.',
    defaultFormat: 'pdf',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Future expansion area for additional project evidence types.',
    defaultFormat: 'bin',
  },
];

export const PROJECT_FILE_FOLDERS = DEFAULT_PROJECT_FILE_FOLDERS;

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function normalizeResource(resource, index) {
  const folder = PROJECT_FILE_FOLDERS.find((candidate) => candidate.key === resource.folder)
    ? resource.folder
    : 'other';
  const reference = resource.reference || {};
  return {
    id: resource.id || `resource-${index + 1}`,
    folder,
    title: resource.title || `Resource ${index + 1}`,
    exportFormat: resource.exportFormat || PROJECT_FILE_FOLDERS.find((candidate) => candidate.key === folder).defaultFormat,
    reference: {
      type: reference.type || 'external',
      value: reference.value ?? '',
      resolverHint: reference.resolverHint || null,
      metadata: reference.metadata || {},
    },
  };
}

function getDrawingLastSavedTime(resource) {
  const savedAt = resource?.reference?.metadata?.latestSavedAt || resource?.reference?.metadata?.savedAt;
  const parsed = Date.parse(savedAt || '');
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function createProjectFile({
  projectId,
  projectName,
  client,
  address,
  resources = [],
} = {}) {
  const resolvedProjectId = projectId || `project-${Date.now()}`;
  const normalizedResources = resources.map(normalizeResource);
  const rootFolderName = `${slugify(projectName, 'surveyfoundry-project')}-${slugify(resolvedProjectId, 'project')}`;

  return {
    schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    project: {
      id: resolvedProjectId,
      name: projectName || 'Untitled Project',
      client: client || '',
      address: address || '',
    },
    archive: {
      type: 'zip',
      rootFolderName,
    },
    folders: PROJECT_FILE_FOLDERS.map((folder) => ({
      key: folder.key,
      label: folder.label,
      description: folder.description,
      index: normalizedResources
        .filter((resource) => resource.folder === folder.key)
        .sort((a, b) => (folder.key === 'drawings'
          ? getDrawingLastSavedTime(b) - getDrawingLastSavedTime(a)
          : 0)),
    })),
  };
}

function buildFolderPathSegment(projectFile, folderKey) {
  const segments = [];
  const visited = new Set();
  let currentKey = folderKey;
  while (currentKey) {
    if (visited.has(currentKey)) break;
    visited.add(currentKey);
    const folder = (projectFile?.folders || []).find((f) => f.key === currentKey);
    if (!folder) break;
    segments.unshift(folder.label);
    currentKey = folder.parentKey || null;
  }
  return segments.join('/');
}

export async function buildProjectArchivePlan(projectFile, { resolvers = {} } = {}) {
  const entries = [];
  const unresolved = [];
  const root = projectFile?.archive?.rootFolderName || 'surveyfoundry-project';

  entries.push({
    path: `${root}/project-file.json`,
    source: {
      type: 'project-file-manifest',
      contentType: 'application/json',
    },
  });

  for (const folder of projectFile?.folders || []) {
    const folderPath = buildFolderPathSegment(projectFile, folder.key);
    entries.push({
      path: `${root}/${folderPath}/index.json`,
      source: {
        type: 'folder-index',
        folder: folder.key,
        contentType: 'application/json',
      },
    });

    for (const item of folder.index || []) {
      const resolver = resolvers[item.reference.type];
      if (!resolver) {
        unresolved.push({
          folder: folder.key,
          id: item.id,
          reason: `No resolver configured for reference type "${item.reference.type}".`,
          reference: item.reference,
        });
        continue;
      }

      const resolved = await resolver(item, folder, projectFile);
      const files = Array.isArray(resolved?.files) ? resolved.files : [];
      if (!files.length) {
        unresolved.push({
          folder: folder.key,
          id: item.id,
          reason: resolved?.reason || 'Resolver returned no files.',
          reference: item.reference,
        });
        continue;
      }

      for (const file of files) {
        entries.push({
          path: `${root}/${folderPath}/${file.name}`,
          source: {
            type: 'resolved-resource',
            folder: folder.key,
            id: item.id,
            reference: item.reference,
            contentType: file.contentType || 'application/octet-stream',
          },
        });
      }
    }
  }

  return {
    archiveName: `${slugify(projectFile?.project?.name, 'surveyfoundry-project')}.zip`,
    rootFolderName: root,
    entries,
    unresolved,
  };
}
