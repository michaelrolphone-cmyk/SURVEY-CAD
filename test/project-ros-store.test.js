import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchUpsertProjectRos,
  createOrUpdateProjectRos,
  listProjectRos,
} from '../src/project-ros-store.js';

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

test('createOrUpdateProjectRos persists starredInFieldBook and lists it in project summaries', async () => {
  const store = createMockStore();

  const created = await createOrUpdateProjectRos(store, {
    projectId: 'proj-1',
    rosNumber: '12234',
    starredInFieldBook: true,
  });

  assert.equal(created.ros.starredInFieldBook, true);

  const summaries = await listProjectRos(store, 'proj-1');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].starredInFieldBook, true);

  const updated = await createOrUpdateProjectRos(store, {
    projectId: 'proj-1',
    rosId: created.ros.rosId,
    rosNumber: '12234',
    starredInFieldBook: false,
  });

  assert.equal(updated.ros.starredInFieldBook, false);
  const refreshed = await listProjectRos(store, 'proj-1');
  assert.equal(refreshed[0].starredInFieldBook, false);
});

test('batchUpsertProjectRos preserves existing star state when omitted and applies explicit star updates', async () => {
  const store = createMockStore();

  await createOrUpdateProjectRos(store, {
    projectId: 'proj-2',
    rosNumber: '20001',
    starredInFieldBook: true,
  });

  const untouched = await batchUpsertProjectRos(store, 'proj-2', [{ rosNumber: '20001', title: 'ROS 20001' }]);
  assert.equal(untouched.ros[0].starredInFieldBook, true);

  const starredOff = await batchUpsertProjectRos(store, 'proj-2', [{ rosNumber: '20001', starredInFieldBook: false }]);
  assert.equal(starredOff.ros[0].starredInFieldBook, false);
});
