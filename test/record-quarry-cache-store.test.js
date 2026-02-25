import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageSyncStore } from '../src/localstorage-sync-store.js';
import {
  saveAddressRecordQuarryCache,
  getAddressRecordQuarryCache,
  saveProjectRecordQuarryCache,
  getProjectRecordQuarryCache,
} from '../src/record-quarry-cache-store.js';

test('saveAddressRecordQuarryCache stores only coordinate summary (no parcel/address geometry payload)', async () => {
  const store = new LocalStorageSyncStore();

  await saveAddressRecordQuarryCache(store, '100 Main St Boise', {
    lookup: {
      geocode: { lat: 43.61, lon: -116.2, display: '100 Main St, Boise, ID' },
      location: { lon: -116.2, lat: 43.61 },
      addressFeature: {
        attributes: { ADDRNUM: '100', STREETNAME: 'MAIN' },
        geometry: { x: -116.2, y: 43.61 },
      },
      parcel: {
        attributes: { PARCEL: 'R12345' },
        geometry: { rings: [[[-116.21, 43.60], [-116.19, 43.60], [-116.19, 43.62], [-116.21, 43.62], [-116.21, 43.60]]] },
      },
      section: {
        attributes: { SEC: 1 },
        geometry: { rings: [[[-116.21, 43.60], [-116.19, 43.60], [-116.19, 43.62], [-116.21, 43.62], [-116.21, 43.60]]] },
      },
      ros: [{ attributes: { ROS: '12-34' }, geometry: { x: -116.2, y: 43.6105 } }],
    },
    selection: { selectedParcel: true },
  });

  const cache = await getAddressRecordQuarryCache(store, '100 Main St Boise');
  assert.deepEqual(cache.lookup, {
    location: { lon: -116.2, lat: 43.61 },
    geocode: { lat: 43.61, lon: -116.2, display: '100 Main St, Boise, ID' },
  });
  assert.equal(cache.lookup.parcel, undefined);
  assert.equal(cache.lookup.addressFeature, undefined);
});

test('saveProjectRecordQuarryCache retains full lookup payload for project-scoped cache workflows', async () => {
  const store = new LocalStorageSyncStore();
  const lookup = {
    geocode: { lat: 43.61, lon: -116.2 },
    location: { lon: -116.2, lat: 43.61 },
    parcel: { attributes: { PARCEL: 'R12345' }, geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
  };

  await saveProjectRecordQuarryCache(store, 'project-1', {
    address: '100 Main St Boise',
    lookup,
    selection: { selectedParcel: true },
  });

  const cache = await getProjectRecordQuarryCache(store, 'project-1');
  assert.deepEqual(cache.lookup, lookup);
});
