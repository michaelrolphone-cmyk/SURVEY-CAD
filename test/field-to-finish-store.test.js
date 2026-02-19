import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';
import {
  getFieldToFinishSettings,
  upsertFieldToFinishSettings,
  clearFieldToFinishSettings,
} from '../src/field-to-finish-store.js';

test('field-to-finish store CRUD persists a global shared record', async () => {
  const store = new LocalStorageSyncStore();
  const config = { columns: [], rules: [] };

  const created = await upsertFieldToFinishSettings(store, {
    config,
    symbolSvgOverrides: { spt10: 'monument.svg' },
  });
  assert.equal(created.created, true);
  assert.equal(created.settings.id, 'global');
  assert.equal(created.settings.symbolSvgOverrides.SPT10, 'monument.svg');

  const loaded = await getFieldToFinishSettings(store);
  assert.equal(loaded.id, 'global');

  const deleted = await clearFieldToFinishSettings(store);
  assert.equal(deleted.deleted, true);
  assert.equal(await getFieldToFinishSettings(store), null);
});
