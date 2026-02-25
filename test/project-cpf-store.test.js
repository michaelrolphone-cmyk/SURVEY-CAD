import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchUpsertProjectCpfs,
  createOrUpdateProjectCpf,
  listProjectCpfs,
} from '../src/project-cpf-store.js';

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

test('createOrUpdateProjectCpf persists starredInFieldBook and lists it in project summaries', async () => {
  const store = createMockStore();

  const created = await createOrUpdateProjectCpf(store, {
    projectId: 'proj-1',
    instrument: '2024-12345',
    starredInFieldBook: true,
  });

  assert.equal(created.cpf.starredInFieldBook, true);

  const summaries = await listProjectCpfs(store, 'proj-1');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].starredInFieldBook, true);

  const updated = await createOrUpdateProjectCpf(store, {
    projectId: 'proj-1',
    cpfId: created.cpf.cpfId,
    instrument: '2024-12345',
    starredInFieldBook: false,
  });

  assert.equal(updated.cpf.starredInFieldBook, false);
  const refreshed = await listProjectCpfs(store, 'proj-1');
  assert.equal(refreshed[0].starredInFieldBook, false);
});

test('batchUpsertProjectCpfs preserves existing star state when omitted and applies explicit star updates', async () => {
  const store = createMockStore();

  await createOrUpdateProjectCpf(store, {
    projectId: 'proj-2',
    instrument: '2024-99999',
    starredInFieldBook: true,
  });

  const untouched = await batchUpsertProjectCpfs(store, 'proj-2', [{ instrument: '2024-99999', title: 'CP&F 2024-99999' }]);
  assert.equal(untouched.cpfs[0].starredInFieldBook, true);

  const starredOff = await batchUpsertProjectCpfs(store, 'proj-2', [{ instrument: '2024-99999', starredInFieldBook: false }]);
  assert.equal(starredOff.cpfs[0].starredInFieldBook, false);
});


test('batchUpsertProjectCpfs can overwrite existing project records when requested', async () => {
  const store = createMockStore();

  await batchUpsertProjectCpfs(store, 'proj-overwrite', [{ instrument: '2024-20000' }]);
  await batchUpsertProjectCpfs(store, 'proj-overwrite', [{ instrument: '2024-30000' }], { overwriteExisting: true });

  const summaries = await listProjectCpfs(store, 'proj-overwrite');
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].instrument, '2024-30000');
});
