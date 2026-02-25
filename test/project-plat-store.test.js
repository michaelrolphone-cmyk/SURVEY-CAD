import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchUpsertProjectPlats,
  createOrUpdateProjectPlat,
  listProjectPlats,
} from '../src/project-plat-store.js';

function createMockStore(snapshot = {}) {
  const state = { snapshot: { ...snapshot } };
  return {
    getState() {
      return state;
    },
    applyDifferentialBatch({ diffs = [] } = {}) {
      const allOperations = [];
      for (const diff of diffs) {
        for (const operation of diff?.operations || []) {
          allOperations.push(operation);
          if (operation.type === 'set') state.snapshot[operation.key] = operation.value;
          if (operation.type === 'remove') delete state.snapshot[operation.key];
        }
      }
      return { allOperations, state: { version: 1, checksum: 'test' } };
    },
  };
}

test('createOrUpdateProjectPlat persists starredInFieldBook and lists it in project summaries', async () => {
  const store = createMockStore();

  const created = await createOrUpdateProjectPlat(store, {
    projectId: 'proj-1',
    subdivisionName: 'EAGLE ESTATES',
    starredInFieldBook: true,
  });

  assert.equal(created.plat.starredInFieldBook, true);

  const summaries = await listProjectPlats(store, 'proj-1');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].starredInFieldBook, true);

  const updated = await createOrUpdateProjectPlat(store, {
    projectId: 'proj-1',
    platId: created.plat.platId,
    subdivisionName: 'EAGLE ESTATES',
    starredInFieldBook: false,
  });

  assert.equal(updated.plat.starredInFieldBook, false);
  const refreshed = await listProjectPlats(store, 'proj-1');
  assert.equal(refreshed[0].starredInFieldBook, false);
});

test('batchUpsertProjectPlats preserves existing star state when omitted and applies explicit star updates', async () => {
  const store = createMockStore();

  await createOrUpdateProjectPlat(store, {
    projectId: 'proj-2',
    subdivisionName: 'RIVER RUN',
    starredInFieldBook: true,
  });

  const untouched = await batchUpsertProjectPlats(store, 'proj-2', [{ subdivisionName: 'RIVER RUN', title: 'River Run Plat' }]);
  assert.equal(untouched.plats[0].starredInFieldBook, true);

  const starredOff = await batchUpsertProjectPlats(store, 'proj-2', [{ subdivisionName: 'RIVER RUN', starredInFieldBook: false }]);
  assert.equal(starredOff.plats[0].starredInFieldBook, false);
});


test('batchUpsertProjectPlats can overwrite existing project records when requested', async () => {
  const store = createMockStore();

  await batchUpsertProjectPlats(store, 'proj-overwrite', [{ subdivisionName: 'SUNSET ACRES' }]);
  await batchUpsertProjectPlats(store, 'proj-overwrite', [{ subdivisionName: 'PINE RIDGE' }], { overwriteExisting: true });

  const summaries = await listProjectPlats(store, 'proj-overwrite');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].subdivisionName, 'PINE RIDGE');
});
