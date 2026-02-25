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


test('createOrUpdateProjectRos stores source metadata in detail and summary views', async () => {
  const store = createMockStore();
  const metadata = {
    rosSourceId: '6673',
    rosName: 'RS_6673',
    aliquot: 'NW1/4',
    sourceAttributes: {
      OBJECTID: 6673,
      NAME: 'RS_6673',
      ALIQUOT: 'NW1/4',
    },
  };

  const created = await createOrUpdateProjectRos(store, {
    projectId: 'proj-3',
    rosNumber: '6673',
    metadata,
  });

  assert.deepEqual(created.ros.metadata, metadata);

  const summaries = await listProjectRos(store, 'proj-3');
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0].metadata, metadata);
});


test('createOrUpdateProjectRos persists thumbnailUrl without requiring duplication inside metadata', async () => {
  const store = createMockStore();

  const created = await createOrUpdateProjectRos(store, {
    projectId: 'proj-4',
    rosNumber: '70001',
    mapImageUrl: 'https://example.test/ros/R7000101.tif',
    thumbnailUrl: '/api/project-files/ros-thumbnail?source=https%3A%2F%2Fexample.test%2Fros%2FR7000101.tif',
    metadata: { rosName: 'SAMPLE ROS' },
  });

  assert.equal(created.ros.thumbnailUrl, '/api/project-files/ros-thumbnail?source=https%3A%2F%2Fexample.test%2Fros%2FR7000101.tif');

  const summaries = await listProjectRos(store, 'proj-4');
  assert.equal(summaries[0].thumbnailUrl, '/api/project-files/ros-thumbnail?source=https%3A%2F%2Fexample.test%2Fros%2FR7000101.tif');
  assert.deepEqual(summaries[0].metadata, { rosName: 'SAMPLE ROS' });
});


test('batchUpsertProjectRos can overwrite existing project records when requested', async () => {
  const store = createMockStore();

  await batchUpsertProjectRos(store, 'proj-overwrite', [{ rosNumber: '30001' }]);
  await batchUpsertProjectRos(store, 'proj-overwrite', [{ rosNumber: '40001' }], { overwriteExisting: true });

  const summaries = await listProjectRos(store, 'proj-overwrite');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].rosNumber, '40001');
});
