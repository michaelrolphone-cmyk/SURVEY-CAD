import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectArchivePlan, createProjectFile, DEFAULT_PROJECT_FILE_FOLDERS, PROJECT_FILE_FOLDERS } from '../src/project-file.js';

test('createProjectFile builds symbolic folder indexes for SurveyFoundry archive output', () => {
  const projectFile = createProjectFile({
    projectId: 'project-123',
    projectName: 'Eagle Estates',
    client: 'Ada County',
    address: '100 Main St, Boise',
    resources: [
      {
        folder: 'cpfs',
        title: 'CP&F Instrument 2019-12345',
        reference: {
          type: 'instrument-number',
          value: '2019-12345',
          resolverHint: 'lookup-cpf-pdf',
        },
      },
      {
        folder: 'point-files',
        title: 'Boundary control points',
        exportFormat: 'csv',
        reference: {
          type: 'pointforge-set',
          value: 'point-set-77',
          resolverHint: 'pointforge-export-csv',
        },
      },
    ],
  });

  assert.equal(projectFile.project.id, 'project-123');
  assert.equal(projectFile.archive.type, 'zip');
  assert.match(projectFile.archive.rootFolderName, /^eagle-estates-project-123$/);

  const cpfFolder = projectFile.folders.find((folder) => folder.key === 'cpfs');
  assert.equal(cpfFolder.index.length, 1);
  assert.equal(cpfFolder.index[0].reference.value, '2019-12345');

  const pointsFolder = projectFile.folders.find((folder) => folder.key === 'point-files');
  assert.equal(pointsFolder.index.length, 1);
  assert.equal(pointsFolder.index[0].reference.type, 'pointforge-set');
});

test('buildProjectArchivePlan compiles resolver-based references into archive entries', async () => {
  const projectFile = createProjectFile({
    projectId: 'project-999',
    projectName: 'Compass Survey',
    resources: [
      {
        id: 'cpf-1',
        folder: 'cpfs',
        title: 'CP&F Instrument',
        reference: {
          type: 'instrument-number',
          value: 'INST-42',
        },
      },
      {
        id: 'points-1',
        folder: 'point-files',
        title: 'PointForge set',
        reference: {
          type: 'pointforge-set',
          value: 'set-42',
        },
      },
      {
        id: 'drawing-1',
        folder: 'drawings',
        title: 'Unresolved drawing',
        reference: {
          type: 'linesmith-drawing',
          value: 'drawing-1',
        },
      },
    ],
  });

  const plan = await buildProjectArchivePlan(projectFile, {
    resolvers: {
      'instrument-number': async (item) => ({
        files: [{ name: `${item.reference.value}.pdf`, contentType: 'application/pdf' }],
      }),
      'pointforge-set': async (item) => ({
        files: [{ name: `${item.reference.value}.csv`, contentType: 'text/csv' }],
      }),
    },
  });

  assert.equal(plan.archiveName, 'compass-survey.zip');
  assert.ok(plan.entries.some((entry) => entry.path.endsWith('/project-file.json')));
  assert.ok(plan.entries.some((entry) => entry.path.endsWith('/CP&Fs/INST-42.pdf')));
  assert.ok(plan.entries.some((entry) => entry.path.endsWith('/Point Files/set-42.csv')));
  assert.equal(plan.unresolved.length, 1);
  assert.match(plan.unresolved[0].reason, /No resolver configured/);
});


test('createProjectFile places Drawings first and sorts drawing resources by latest save time', () => {
  const projectFile = createProjectFile({
    projectId: 'project-order',
    projectName: 'Order Test',
    resources: [
      {
        id: 'drawing-older',
        folder: 'drawings',
        title: 'Older drawing',
        reference: {
          type: 'local-storage',
          value: 'drawing:older',
          metadata: {
            latestSavedAt: '2025-01-01T00:00:00.000Z',
          },
        },
      },
      {
        id: 'drawing-newer',
        folder: 'drawings',
        title: 'Newer drawing',
        reference: {
          type: 'local-storage',
          value: 'drawing:newer',
          metadata: {
            latestSavedAt: '2025-02-01T00:00:00.000Z',
          },
        },
      },
      {
        id: 'cpf-1',
        folder: 'cpfs',
        title: 'CP&F',
        reference: {
          type: 'instrument-number',
          value: '2019-1',
        },
      },
    ],
  });

  assert.equal(projectFile.folders[0].key, 'drawings');

  const drawingsFolder = projectFile.folders.find((folder) => folder.key === 'drawings');
  assert.deepEqual(drawingsFolder.index.map((entry) => entry.id), ['drawing-newer', 'drawing-older']);
});

test('default project folders list Plats before RoS for EvidenceDesk navigation', () => {
  const keys = DEFAULT_PROJECT_FILE_FOLDERS.map((folder) => folder.key);
  assert.ok(keys.indexOf('plats') !== -1, 'default folders should include plats');
  assert.ok(keys.indexOf('ros') !== -1, 'default folders should include ros');
  assert.ok(keys.indexOf('plats') < keys.indexOf('ros'), 'Plats should appear above RoS in default folder order');
});
test('DEFAULT_PROJECT_FILE_FOLDERS exports the same built-in folder list as PROJECT_FILE_FOLDERS', () => {
  assert.ok(Array.isArray(DEFAULT_PROJECT_FILE_FOLDERS), 'DEFAULT_PROJECT_FILE_FOLDERS should be an array');
  assert.ok(DEFAULT_PROJECT_FILE_FOLDERS.length > 0, 'DEFAULT_PROJECT_FILE_FOLDERS should not be empty');
  assert.strictEqual(DEFAULT_PROJECT_FILE_FOLDERS, PROJECT_FILE_FOLDERS, 'DEFAULT_PROJECT_FILE_FOLDERS should be the same reference as PROJECT_FILE_FOLDERS');

  const keys = DEFAULT_PROJECT_FILE_FOLDERS.map((f) => f.key);
  assert.ok(keys.includes('drawings'), 'default folders should include drawings');
  assert.ok(keys.includes('point-files'), 'default folders should include point-files');
  assert.ok(keys.includes('other'), 'default folders should include other');
  for (const folder of DEFAULT_PROJECT_FILE_FOLDERS) {
    assert.ok(folder.key, 'each default folder should have a key');
    assert.ok(folder.label, 'each default folder should have a label');
    assert.ok(folder.defaultFormat, 'each default folder should have a defaultFormat');
  }
});

test('buildProjectArchivePlan generates nested folder paths for subfolders', async () => {
  const projectFile = {
    archive: { rootFolderName: 'test-project' },
    project: { name: 'Test Project' },
    folders: [
      {
        key: 'drawings',
        label: 'Drawings',
        index: [],
      },
      {
        key: 'archive',
        label: 'Archive',
        parentKey: 'drawings',
        index: [
          {
            id: 'old-1',
            reference: { type: 'instrument-number', value: 'OLD-001' },
          },
        ],
      },
    ],
  };

  const plan = await buildProjectArchivePlan(projectFile, {
    resolvers: {
      'instrument-number': async (item) => ({
        files: [{ name: `${item.reference.value}.pdf`, contentType: 'application/pdf' }],
      }),
    },
  });

  assert.ok(plan.entries.some((e) => e.path === 'test-project/Drawings/index.json'), 'top-level folder should have simple path');
  assert.ok(plan.entries.some((e) => e.path === 'test-project/Drawings/Archive/index.json'), 'subfolder index should include parent label in path');
  assert.ok(plan.entries.some((e) => e.path === 'test-project/Drawings/Archive/OLD-001.pdf'), 'subfolder file should include full nested path');
});
