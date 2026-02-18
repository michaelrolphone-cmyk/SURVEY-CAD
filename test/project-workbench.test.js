import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import {
  getProjectWorkbenchLink,
  setProjectWorkbenchLink,
  clearProjectWorkbenchLink,
  collectProjectWorkbenchSources,
  syncProjectSourcesToCasefile,
  listProjectTraverses,
  upsertProjectTraverseRecord,
} from '../src/project-workbench.js';

function createMockStore(initialSnapshot = {}) {
  const state = { snapshot: { ...initialSnapshot }, version: 1, checksum: 'mock' };
  return {
    getState() {
      return state;
    },
    async applyDifferentialBatch({ diffs = [] } = {}) {
      const allOperations = [];
      for (const diff of diffs) {
        for (const operation of diff.operations || []) {
          allOperations.push(operation);
          if (operation.type === 'set') state.snapshot[operation.key] = operation.value;
          if (operation.type === 'remove') delete state.snapshot[operation.key];
        }
      }
      state.version += 1;
      state.checksum = `mock-${state.version}`;
      return { allOperations, state: { version: state.version, checksum: state.checksum } };
    },
  };
}

test('project workbench link CRUD stores mapping in localstorage sync snapshot', async () => {
  const store = createMockStore();

  const linked = await setProjectWorkbenchLink(store, 'proj-1', 'cf-123');
  assert.equal(linked.link.projectId, 'proj-1');
  assert.equal(linked.link.casefileId, 'cf-123');

  const loaded = await getProjectWorkbenchLink(store, 'proj-1');
  assert.equal(loaded.casefileId, 'cf-123');

  const cleared = await clearProjectWorkbenchLink(store, 'proj-1');
  assert.equal(cleared.deleted, true);

  const missing = await getProjectWorkbenchLink(store, 'proj-1');
  assert.equal(missing, null);
});

test('collectProjectWorkbenchSources derives drawing, point-file, and uploaded evidence sources', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'project-workbench-'));
  const uploadsDir = path.join(tempRoot, 'uploads');
  const projectId = 'demo-project';
  await mkdir(path.join(uploadsDir, projectId, 'deeds'), { recursive: true });
  await writeFile(path.join(uploadsDir, projectId, 'deeds', '123-demo-deed.pdf'), 'pdf');

  const store = createMockStore({
    [`linesmith:drawing-index:${projectId}`]: JSON.stringify({
      boundary: {
        drawingId: 'boundary',
        drawingName: 'Boundary Sketch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        latestVersionId: 'v1',
        versionCount: 1,
      },
    }),
    [`project:point-file-index:${projectId}`]: JSON.stringify({
      topo: {
        pointFileId: 'topo',
        pointFileName: 'Topo.csv',
        exportFormat: 'csv',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        latestVersionId: 'v1',
        versionCount: 1,
        source: 'pointforge-transformer',
        sourceLabel: 'PointForge Export',
      },
    }),
  });

  const sources = await collectProjectWorkbenchSources(store, projectId, {
    uploadsDir,
    validFolderKeys: new Set(['deeds', 'ros', 'cpfs', 'plats', 'point-files']),
  });

  assert.ok(sources.some((entry) => entry.sourceKey === 'drawing:boundary'));
  assert.ok(sources.some((entry) => entry.sourceKey === 'point-file:topo'));
  assert.ok(sources.some((entry) => entry.sourceKey === 'upload:deeds:123-demo-deed.pdf'));

  await rm(tempRoot, { recursive: true, force: true });
});

test('syncProjectSourcesToCasefile creates, updates, and removes project-derived evidence records', async () => {
  const evidenceState = [
    {
      id: 'ev-old',
      type: 'Other',
      title: 'Old Drawing',
      source: 'LineSmith drawing',
      notes: 'old',
      tags: ['project-derived', 'project-source:drawing:boundary'],
    },
    {
      id: 'ev-remove',
      type: 'Other',
      title: 'Removed',
      source: 'LineSmith drawing',
      notes: 'remove',
      tags: ['project-derived', 'project-source:drawing:stale'],
    },
  ];

  const created = [];
  const updated = [];
  const deleted = [];

  const bewStore = {
    async listEvidence() {
      return { items: evidenceState.slice(), limit: 500, offset: 0, total: evidenceState.length };
    },
    async createEvidence(_casefileId, body) {
      created.push(body);
    },
    async updateEvidence(_casefileId, evidenceId, body) {
      updated.push({ evidenceId, body });
    },
    async deleteEvidence(_casefileId, evidenceId) {
      deleted.push(evidenceId);
    },
  };

  const summary = await syncProjectSourcesToCasefile(bewStore, 'cf-1', 'project-1', [
    { sourceKey: 'drawing:boundary', sourceType: 'drawing', title: 'Boundary Sketch v2' },
    { sourceKey: 'point-file:topo', sourceType: 'point-file', title: 'Topo.csv', sourceLabel: 'PointForge Export' },
  ]);

  assert.equal(summary.created, 1);
  assert.equal(summary.updated, 1);
  assert.equal(summary.deleted, 1);
  assert.equal(created.length, 1);
  assert.equal(updated.length, 1);
  assert.deepEqual(deleted, ['ev-remove']);
});



test('project traverse registry lists and upserts named traverses per project', async () => {
  const store = createMockStore();

  const first = await upsertProjectTraverseRecord(store, 'proj-1', {
    traverseId: 'trav-1',
    casefileId: 'cf-1',
    name: 'Boundary Loop A',
  });
  assert.equal(first.traverse?.name, 'Boundary Loop A');

  const updated = await upsertProjectTraverseRecord(store, 'proj-1', {
    traverseId: 'trav-1',
    casefileId: 'cf-1',
    name: 'Boundary Loop A Updated',
  });
  assert.equal(updated.traverse?.name, 'Boundary Loop A Updated');

  await upsertProjectTraverseRecord(store, 'proj-1', {
    traverseId: 'trav-2',
    casefileId: 'cf-2',
    name: 'Boundary Loop B',
  });

  const traverses = await listProjectTraverses(store, 'proj-1');
  assert.equal(traverses.length, 2);
  assert.ok(traverses.some((entry) => entry.traverseId === 'trav-1' && entry.name === 'Boundary Loop A Updated'));
  assert.ok(traverses.some((entry) => entry.traverseId === 'trav-2' && entry.name === 'Boundary Loop B'));
});
