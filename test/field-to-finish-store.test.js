import test from 'node:test';
import assert from 'node:assert/strict';
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
