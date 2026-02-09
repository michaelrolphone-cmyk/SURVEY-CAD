import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectArchivePlan, createProjectFile } from '../src/project-file.js';

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
