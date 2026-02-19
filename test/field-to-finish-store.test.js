import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FieldToFinishStore } from '../src/field-to-finish-store.js';

const defaultConfig = {
  columns: [{ key: 'code', name: 'Code' }],
  rules: [{ raw: { code: 'BDY' }, code: 'BDY', processingOn: true }],
};

test('FieldToFinishStore supports shared override CRUD lifecycle', async () => {
  const store = new FieldToFinishStore({
    loadDefaultConfig: async () => defaultConfig,
  });

  const initial = await store.getState();
  assert.equal(initial.source, 'server-default');
  assert.equal(initial.hasOverride, false);
  assert.equal(initial.config.rules[0].code, 'BDY');

  const created = await store.createOverride({
    columns: [{ key: 'code', name: 'Code' }],
    rules: [{ raw: { code: 'ROW' }, code: 'ROW', processingOn: true }],
  });
  assert.equal(created.source, 'api-override');
  assert.equal(created.hasOverride, true);
  assert.equal(created.config.rules[0].code, 'ROW');

  const updated = await store.putOverride({
    columns: [{ key: 'code', name: 'Code' }],
    rules: [{ raw: { code: 'SEC' }, code: 'SEC', processingOn: true }],
  });
  assert.equal(updated.source, 'api-override');
  assert.equal(updated.config.rules[0].code, 'SEC');

  const cleared = await store.deleteOverride();
  assert.equal(cleared.source, 'server-default');
  assert.equal(cleared.hasOverride, false);
  assert.equal(cleared.config.rules[0].code, 'BDY');
});


test('FieldToFinishStore persists shared overrides to disk for cross-session visibility', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fld-store-'));
  const overrideFilePath = path.join(tempDir, 'field-to-finish-override.json');

  const firstStore = new FieldToFinishStore({
    loadDefaultConfig: async () => defaultConfig,
    overrideFilePath,
  });

  const putState = await firstStore.putOverride({
    columns: [{ key: 'code', name: 'Code' }],
    rules: [{ raw: { code: 'ROW' }, code: 'ROW', processingOn: true }],
  });
  assert.equal(putState.source, 'api-override');

  const persistedRaw = await readFile(overrideFilePath, 'utf8');
  const persisted = JSON.parse(persistedRaw);
  assert.equal(persisted.overrideConfig.rules[0].code, 'ROW');

  const secondStore = new FieldToFinishStore({
    loadDefaultConfig: async () => defaultConfig,
    overrideFilePath,
  });
  const loadedState = await secondStore.getState();
  assert.equal(loadedState.hasOverride, true);
  assert.equal(loadedState.config.rules[0].code, 'ROW');

  await secondStore.deleteOverride();
  await assert.rejects(stat(overrideFilePath), /ENOENT/);
});
