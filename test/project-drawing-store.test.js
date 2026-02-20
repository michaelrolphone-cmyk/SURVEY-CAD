import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';
import {
  diffDrawingState,
  applyDrawingStateDiff,
  createOrUpdateProjectDrawing,
  getProjectDrawing,
  listProjectDrawings,
  deleteProjectDrawing,
} from '../src/project-drawing-store.js';

test('drawing state diff/apply round trips nested objects and arrays', () => {
  const previous = {
    points: [{ num: '1', x: 100, y: 200, tags: ['pm'] }],
    meta: { title: 'A', scale: 20 },
  };
  const next = {
    points: [{ num: '1', x: 105, y: 200, tags: ['pm', 'gps'] }, { num: '2', x: 110, y: 220, tags: [] }],
    meta: { title: 'B' },
  };

  const diff = diffDrawingState(previous, next);
  const applied = applyDrawingStateDiff(previous, diff);
  assert.deepEqual(applied, next);
});

test('project drawing store CRUD persists versions and summaries in sync snapshot', async () => {
  const store = new LocalStorageSyncStore();

  const createResult = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingName: 'Boundary Base Map',
    drawingState: { points: [{ id: 'p-1', x: 10, y: 20 }], mapGeoreference: { scale: 200 } },
  });

  assert.equal(createResult.created, true);
  assert.equal(createResult.drawing.versions.length, 1);
  assert.equal(createResult.drawing.currentState.points[0].id, 'p-1');

  const updateResult = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingId: createResult.drawing.drawingId,
    drawingName: 'Boundary Base Map',
    drawingState: { points: [{ id: 'p-1', x: 11, y: 20 }, { id: 'p-2', x: 13, y: 24 }], mapGeoreference: { scale: 250 } },
  });

  assert.equal(updateResult.created, false);
  assert.equal(updateResult.drawing.versions.length, 2);
  assert.equal(updateResult.drawing.currentState.points.length, 2);

  const listed = await listProjectDrawings(store, 'project-a');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].versionCount, 2);

  const loaded = await getProjectDrawing(store, 'project-a', createResult.drawing.drawingId);
  assert.equal(loaded.currentState.points[0].x, 11);
  assert.equal(loaded.currentState.mapGeoreference.scale, 250);

  const deleted = await deleteProjectDrawing(store, 'project-a', createResult.drawing.drawingId);
  assert.equal(Boolean(deleted), true);

  const missing = await getProjectDrawing(store, 'project-a', createResult.drawing.drawingId);
  assert.equal(missing, null);
});

test('project drawing store persists linked point-file metadata in records and summaries', async () => {
  const store = new LocalStorageSyncStore();

  const createResult = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingName: 'Boundary Base Map',
    drawingState: { points: [{ id: '1', x: 10, y: 20 }] },
    pointFileLink: {
      projectId: 'project-a',
      pointFileId: 'boundary-points',
      pointFileName: 'Boundary Points.csv',
    },
  });

  assert.equal(createResult.drawing.linkedPointFileId, 'boundary-points');
  assert.equal(createResult.drawing.linkedPointFileProjectId, 'project-a');

  const listed = await listProjectDrawings(store, 'project-a');
  assert.equal(listed[0].linkedPointFileId, 'boundary-points');
  assert.equal(listed[0].linkedPointFileName, 'Boundary Points.csv');
});


test('project drawing store allows relinking and unlinking point files without resending drawing state', async () => {
  const store = new LocalStorageSyncStore();

  const created = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingName: 'Boundary Base Map',
    drawingState: { points: [{ id: '1', x: 10, y: 20 }] },
    pointFileLink: {
      pointFileId: 'boundary-points',
      pointFileName: 'Boundary Points.csv',
    },
  });

  const relinked = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingId: created.drawing.drawingId,
    pointFileLink: {
      pointFileId: 'relinked-points',
      pointFileName: 'Relinked Points.csv',
    },
  });
  assert.equal(relinked.drawing.linkedPointFileId, 'relinked-points');
  assert.equal(relinked.drawing.currentState.points[0].id, '1');

  const unlinked = await createOrUpdateProjectDrawing(store, {
    projectId: 'project-a',
    drawingId: created.drawing.drawingId,
    pointFileLink: null,
  });
  assert.equal(unlinked.drawing.linkedPointFileId, null);
  assert.equal(unlinked.drawing.linkedPointFileProjectId, null);
});
